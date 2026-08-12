// @ts-check
/**
 * @module emailPatternEnricher
 * @description Person-first owner discovery pipeline for leads WITHOUT emails.
 *
 * It is deliberately DIFFERENT from the scraper's website HTML scrape
 * (emailFinder.js): the scraper harvests everything the scraper job finds
 * while crawling for businesses. This pipeline runs on demand per lead and
 * chains four stages to maximize the chance of finding the OWNER's personal
 * email, not just info@:
 *
 *   Stage 1 — websiteHarvester: deep crawl of about/team/contact pages for
 *     emails AND person names near owner-ish role keywords (JSON-LD Person,
 *     h-cards, "Meet our owner John Smith" text, title hints).
 *   Stage 2 — ownerResolver: public search-engine lookups
 *     ("[business]" [city] owner) to find the human behind the business.
 *   Stage 3 — name-pattern derivation + SMTP verification: for each ranked
 *     person, generate john@, john.smith@, j.smith@, johnsmith@, jsmith@ and
 *     confirm the mailbox with a raw RCPT TO handshake (no email sent).
 *   Stage 4 — fallback ladder: verified generic patterns (owner@, hello@,
 *     info@...), then best-effort generic guess if the server blocks probes.
 *
 * The first verified PERSONAL email wins. Confidence and source metadata
 * travel with the result so the dashboard can grade lead quality.
 *
 * Usage:
 *   const { enrichLead, enrichLeads } = require('./emailPatternEnricher');
 *   const res = await enrichLead({ name: 'Acme', website: 'https://acme.com', city: 'Austin', state: 'TX' });
 *   // res = { found, email, method, smtpValid, confidence, source, ownerName, tried, stages }
 */
const dns = require('dns').promises;
const { harvestWebsite } = require('./websiteHarvester');
const { resolveOwnerIdentity, nameVariants } = require('./ownerResolver');

/* ------------------------------------------------------------------ */
/*  MX lookup                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  SMTP probe                                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Domain helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {string} website
 * @returns {string}
 */
function domainFrom(website) {
  try {
    const u = website.startsWith('http') ? new URL(website) : new URL(`https://${website}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/*  Verification of derived candidates                                */
/* ------------------------------------------------------------------ */

/**
 * Verify personal-pattern candidates derived from an owner candidate's name.
 * @param {string} personName
 * @param {string} domain
 * @param {string} mxHost
 * @param {Set<string>} tried
 * @returns {Promise<{email: string|null, method: string}>}
 */
async function verifyNameCandidates(personName, domain, mxHost, tried) {
  const base = nameVariants(personName);
  for (const v of base) {
    /* variants that end with @ (first.last@) get the domain appended */
    const candidate = v.endsWith('@') ? `${v}${domain}` : `${v}@${domain}`;
    tried.add(candidate);
    try {
      const probe = await smtpProbe(candidate, mxHost);
      if (probe.valid) return { email: candidate, method: 'owner_verified' };
    } catch {
      /* keep trying */
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return { email: null, method: '' };
}

/* ------------------------------------------------------------------ */
/*  Generic pattern probing (fallback stage)                          */
/* ------------------------------------------------------------------ */

const PERSONAL_PATTERNS = [
  'owner', 'founder', 'ceo', 'hello', 'admin', 'mail', 'office',
  'manager', 'info2', 'team', 'staff', 'reception', 'bookings', 'reserve',
];

/**
 * @param {import('./websiteHarvester').HarvestResult} harvest
 * @returns {string[]}
 */
function genericCandidates(harvest) {
  /** @type {string[]} */
  const out = [];
  /* emails already published on the site (non-role ones) are the best signals */
  for (const e of harvest.emails) {
    if (e.includes('@') && !out.includes(e)) out.push(e);
  }
  for (const prefix of PERSONAL_PATTERNS) {
    out.push(`${prefix}@${harvest.domain}`);
  }
  for (const e of harvest.roleEmails) {
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} EnrichLeadInput
 * @property {string} [name]
 * @property {string} [businessName]
 * @property {string} [website]
 * @property {string} [email]
 * @property {string} [city]
 * @property {string} [state]
 */

/**
 * @typedef {Object} EnrichResult
 * @property {boolean} found
 * @property {string} [email]
 * @property {string} method - 'owner_verified' | 'site_email_verified' | 'pattern_smtp' | 'role_guess' | 'none'
 * @property {boolean} smtpValid
 * @property {number} confidence - 0..100
 * @property {string} source - 'owner_name' | 'website' | 'search' | 'pattern' | 'guess' | 'none'
 * @property {string} [ownerName]
 * @property {string[]} tried
 * @property {string[]} stages - pipeline stages that actually ran
 */

/**
 * Run the full owner-discovery pipeline for one lead.
 * @param {EnrichLeadInput} lead
 * @returns {Promise<EnrichResult>}
 */
async function enrichLead(lead) {
  /** @type {string[]} */
  const stages = [];
  const tried = new Set();
  const website = (lead.website || '').trim();
  if (!website) return { found: false, method: 'none', smtpValid: false, confidence: 0, source: 'none', tried: [], stages };

  const domain = domainFrom(website);
  if (!domain) return { found: false, method: 'none', smtpValid: false, confidence: 0, source: 'none', tried: [], stages };

  /* Step 0: the domain must accept mail at all */
  const mx = await getMxRecords(domain);
  if (!mx || mx.length === 0) {
    return { found: false, method: 'none', smtpValid: false, confidence: 0, source: 'none', tried: [], stages: ['mx_check_failed'] };
  }
  stages.push('mx_ok');
  const host = mx[0].exchange;

  /* Step 1: deep website harvest */
  let harvest;
  try {
    harvest = await harvestWebsite({ website, name: lead.name || '', businessName: lead.businessName || '', city: lead.city || '', state: lead.state || '' });
    stages.push('website_harvest');
  } catch {
    harvest = { emails: [], roleEmails: [], persons: [], pagesVisited: 0, domain };
  }

  /* Step 2: owner identity resolution */
  let persons;
  try {
    persons = await resolveOwnerIdentity({ website, name: lead.name || '', businessName: lead.businessName || '', city: lead.city || '', state: lead.state || '', persons: harvest.persons });
    if (persons.length > 0) stages.push('owner_identified');
  } catch {
    persons = harvest.persons.map(p => ({ name: p.name, role: p.role, source: 'website_text', confidence: p.confidence }));
  }

  /* Step 3: verify name-derived candidates for each ranked person */
  /** @type {{ email: string|null, method: string, confidence: number, source: string, ownerName: string }} */
  let best = { email: null, method: '', confidence: 0, source: '', ownerName: '' };
  for (const p of persons) {
    const derived = await verifyNameCandidates(p.name, domain, host, tried);
    if (derived.email) {
      best = {
        email: derived.email,
        method: derived.method,
        confidence: Math.min(100, p.confidence + 10),
        source: p.source === 'search' ? 'search' : 'owner_name',
        ownerName: p.name,
      };
      break; /* first verified personal email wins */
    }
  }
  if (best.email) {
    return {
      found: true, email: best.email, method: best.method, smtpValid: true,
      confidence: best.confidence, source: best.source, ownerName: best.ownerName,
      tried: Array.from(tried), stages,
    };
  }

  /* Step 4a: site-discovered personal emails — verify them */
  for (const e of harvest.emails) {
    tried.add(e);
    try {
      const probe = await smtpProbe(e, host);
      if (probe.valid) {
        return { found: true, email: e, method: 'site_email_verified', smtpValid: true, confidence: 60, source: 'website', tried: Array.from(tried), stages };
      }
    } catch { /* continue */ }
  }
  stages.push('fallback_probe');

  /* Step 4b: generic pattern ladder */
  for (const c of genericCandidates(harvest)) {
    if (tried.has(c)) continue;
    tried.add(c);
    try {
      const probe = await smtpProbe(c, host);
      if (probe.valid) {
        const isRole = /^(info|contact|sales|support|hello|admin|mail|office|team|staff)\b/i.test(c);
        return {
          found: true, email: c, method: 'pattern_smtp', smtpValid: true,
          confidence: isRole ? 50 : 65, source: 'pattern', tried: Array.from(tried), stages,
        };
      }
    } catch { /* continue */ }
  }

  /* Step 4c: server blocked probes — best-effort generic guess */
  const all = genericCandidates(harvest);
  const generic = all.find(c => /^(info|contact|hello|admin)\b@/i.test(c)) || all[0] || `${domain}@${domain}`;
  return {
    found: true, email: generic, method: 'role_guess', smtpValid: false,
    confidence: 30, source: 'guess', tried: Array.from(tried), stages,
  };
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
    if (result.found && result.email && typeof onFound === 'function') onFound(result.email, done, leads.length);
    results.push(result);
    done++;
    /* polite pacing — DNS/SMTP/search servers dislike bursts */
    await new Promise(r => setTimeout(r, 250));
  }
  return results;
}

module.exports = { enrichLead, enrichLeads, getMxRecords, smtpProbe };
