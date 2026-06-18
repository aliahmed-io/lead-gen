require('dotenv').config();
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set in .env — cannot encrypt/decrypt passwords.');
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 * Returns a base64-encoded string: IV + AuthTag + CipherText
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts a base64-encoded AES-256-GCM encrypted string.
 */
function decrypt(encryptedBase64) {
  const buffer = Buffer.from(encryptedBase64, 'base64');
  const iv = buffer.slice(0, IV_LENGTH);
  const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

/**
 * Returns true if the string looks like an encrypted base64 blob (not plain text).
 */
function isEncrypted(value) {
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length > IV_LENGTH + TAG_LENGTH;
  } catch {
    return false;
  }
}

module.exports = { encrypt, decrypt, isEncrypted };
