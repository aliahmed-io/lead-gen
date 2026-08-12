require('dotenv').config();
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set in .env — cannot encrypt/decrypt passwords.');
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 * Returns a string prefixed with 'ENC:' followed by the base64-encoded: IV + AuthTag + CipherText
 */
/**
 * @param {string} text
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const base64 = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return `ENC:${base64}`;
}

/**
 * Decrypts an 'ENC:' prefixed base64-encoded AES-256-GCM encrypted string.
 */
/**
 * @param {string} encryptedString
 */
function decrypt(encryptedString) {
  if (!isEncrypted(encryptedString)) {
    throw new Error('Value is not an encrypted string (missing ENC: prefix).');
  }
  const base64Data = encryptedString.slice(4);
  const buffer = Buffer.from(base64Data, 'base64');
  const iv = buffer.slice(0, IV_LENGTH);
  const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

/**
 * Returns true if the string is prefixed with 'ENC:' indicating it is an encrypted blob.
 * @param {unknown} value
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('ENC:');
}

module.exports = { encrypt, decrypt, isEncrypted };
