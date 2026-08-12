const dns = require('dns').promises;
const net = require('net');

const DNS_TIMEOUT_MS = 5000;
const SMTP_TIMEOUT_MS = 8000;

// ── Senders domain used in EHLO/MAIL FROM during probe ───────────────────────
// Using your primary domain — this is never actually sent to, just declared.
const PROBE_FROM_DOMAIN = 'tryaethelon.com';
const PROBE_FROM = `verify@${PROBE_FROM_DOMAIN}`;

const DISPOSABLE_DOMAINS = [
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.net',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamailblock.com',
  'pokemail.net',
  'spam4.me',
  'trashmail.com',
  'trashmail.me',
  'trashmail.net',
  'dispostable.com',
  'mailnesia.com',
  'maildrop.cc',
  'fakeinbox.com',
  'tempail.com',
  'temp-mail.org',
  'temp-mail.io',
  'mohmal.com',
  'getnada.com',
  'emailondeck.com',
  'mintemail.com',
  'harakirimail.com',
  'jetable.org',
  'mytemp.email',
  'safetymail.info',
  'filzmail.com',
  '10minutemail.com',
  'tempinbox.com',
  'mailcatch.com',
  'meltmail.com',
];

const ROLE_PREFIXES = [
  'noreply@',
  'no-reply@',
  'donotreply@',
  'do-not-reply@',
  'mailer-daemon@',
  'postmaster@',
];

// ─── Step 1: Syntax ──────────────────────────────────────────────────────────

/**
 * Validates the basic syntax of an email address.
 * @param {string} email
 * @returns {boolean}
 */
function isValidSyntax(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

// ─── Step 2: Role-based filter ───────────────────────────────────────────────

/**
 * Checks whether the email is a role-based address (noreply, postmaster, etc.).
 * @param {string} email
 * @returns {boolean}
 */
function isRoleBasedEmail(email) {
  const lower = email.toLowerCase();
  return ROLE_PREFIXES.some(prefix => lower.startsWith(prefix));
}

// ─── Step 3: Disposable domain filter ───────────────────────────────────────

/**
 * Checks whether the email's domain is a known disposable email provider.
 * @param {string} domain
 * @returns {boolean}
 */
function isDisposableDomain(domain) {
  return DISPOSABLE_DOMAINS.includes(domain.toLowerCase());
}

// ─── Step 4 & 5: MX Lookup (returns records for reuse in SMTP ping) ─────────

/**
 * Resolves MX records for a domain with a 5-second timeout.
 * Returns sorted records (lowest priority number = highest priority) or null.
 * @param {string} domain
 * @returns {Promise<Array<{exchange: string, priority: number}>|null>}
 */
async function getMxRecords(domain) {
  let timeoutId;
  try {
    const mxLookup = dns.resolveMx(domain);
    mxLookup.catch(() => {}); // prevent unhandled rejection if timeout wins

    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('DNS lookup timed out')),
        DNS_TIMEOUT_MS
      );
    });

    const records = await Promise.race([mxLookup, timeout]);
    if (!records || records.length === 0) return null;
    // Sort by priority ascending (lower = higher preference)
    return /** @type {Array<{ exchange: string; priority: number }>} */ (records).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ─── Step 6: SMTP Handshake Ping ────────────────────────────────────────────

/**
 * Probes a single MX host via raw TCP SMTP handshake.
 * Executes: EHLO → MAIL FROM → RCPT TO → RSET → QUIT
 * Never sends actual email. Aborts at RSET before DATA.
 *
 * Returns:
 *  { attempted: true,  valid: true,  catchAll: false, reason }  → mailbox confirmed
 *  { attempted: true,  valid: false, catchAll: false, reason }  → mailbox rejected (5xx)
 *  { attempted: false, valid: true,  catchAll: false, reason }  → server blocked probe → treat as valid
 *
 * @param {string} targetEmail
 * @param {string} mxHost
 * @returns {Promise<{attempted: boolean, valid: boolean, catchAll: boolean, reason: string}>}
 */
function attemptSmtpPing(targetEmail, mxHost) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let stage = 'connect';
    let buf = '';
    let settled = false;

    /**
     * Resolve once, destroy socket.
     * @param {{ attempted: boolean, valid: boolean, catchAll: boolean, reason: string }} result
     */
    const done = result => {
      if (settled) return;
      settled = true;
      try { socket.write('QUIT\r\n'); } catch (_e) { /* best-effort QUIT */ }
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(SMTP_TIMEOUT_MS);
    socket.on('timeout', () =>
      done({ attempted: false, valid: true, catchAll: false, reason: 'SMTP timeout — accepted on MX basis' })
    );
    socket.on('error', () =>
      done({ attempted: false, valid: true, catchAll: false, reason: 'SMTP connection error — accepted on MX basis' })
    );

    socket.on('data', chunk => {
      buf += chunk.toString('ascii');

      // Process all complete lines in buffer
      let idx;
      while ((idx = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        if (!line) continue;

        const code = parseInt(line.slice(0, 3), 10);
        // Multi-line responses use "250-" (dash). Only act on the LAST line "250 " (space).
        const isFinalLine = line.length > 3 && line[3] === ' ';

        if (stage === 'connect') {
          if (code === 220 && isFinalLine) {
            stage = 'ehlo';
            socket.write(`EHLO ${PROBE_FROM_DOMAIN}\r\n`);
          } else if (code >= 400) {
            done({ attempted: false, valid: true, catchAll: false, reason: `Banner rejected (${code}) — accepted on MX basis` });
          }

        } else if (stage === 'ehlo') {
          // Wait for final line of EHLO response (250 with space, not dash)
          if (isFinalLine && code === 250) {
            stage = 'mail_from';
            socket.write(`MAIL FROM:<${PROBE_FROM}>\r\n`);
          } else if (isFinalLine && code >= 500) {
            done({ attempted: false, valid: true, catchAll: false, reason: `EHLO rejected (${code}) — accepted on MX basis` });
          }

        } else if (stage === 'mail_from') {
          if (code === 250) {
            stage = 'rcpt_to';
            socket.write(`RCPT TO:<${targetEmail}>\r\n`);
          } else {
            // Server rejected MAIL FROM (policy, greylisting, etc.) — don't discard lead
            done({ attempted: false, valid: true, catchAll: false, reason: `MAIL FROM rejected (${code}) — accepted on MX basis` });
          }

        } else if (stage === 'rcpt_to') {
          stage = 'done';
          socket.write('RSET\r\n'); // never send DATA — abort cleanly

          if (code === 250 || code === 251) {
            // 250 = OK, 251 = forwarded (still valid)
            done({ attempted: true, valid: true, catchAll: false, reason: `Mailbox confirmed by mail server (SMTP ${code})` });
          } else if (code >= 550 && code <= 554) {
            // Hard rejection codes:
            // 550 = mailbox unavailable / user unknown
            // 551 = user not local
            // 552 = mailbox full (treat as invalid for cold outreach)
            // 553 = mailbox name not allowed
            // 554 = transaction failed
            done({ attempted: true, valid: false, catchAll: false, reason: `Mailbox rejected by mail server (SMTP ${code} — user unknown or invalid)` });
          } else if (code === 421 || code === 450 || code === 452) {
            // Temp failures — server busy, not evidence of invalid mailbox
            done({ attempted: false, valid: true, catchAll: false, reason: `Server temporarily unavailable (${code}) — accepted on MX basis` });
          } else {
            // Anything else — unknown/ambiguous; treat as valid to avoid false negatives
            done({ attempted: false, valid: true, catchAll: false, reason: `Ambiguous SMTP response (${code}) — accepted on MX basis` });
          }
        }
      }
    });

    // Connect to port 25 (standard SMTP for MX verification)
    socket.connect(25, mxHost);
  });
}

/**
 * Attempts SMTP ping against the top 2 MX hosts for a domain.
 * Falls back gracefully if all attempts are blocked or fail.
 *
 * @param {string} email
 * @param {Array<{exchange: string, priority: number}>} mxRecords
 * @returns {Promise<{ valid: boolean, definitive: boolean, reason: string }>}
 */
async function smtpPing(email, mxRecords) {
  // Try up to 2 MX hosts (top priority first)
  for (const mx of mxRecords.slice(0, 2)) {
    const result = await attemptSmtpPing(email, mx.exchange);
    if (result.attempted) {
      // Got a definitive answer from this server
      return { valid: result.valid, definitive: true, reason: result.reason };
    }
    // Server blocked probe — try next MX
  }
  // All probes blocked — cannot determine, treat as valid (no false negatives)
  return { valid: true, definitive: false, reason: 'SMTP probe blocked by all MX hosts — accepted on MX basis' };
}

// ─── Main verifyEmail ────────────────────────────────────────────────────────

/**
 * Performs comprehensive email verification before first contact.
 *
 * Steps:
 *   1. Non-empty string type check
 *   2. RFC-style syntax validation
 *   3. Role-based address check (noreply, postmaster, etc.)
 *   4. Disposable email domain check
 *   5. Active MX record lookup (domain must have a mail server)
 *   6. SMTP handshake ping (mailbox existence — skipped gracefully if server blocks)
 *
 * @param {string} email
 * @returns {Promise<{ valid: boolean, reason: string, smtpChecked: boolean }>}
 */
async function verifyEmail(email) {
  // Step 1 — Type & empty
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Empty or invalid type', smtpChecked: false };
  }

  const cleanEmail = email.toLowerCase().trim();

  // Step 2 — Syntax
  if (!isValidSyntax(cleanEmail)) {
    return { valid: false, reason: 'Invalid syntax', smtpChecked: false };
  }

  // Step 3 — Role-based
  if (isRoleBasedEmail(cleanEmail)) {
    return { valid: false, reason: 'Role-based email address', smtpChecked: false };
  }

  const domain = cleanEmail.split('@')[1];

  // Step 4 — Disposable
  if (isDisposableDomain(domain)) {
    return { valid: false, reason: `Disposable email domain: ${domain}`, smtpChecked: false };
  }

  // Step 5 — MX Records
  const mxRecords = await getMxRecords(domain);
  if (!mxRecords) {
    return { valid: false, reason: `No active mail server found for domain: ${domain}`, smtpChecked: false };
  }

  // Step 6 — SMTP Ping (best-effort; never blocks on failure)
  try {
    const ping = await smtpPing(cleanEmail, mxRecords);
    if (!ping.valid) {
      return { valid: false, reason: ping.reason, smtpChecked: true };
    }
    return {
      valid: true,
      reason: ping.definitive
        ? ping.reason
        : 'Valid syntax and active MX record (SMTP probe inconclusive)',
      smtpChecked: ping.definitive,
    };
  } catch {
    // SMTP ping threw unexpectedly — never fail the lead because of our own error
    return { valid: true, reason: 'Valid syntax and active MX record (SMTP probe error — skipped)', smtpChecked: false };
  }
}

module.exports = { verifyEmail };
