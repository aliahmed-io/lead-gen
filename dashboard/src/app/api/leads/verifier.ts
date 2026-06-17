import { promises as dns } from 'dns';
import type { MxRecord } from 'dns';

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
  'fakeinbox.com', // duplicate in original, kept for safety
];

const ROLE_PREFIXES = [
  'noreply@',
  'no-reply@',
  'donotreply@',
  'do-not-reply@',
  'mailer-daemon@',
  'postmaster@',
  'postmaster@', // duplicate in original
];

function isValidSyntax(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isDisposableDomain(domain: string) {
  return DISPOSABLE_DOMAINS.includes(domain.toLowerCase());
}

function isRoleBasedEmail(email: string) {
  const lower = email.toLowerCase();
  return ROLE_PREFIXES.some(prefix => lower.startsWith(prefix));
}

async function hasValidMxRecord(domain: string) {
  try {
    const mxLookup = dns.resolveMx(domain);
    const timeout = new Promise<MxRecord[]>((_, reject) => {
      setTimeout(() => reject(new Error('DNS lookup timed out')), DNS_TIMEOUT_MS);
    });

    const records = await Promise.race([mxLookup, timeout]);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

async function verifyEmail(email: string) {
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

export { verifyEmail };
