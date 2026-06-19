import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set in environment.');
  return crypto.createHash('sha256').update(key).digest();
}

export function encryptPassword(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const base64 = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return `ENC:${base64}`;
}

export function decryptPassword(encryptedString: string): string {
  if (!isEncrypted(encryptedString)) {
    throw new Error('Value is not prefixed with ENC:');
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

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith('ENC:');
}

export function safeDecryptPassword(password: string): string {
  if (!password) return '';
  if (isEncrypted(password)) {
    try {
      return decryptPassword(password);
    } catch {
      return '';
    }
  }
  return password;
}
