import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

const campaignDbPath = path.resolve(process.cwd(), '../campaign_db.json');

function getCampaignData() {
  if (fs.existsSync(campaignDbPath)) {
    try {
      return JSON.parse(fs.readFileSync(campaignDbPath, 'utf8'));
    } catch {
      return { records: {}, dailyCounts: {}, unsubscribed: [], activityLog: [], abTests: {}, warmup: {} };
    }
  }
  return { records: {}, dailyCounts: {}, unsubscribed: [], activityLog: [], abTests: {}, warmup: {} };
}

async function recordClick(email: string, url: string) {
  let release: (() => Promise<void>) | undefined;
  try {
    if (fs.existsSync(campaignDbPath)) {
      release = await lockfile.lock(campaignDbPath, { retries: { retries: 3, minTimeout: 30 } });
    }
    const data = getCampaignData();
    const record = data.records?.[email];
    if (!record) return;

    const now = Date.now();
    if (!record.clickedAt) record.clickedAt = now;
    record.clickCount = (record.clickCount || 0) + 1;
    record.lastClickedAt = now;
    // Track which URLs were clicked (last 10)
    if (!record.clickedUrls) record.clickedUrls = [];
    record.clickedUrls = [{ url, at: now }, ...record.clickedUrls].slice(0, 10);
    data.records[email] = record;

    const tempPath = campaignDbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, campaignDbPath);
  } finally {
    if (release) { try { await release(); } catch {} }
  }
}

// GET /api/track/click?e=<email_b64>&u=<url_b64>
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eParam = searchParams.get('e');
  const uParam = searchParams.get('u');

  let destination = '/';

  if (uParam) {
    try {
      destination = Buffer.from(uParam, 'base64url').toString('utf8');
      // Security: only allow http/https destinations — prevent open redirects
      const parsed = new URL(destination);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        destination = '/';
      }
    } catch {
      destination = '/';
    }
  }

  if (eParam && uParam) {
    try {
      const email = Buffer.from(eParam, 'base64url').toString('utf8').toLowerCase().trim();
      recordClick(email, destination).catch(() => {});
    } catch {
      // Silently ignore
    }
  }

  const redirectTarget = destination === '/' ? new URL('/', request.url) : destination;
  return NextResponse.redirect(redirectTarget, { status: 302 });
}
