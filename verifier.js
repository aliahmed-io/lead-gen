const dns = require('dns').promises;

const DNS_TIMEOUT_MS = 5000;

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

/**
 * Validates the basic syntax of an email address.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidSyntax(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Checks whether the email's domain is a known disposable email provider.
 *
 * @param {string} domain
 * @returns {boolean}
 */
function isDisposableDomain(domain) {
  return DISPOSABLE_DOMAINS.includes(domain.toLowerCase());
}

/**
 * Checks whether the email is a role-based address (noreply, postmaster, etc.).
 *
 * @param {string} email
 * @returns {boolean}
 */
function isRoleBasedEmail(email) {
  const lower = email.toLowerCase();
  return ROLE_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Checks if the domain has active MX (Mail Exchange) records.
 * Enforces a 5-second DNS timeout to prevent hanging on slow resolvers.
 *
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
async function hasValidMxRecord(domain) {
  let timeoutId;
  try {
    const mxLookup = dns.resolveMx(domain);
    mxLookup.catch(() => {}); // prevent unhandled promise rejection if timeout wins

    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('DNS lookup timed out')), DNS_TIMEOUT_MS);
    });

    const records = await Promise.race([mxLookup, timeout]);
    return records && records.length > 0;
  } catch (err) {
    return false;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Performs a comprehensive local verification on an email address.
 *
 * Checks:
 *   1. Non-empty string type
 *   2. Valid RFC-style syntax
 *   3. Not a role-based address (noreply, postmaster, etc.)
 *   4. Not from a disposable email domain
 *   5. Domain has active MX records (with 5-second timeout)
 *
 * @param {string} email
 * @returns {Promise<{ valid: boolean, reason: string }>}
 */
async function verifyEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Empty or invalid type' };
  }

  const cleanEmail = email.toLowerCase().trim();

  if (!isValidSyntax(cleanEmail)) {
    return { valid: false, reason: 'Invalid syntax' };
  }

  if (isRoleBasedEmail(cleanEmail)) {
    return { valid: false, reason: 'Role-based email address' };
  }

  const parts = cleanEmail.split('@');
  const domain = parts[1];

  if (isDisposableDomain(domain)) {
    return { valid: false, reason: `Disposable email domain: ${domain}` };
  }

  const isMxValid = await hasValidMxRecord(domain);
  if (!isMxValid) {
    return { valid: false, reason: `No active mail server found for domain ${domain}` };
  }

  return { valid: true, reason: 'Valid syntax and active MX record' };
}

module.exports = { verifyEmail };
