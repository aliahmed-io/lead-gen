/**
 * RFC 8058 One-Click Unsubscribe Handler
 *
 * Gmail and Yahoo POST to this endpoint automatically when users click
 * "Unsubscribe" in their mail client header (List-Unsubscribe-Post header).
 *
 * RFC 8058 spec: https://www.rfc-editor.org/rfc/rfc8058
 *
 * The List-Unsubscribe header in outbound emails must include:
 *   List-Unsubscribe: <https://yourdomain.com/api/unsubscribe/one-click?token=<HMAC_TOKEN>>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 * Token format: base64url( email + ':' + timestamp ) with HMAC-SHA256 signature
 * Token validation prevents arbitrary emails being unsubscribed by anyone who
 * knows the URL format.
 */

import { } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

// ── Token signing ──────────────────────────────────────────────────────────
// Uses the same ENCRYPTION_KEY already in .env — no new secret needed.
const SECRET = process.env.ENCRYPTION_KEY || 'fallback-secret-change-in-production';

/**
 * Generate a signed, URL-safe unsubscribe token for an email address.
 * Token expires after 90 days (prevents indefinite link reuse from spam).
 */
export function generateUnsubToken(email: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${email.toLowerCase().trim()}:${ts}`;
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a token and return the email if valid, or null if tampered/expired.
 */
function verifyUnsubToken(token: string): string | null {
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;

    // Verify HMAC signature
    const expectedSig = crypto
      .createHmac('sha256', SECRET)
      .update(payloadB64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null; // Tampered
    }

    // Decode payload
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const [email, tsStr] = payload.split(':');
    const ts = parseInt(tsStr, 10);

    // Check expiry (90 days)
    const NINETY_DAYS_S = 90 * 24 * 60 * 60;
    if (Date.now() / 1000 - ts > NINETY_DAYS_S) return null;

    return email || null;
  } catch {
    return null;
  }
}

// ── Database helpers ───────────────────────────────────────────────────────
const campaignDbPath = path.resolve(process.cwd(), '../campaign_db.json');

interface CampaignData {
  records: Record<string, { email?: string; status?: string; unsubscribedAt?: number; updatedAt?: number; [k: string]: unknown }>;
  unsubscribed: string[];
  activityLog: { email: string; from: string | null; to: string; at: number }[];
  [k: string]: unknown;
}

function getCampaignData(): CampaignData {
  if (fs.existsSync(campaignDbPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(campaignDbPath, 'utf8'));
      if (!data.records) data.records = {};
      if (!data.unsubscribed) data.unsubscribed = [];
      if (!data.activityLog) data.activityLog = [];
      return data as CampaignData;
    } catch {
      return { records: {}, unsubscribed: [], activityLog: [] };
    }
  }
  return { records: {}, unsubscribed: [], activityLog: [] };
}

async function saveAndUnsub(email: string) {
  let release: (() => Promise<void>) | undefined;
  try {
    if (fs.existsSync(campaignDbPath)) {
      release = await lockfile.lock(campaignDbPath, {
        retries: { retries: 5, minTimeout: 50 },
      });
    }

    const data = getCampaignData();
    const now = Date.now();
    const oldRecord = data.records[email] || {};
    const oldStatus = oldRecord.status || null;

    // Add to unsubscribed list
    if (!data.unsubscribed.includes(email)) {
      data.unsubscribed.push(email);
    }

    // Update campaign record
    data.records[email] = {
      ...oldRecord,
      email,
      status: 'unsubscribed',
      unsubscribedAt: now,
      updatedAt: now,
    };

    // Activity log
    if (oldStatus !== 'unsubscribed') {
      data.activityLog.push({ email, from: oldStatus, to: 'unsubscribed', at: now });
      if (data.activityLog.length > 500) {
        data.activityLog = data.activityLog.slice(-500);
      }
    }

    const tempPath = campaignDbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, campaignDbPath);
  } finally {
    if (release) {
      try { await release(); } catch { /* ignore lock release errors */ }
    }
  }
}

// ── Rate limiting ──────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
function applyRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, lastReset: now };
  if (now - record.lastReset > 60_000) { record.count = 1; record.lastReset = now; }
  else record.count++;
  rateLimitMap.set(ip, record);
  return record.count <= 30;
}

// ── POST /api/unsubscribe/one-click ───────────────────────────────────────
// Called automatically by Gmail / Yahoo for RFC 8058 one-click unsubscribe.
// Body (form-encoded): List-Unsubscribe=One-Click
// Query param: ?token=<signed_token>
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!applyRateLimit(ip)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  const email = verifyUnsubToken(token);
  if (!email) {
    // RFC 8058: must return 200 even on bad tokens to prevent retry storms
    console.warn(`[one-click-unsub] Invalid or expired token from ${ip}`);
    return new Response('OK', { status: 200 });
  }

  try {
    await saveAndUnsub(email);
    console.log(`[one-click-unsub] ✅ Unsubscribed via RFC 8058: ${email}`);
    // RFC 8058 spec requires 200 OK response
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('[one-click-unsub] Error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// ── GET /api/unsubscribe/one-click ────────────────────────────────────────
// Traditional unsubscribe link click (user lands on a page or gets redirected).
// Returns a simple confirmation page so the user sees feedback.
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!applyRateLimit(ip)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) {
    return new Response('Invalid unsubscribe link.', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const email = verifyUnsubToken(token);
  if (!email) {
    return new Response(
      '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>This unsubscribe link has expired or is invalid.</h2><p>If you wish to unsubscribe, please reply to any of our emails with "unsubscribe".</p></body></html>',
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    );
  }

  try {
    await saveAndUnsub(email);
    console.log(`[one-click-unsub] ✅ Unsubscribed via link click: ${email}`);
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#333"><h2 style="color:#2d6a4f">You've been unsubscribed.</h2><p>${email} has been removed from all future outreach.</p><p style="color:#888;font-size:13px">This usually takes effect within the hour.</p></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err) {
    console.error('[one-click-unsub] Error:', err);
    return new Response('Something went wrong. Please try again later.', { status: 500 });
  }
}
