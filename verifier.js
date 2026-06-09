const dns = require('dns').promises;

/**
 * Validates the basic syntax of an email address.
 */
function isValidSyntax(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Checks if the domain has active MX (Mail Exchange) records.
 * If a domain has no MX records, it cannot receive email.
 */
async function hasValidMxRecord(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch (err) {
    // If the query fails (e.g., ENOTFOUND, ENODATA), the domain likely has no mail servers.
    return false;
  }
}

/**
 * Performs a local verification on an email address.
 * 1. Checks syntax.
 * 2. Extracts domain and checks for active MX records.
 * 
 * Returns { valid: boolean, reason: string }
 */
async function verifyEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Empty or invalid type' };
  }

  const cleanEmail = email.toLowerCase().trim();

  // 1. Syntax Check
  if (!isValidSyntax(cleanEmail)) {
    return { valid: false, reason: 'Invalid syntax' };
  }

  // 2. Extract Domain
  const parts = cleanEmail.split('@');
  const domain = parts[1];

  // 3. DNS MX Check
  const isMxValid = await hasValidMxRecord(domain);
  if (!isMxValid) {
    return { valid: false, reason: `No active mail server found for domain ${domain}` };
  }

  return { valid: true, reason: 'Valid syntax and active MX record' };
}

module.exports = { verifyEmail };
