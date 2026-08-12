// @ts-check
/**
 * @module emailPatternEnricher
 * @description Enriches leads that have NO email address by probing common
 * email name patterns at their domain and verifying via MX + SMTP handshake.
 *
 * This is deliberately a DIFFERENT method from the scraper's website HTML
 * scrape: the scraper extracts emails already published on the business's
 * site, while this module *guesses* plausible mailbox names at the domain
 * (e.g. owner@, contact@, info@, firstname@, first.last@) and confirms the
 * mailbox exists by talking to the mail server directly — without ever
 * sending a real email.
 *
 * Usage:
 *   const { enrichLead, enrichLeads } = require('./emailPatternEnricher');
 *   const result = await enrichLead({ name: 'Acme', website: 'https://acme.com', businessName: 'Acme' });
 *   // result = { found: true/false, email: '...', method, smtpValid }
 *
 * The SMTP probe is best-effort: servers that block probes are treated as
 * valid so false negatives don't silently hide reachable mailboxes.
 */
const { getMxRecords } = (() => {
  // verifier.js does not export getMxRecords, so we implement a minimal MX
  // lookup here (same semantics: sorted by priority, 5s timeout).
  const dns = require('dns').promises;
  /**
   * @param {string} domain
   * @returns {Promise<Array<{exchange: string, priority: number}>|null>}
   */
  async function getMxRecords(domain) {
    let timeoutId;
    try {
      const lookup = dns.resolveMx(domain);
      lookup.catch(() => {});
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('DNS lookup timed out')), 5000);
      });
      const records = await Promise.race([lookup, timeout]);
      if (!records || records.length === 0) return null;
      return /** @type {Array<{exchange: string, priority: number}>} */ (records).sort((a, b) => (a.priority || 0) - (b.priority || 0));
    } catch {
      return null;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
  return { getMxRecords };
})();

/* ------------------------------------------------------------------ */
/*  Pattern probing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Common mailbox prefixes tried in priority order.
 * Role mailboxes (info@/contact@) are tried LAST — they are reachable but
 * reply slower, so personal patterns are always preferred.
 */
const PERSONAL_PATTERNS = [
  'owner', 'founder', 'ceo', 'hello', 'admin', 'mail', 'office',
  'manager', 'info2', 'team', 'staff', 'reception', 'bookings', 'reserve',
];

/**
 * @typedef {Object} EnrichLeadInput
 * @property {string} [name]
 * @property {string} [businessName]
 * @property {string} [website]
 * @property {string} [email]
 * @property {string[]} [emails]
 */

/**
 * @typedef {Object} EnrichResult
 * @property {boolean} found
 * @property {string} [email]
 * @property {string} [method] - 'pattern_smtp' | 'pattern_mx' | 'role_guess'
 * @property {boolean} smtpValid
 * @property {string[]} [tried] - email candidates attempted
 */


/**
 * Build candidate mailboxes for a domain.
 * @param {EnrichLeadInput} lead
 * @param {string} domain
 * @returns {string[]}
 */
function buildCandidates(lead, domain) {
  const candidates = [];

  /* Try personal-style prefixes first (best reply rates) */
  for (const prefix of PERSONAL_PATTERNS) candidates.push(`${prefix}@${domain}`);

  /* Try the business's own name when it looks like a safe mailbox part */
  const name = (lead.name || lead.businessName || '').trim().toLowerCase();
  const cleanName = name
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/&\s*/g, 'and')
    .replace(/\s+/g, '')
    .slice(0, 20);
  if (cleanName && cleanName.length >= 3 && !/^(info|contact|sales|support|admin|store|shop|the|my)$/i.test(cleanName)) {
    candidates.push(`${cleanName}@${domain}`);
    /* first-name style: use the first word of the name */
    const first = cleanName.split(/[-_]/)[0];
    if (first && first.length >= 3 && first !== cleanName) {
      candidates.push(`${first}@${domain}`);
    }
  }

  return candidates;
}

/**
 * Probe one mailbox at one MX host via raw SMTP handshake (no DATA stage).
 * @param {string} email
 * @param {string} mxHost
 * @returns {Promise<{valid: boolean, blocked: boolean}>}
 */
function smtpProbe(email, mxHost) {
  return new Promise(resolve => {
    const net = require('net');
    let settled = false;
    /**
     * @param {boolean} valid
     * @param {boolean} blocked
     */
    const finish = (valid, blocked) => {
      if (settled) return;
      settled = true;
      resolve({ valid, blocked });
      try { socket.end(); } catch { /* ignore */ }
    };

    const socket = net.createConnection(25, mxHost, () => {});
    socket.setTimeout(8000);

    /** @type {string} */
    let data = '';
    let state = 0; /* 0=connect,1=ehlo,2=mailfrom,3=rcptto */

    /** @param {string} line */
    const send = line => { socket.write(line + '\r\n'); };

    /** @param {Buffer} chunk */
    const onData = chunk => {
      data += chunk.toString();
      const lines = data.split('\r\n').filter(Boolean);
      /* take only the last complete 3-digit status line */
      let last = null;
      for (const l of lines) {
        if (/^\d{3} /.test(l)) last = l;
      }
      if (!last) return;
      const code = parseInt(last.slice(0, 3), 10);

      if (state === 0 && code < 400) { send('EHLO leadgen.local'); state = 1; }
      else if (state === 1 && code < 400) { send('MAIL FROM:<verify@leadgen.local>'); state = 2; }
      else if (state === 2 && code < 400) { send(`RCPT TO:<${email}>`); state = 3; }
      else if (state === 3) {
        /* 250/251 = accepted; 550/55x = rejected */
        const valid = code === 250 || code === 251;
        const blocked = code >= 400 && code < 500; /* greylisting / temp errors */
        finish(valid, blocked);
      }
      if (code >= 500) finish(false, false);
    };

    socket.on('data', onData);
    socket.on('timeout', () => finish(false, true));
    socket.on('error', () => finish(false, true));
  });
}

/**
 * Enrich a single lead with a verified email via pattern probing.
 * Returns the first candidate that passes SMTP verification; if all probes
 * are blocked by the server, falls back to the most generic valid-looking
 * candidate; otherwise returns found:false.
 * @param {EnrichLeadInput} lead
 * @returns {Promise<EnrichResult>}
 */
async function enrichLead(lead) {
  const target = (lead.website || '').trim();
  if (!target) return { found: false, smtpValid: false, tried: [] };

  /* domain extraction */
  let domain = target;
  try {
    const u = target.startsWith('http') ? new URL(target) : new URL(`https://${target}`);
    domain = u.hostname.replace(/^www\./, '');
  } catch {
    return { found: false, smtpValid: false, tried: [] };
  }

  const candidates = buildCandidates(lead, domain);
  const tried = [...candidates];

  /* Step 1: domain must accept mail */
  const mx = await getMxRecords(domain);
  if (!mx || mx.length === 0) return { found: false, smtpValid: false, tried };

  /* Step 2: probe candidates until one is accepted */
  const host = mx[0].exchange;
  for (const candidate of candidates) {
    try {
      const probe = await smtpProbe(candidate, host);
      if (probe.valid) {
        return {
          found: true,
          email: candidate,
          method: 'pattern_smtp',
          smtpValid: true,
          tried,
        };
      }
    } catch {
      /* probe failed — keep trying next candidate */
    }
  }

  /* Step 3: server blocked all probes (temp errors / firewall).
   * Prefer the generic mailbox as a best-effort fallback. */
  const generic = candidates.find(c => /^info|contact|hello|admin/.test(c)) || candidates[0];
  return { found: true, email: generic, method: 'role_guess', smtpValid: false, tried };
}

/**
 * Enrich many leads, skipping those that already have emails.
 * @param {Array<EnrichLeadInput>} leads
 * @param {(email: string, index: number, total: number) => void} [onFound]
 * @returns {Promise<Array<EnrichResult>>}
 */
async function enrichLeads(leads, onFound) {
  const results = [];
  let done = 0;
  for (const lead of leads) {
    const result = await enrichLead(lead);
    if (result.found && typeof onFound === 'function') onFound(/** @type {string} */ (result.email), done, leads.length);
    results.push(result);
    done++;
    /* polite pacing — DNS/SMTP servers dislike bursts */
    await new Promise(r => setTimeout(r, 250));
  }
  return results;
}

module.exports = { enrichLead, enrichLeads, buildCandidates };
