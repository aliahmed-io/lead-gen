import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(process.cwd(), '..');
const CAMPAIGN_DB = join(ROOT, 'campaign_db.json');
const SETTINGS = join(ROOT, 'settings.json');

/** Mirrors CampaignDatabase.getAccountStats + getDeliverabilitySummary from
 *  campaignDb.js, computed server-side so the UI gets per-account health and
 *  30-day trends without requiring the CJS backend at runtime. */

interface CampaignRecord {
  status?: string;
  accountId?: string | number | null;
  sentAt?: number | null;
  followedUp1At?: number | null;
  followedUp2At?: number | null;
  bouncedAt?: number | null;
  repliedAt?: number | null;
  openedAt?: number | null;
  openCount?: number;
  clickedAt?: number | null;
  clickCount?: number;
}

interface AccountStats {
  id: string;
  sentToday: number;
  totalSent: number;
  bounceCount: number;
  bounceRate: number;
  replyCount: number;
  replyRate: number;
  openCount: number;
  clickCount: number;
  lastActiveAt: number | null;
  health: 'healthy' | 'watch' | 'recovering' | 'paused' | 'unknown';
  paused: boolean;
  recovering: boolean;
}

function centralDateString(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function GET() {
  /** @type {Record<string, CampaignRecord>} */
  let records: Record<string, CampaignRecord> = {};
  /** @type {Record<string, { paused?: boolean; recovering?: boolean }>} */
  let accountState: Record<string, { paused?: boolean; recovering?: boolean }> = {};
  /** @type {Record<string, Record<string, number>>} */
  let dailyCounts: Record<string, Record<string, number>> = {};
  let accountIds: string[] = [];
  try {
    if (existsSync(CAMPAIGN_DB)) {
      const parsed = JSON.parse(readFileSync(CAMPAIGN_DB, 'utf8') || '{}');
      records = parsed?.records ?? {};
      accountState = parsed?.accountState ?? {};
      dailyCounts = parsed?.dailyCounts ?? {};
    }
    if (existsSync(SETTINGS)) {
      const settings = JSON.parse(readFileSync(SETTINGS, 'utf8') || '{}');
      if (Array.isArray(settings.accounts)) {
        accountIds = settings.accounts
          .map((a: { id?: unknown }) => String(a?.id ?? ''))
          .filter((id: string) => id.length > 0);
      }
    }
    if (accountIds.length === 0) {
      const seen = new Set<string>();
      for (const record of Object.values(records)) {
        const aid = record?.accountId;
        if (aid !== null && aid !== undefined) seen.add(String(aid));
      }
      accountIds = Array.from(seen);
    }
  } catch {
    return NextResponse.json(
      { accounts: [], daily: [], overall: { totalSent: 0, bounceCount: 0, bounceRate: 0, replyCount: 0, replyRate: 0, openCount: 0, clickCount: 0 }, error: 'Could not read the campaign database.' },
      { status: 200 }
    );
  }

  const sentCount = (r: CampaignRecord) =>
    (r.sentAt ? 1 : 0) + (r.followedUp1At ? 1 : 0) + (r.followedUp2At ? 1 : 0);

  const today = centralDateString();
  const accounts: AccountStats[] = accountIds.map(id => {
    let totalSent = 0;
    let bounceCount = 0;
    let replyCount = 0;
    let openCount = 0;
    let clickCount = 0;
    let lastActiveAt: number | null = null;
    let sentToday = 0;
    const flags = accountState[id] ?? {};

    for (const record of Object.values(records)) {
      if (String(record?.accountId) !== id) continue;
      const status = record.status || '';
      const sent = sentCount(record);
      totalSent += sent;
      if (record.sentAt === null && record.followedUp1At === null && record.followedUp2At === null) {
        // no sends yet from this account for this record
      }
      if (status === 'bounced') {
        bounceCount++;
        totalSent++;
      }
      if (record.repliedAt || status === 'interested') replyCount++;
      if (record.openedAt || (record.openCount || 0) > 0) openCount += Math.max(record.openCount || 1, 1);
      if (record.clickedAt || (record.clickCount || 0) > 0) clickCount += Math.max(record.clickCount || 1, 1);
      const ts = record.sentAt || record.followedUp1At || record.followedUp2At;
      if (ts && (lastActiveAt === null || ts > lastActiveAt)) lastActiveAt = ts;
      if (record.sentAt) {
        const d = new Date(record.sentAt);
        const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        if (ds === today) sentToday++;
      }
    }
    /* sentToday from dailyCounts is more accurate than counting today's records */
    sentToday = (dailyCounts[id] ?? {})[today] || 0;

    const bounceRate = totalSent > 0 ? bounceCount / totalSent : 0;
    const replyRate = totalSent > 0 ? replyCount / totalSent : 0;
    let health: AccountStats['health'] = 'healthy';
    if (flags.paused) health = 'paused';
    else if (bounceRate > 0.04) {
      health = 'paused';
      flags.paused = true;
    } else if (bounceRate > 0.02) health = 'watch';
    else if (flags.recovering) health = 'recovering';

    return {
      id,
      sentToday,
      totalSent,
      bounceCount,
      bounceRate,
      replyCount,
      replyRate,
      openCount,
      clickCount,
      lastActiveAt,
      health,
      paused: Boolean(flags.paused),
      recovering: Boolean(flags.recovering),
    };
  });

  /* 30-day daily trends (Central time) */
  const DAYS = 30;
  const todayDate = new Date();
  const daily: { date: string; sent: number; bounced: number; replied: number; opened: number; clicked: number }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayStart = d.getTime();
    const dayEnd = dayStart + 86400000;
    const row = { date: d.toISOString().slice(0, 10), sent: 0, bounced: 0, replied: 0, opened: 0, clicked: 0 };
    for (const record of Object.values(records)) {
      const sendTs = record.sentAt || record.followedUp1At || record.followedUp2At;
      const status = record.status || '';
      if (typeof sendTs === 'number' && sendTs >= dayStart && sendTs < dayEnd) {
        row.sent++;
        if (status === 'bounced' || record.bouncedAt) row.bounced++;
        if (record.repliedAt || status === 'interested') row.replied++;
        if (record.openedAt || typeof record.openCount === 'number') row.opened++;
        if (record.clickedAt || typeof record.clickCount === 'number') row.clicked++;
      }
    }
    daily.push(row);
  }

  let totalSent = 0;
  let bounceCount = 0;
  let replyCount = 0;
  let openCount = 0;
  let clickCount = 0;
  for (const a of accounts) {
    totalSent += a.totalSent;
    bounceCount += a.bounceCount;
    replyCount += a.replyCount;
    openCount += a.openCount;
    clickCount += a.clickCount;
  }

  return NextResponse.json({
    accounts,
    daily,
    overall: {
      totalSent,
      bounceCount,
      bounceRate: totalSent > 0 ? bounceCount / totalSent : 0,
      replyCount,
      replyRate: totalSent > 0 ? replyCount / totalSent : 0,
      openCount,
      clickCount,
    },
  });
}
