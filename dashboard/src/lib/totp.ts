/**
 * Pure JavaScript RFC 6238 TOTP (Time-Based One-Time Password) Generator.
 * Calculates 6-digit authentication codes matching Google Authenticator / Mailpool.
 */

function base32ToBuffer(base32Str: string): Uint8Array {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanStr = base32Str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < cleanStr.length; i++) {
    const val = base32chars.indexOf(cleanStr.charAt(i));
    if (val !== -1) {
      bits += val.toString(2).padStart(5, '0');
    }
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  return bytes;
}

export async function generateTOTP(secretBase32: string): Promise<{ code: string; secondsRemaining: number }> {
  if (!secretBase32) {
    return { code: '------', secondsRemaining: 30 };
  }

  const now = Math.floor(Date.now() / 1000);
  const timeStep = 30;
  const secondsRemaining = timeStep - (now % timeStep);
  const counter = Math.floor(now / timeStep);

  // Convert counter to 8-byte big-endian buffer
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter, false);

  const keyBytes = base32ToBuffer(secretBase32);

  // Use Web Crypto API (supported in Node.js 16+ & standard browsers)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, buffer);
  const sigBytes = new Uint8Array(signature);

  const offset = sigBytes[sigBytes.length - 1] & 0xf;
  const binary =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');

  return { code: otp, secondsRemaining };
}
