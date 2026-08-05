import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

// 1x1 transparent GIF (43 bytes) — standard tracking pixel
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

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

async function recordOpen(email: string) {
  let release: (() => Promise<void>) | undefined;
  try {
    if (fs.existsSync(campaignDbPath)) {
      release = await lockfile.lock(campaignDbPath, { retries: { retries: 3, minTimeout: 30 } });
    }
    const data = getCampaignData();
    const record = data.records?.[email];
    if (!record) return;

    const now = Date.now();
    // Only record first open — don't overwrite openedAt on subsequent pixel loads
    if (!record.openedAt) {
      record.openedAt = now;
    }
    // Always increment open count
    record.openCount = (record.openCount || 0) + 1;
    record.lastOpenedAt = now;
    data.records[email] = record;

    const tempPath = campaignDbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, campaignDbPath);
  } finally {
    if (release) { try { await release(); } catch {} }
  }
}

// GET /api/track/open?e=<email_b64>
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eParam = searchParams.get('e');

  if (eParam) {
    try {
      const email = Buffer.from(eParam, 'base64url').toString('utf8').toLowerCase().trim();
      // Fire-and-forget — don't block pixel response
      recordOpen(email).catch(() => {});
    } catch {
      // Invalid token — silently ignore, still serve pixel
    }
  }

  // Always return the pixel regardless of tracking success
  // Cache-Control: no-store prevents email clients from caching (which would suppress future opens)
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
