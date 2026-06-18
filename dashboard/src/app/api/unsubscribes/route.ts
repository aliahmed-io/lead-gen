import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import lockfile from 'proper-lockfile';

interface CampaignRecord {
  email?: string;
  businessName?: string;
  status?: string;
  sentAt?: number | null;
  followedUp1At?: number | null;
  followedUp2At?: number | null;
  followedUp3At?: number | null;
  followedUpAt?: number | null;
  repliedAt?: number | null;
  bouncedAt?: number | null;
  unsubscribedAt?: number | null;
  completedAt?: number | null;
  accountId?: string | null;
  messageId?: string | null;
  platform?: string;
  website?: string;
  city?: string;
  state?: string;
  updatedAt?: number;
  [key: string]: unknown;
}

interface ActivityLogEntry {
  email: string;
  from: string | null;
  to: string;
  at: number;
}

interface CampaignData {
  records: Record<string, CampaignRecord>;
  unsubscribed: string[];
  activityLog: ActivityLogEntry[];
  [key: string]: unknown;
}

// Memory cache for rate limiting
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT = 100; // Requests per window
const WINDOW_MS = 60 * 1000; // 1 minute

function applyRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, lastReset: now };

  if (now - record.lastReset > WINDOW_MS) {
    record.count = 1;
    record.lastReset = now;
  } else {
    record.count++;
  }

  rateLimitMap.set(ip, record);
  return record.count <= RATE_LIMIT;
}

const campaignDbPath = path.resolve(process.cwd(), '../campaign_db.json');

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

async function saveCampaignData(data: CampaignData) {
  let release;
  try {
    if (fs.existsSync(campaignDbPath)) {
      release = await lockfile.lock(campaignDbPath, { retries: { retries: 5, minTimeout: 50 } });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Failed to lock campaign_db.json, proceeding with atomic write:', msg);
  }

  try {
    const tempPath = campaignDbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, campaignDbPath);
  } finally {
    if (release) {
      try {
        await release();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Failed to release lock on campaign_db.json:', msg);
      }
    }
  }
}

// GET /api/unsubscribes - Returns the unsubscribe list
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!applyRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const data = getCampaignData();
    return NextResponse.json({ unsubscribed: data.unsubscribed || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to retrieve unsubscribes: ' + msg }, { status: 500 });
  }
}

// POST /api/unsubscribes - Add an email to the unsubscribe list
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!applyRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    let body: { email?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { email } = body;
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const data = getCampaignData();

    if (!data.unsubscribed.includes(normalizedEmail)) {
      data.unsubscribed.push(normalizedEmail);
    }

    // Also update campaign record status if it exists
    const now = Date.now();
    const oldRecord = data.records[normalizedEmail] || {};
    const oldStatus = oldRecord.status || null;
    const newStatus = 'completed_no_interest';

    data.records[normalizedEmail] = {
      ...oldRecord,
      email: normalizedEmail,
      status: newStatus,
      updatedAt: now,
    };

    if (oldStatus !== newStatus) {
      if (!data.activityLog) data.activityLog = [];
      data.activityLog.push({
        email: normalizedEmail,
        from: oldStatus,
        to: newStatus,
        at: now,
      });
      if (data.activityLog.length > 500) {
        data.activityLog = data.activityLog.slice(-500);
      }
    }

    await saveCampaignData(data);

    return NextResponse.json({ success: true, email: normalizedEmail });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to unsubscribe email: ' + msg }, { status: 500 });
  }
}

// DELETE /api/unsubscribes - Remove an email from the unsubscribe list
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!applyRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const data = getCampaignData();

    if (!data.unsubscribed.includes(normalizedEmail)) {
      return NextResponse.json({ error: 'Email not found in unsubscribe list' }, { status: 404 });
    }

    data.unsubscribed = data.unsubscribed.filter((e: string) => e !== normalizedEmail);

    await saveCampaignData(data);

    return NextResponse.json({ success: true, email: normalizedEmail });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to delete unsubscribe: ' + msg }, { status: 500 });
  }
}
