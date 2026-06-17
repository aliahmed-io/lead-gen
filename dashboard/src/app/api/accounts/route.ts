import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { AccountHealth } from '@/types';

const settingsPath = path.resolve(process.cwd(), '../settings.json');
const campaignDbPath = path.resolve(process.cwd(), '../campaign_db.json');

function getSettings() {
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {}
  }
  return {};
}

function saveSettings(settings: Record<string, unknown>) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function getTodayDateString() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  const month = parts.find(p => p.type === 'month')?.value || '06';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

export async function GET() {
  try {
    const settings = getSettings();
    const storedAccounts = settings.accounts || [];

    interface CampaignData {
      records: Record<string, { accountId?: string | number; status?: string; sentAt?: number; followedUp1At?: number; followedUp2At?: number; }>;
      dailyCounts: Record<string, Record<string, number>>;
    }
    let campaignData: CampaignData = { records: {}, dailyCounts: {} };
    if (fs.existsSync(campaignDbPath)) {
      try {
        campaignData = JSON.parse(fs.readFileSync(campaignDbPath, 'utf8'));
      } catch {}
    }
    if (!campaignData.records) campaignData.records = {};
    if (!campaignData.dailyCounts) campaignData.dailyCounts = {};

    const todayStr = getTodayDateString();
    const accounts: AccountHealth[] = [];

    for (const acc of storedAccounts) {
      let totalSent = 0;
      let bounceCount = 0;
      let lastActiveAt: number | null = null;
      const accountId = acc.id;

      for (const record of Object.values(campaignData.records)) {
        if (String(record.accountId) === String(accountId)) {
          if (['sent', 'followed_up_1', 'followed_up_2', 'interested', 'completed_no_interest'].includes(String(record.status))) {
            totalSent++;
          }
          if (record.status === 'bounced') {
            bounceCount++;
            totalSent++;
          }

          const ts = record.sentAt || record.followedUp1At || record.followedUp2At;
          if (ts && (lastActiveAt === null || ts > lastActiveAt)) {
            lastActiveAt = ts;
          }
        }
      }

      const sentToday = campaignData.dailyCounts[accountId]?.[todayStr] || 0;
      const bounceRate = totalSent > 0 ? bounceCount / totalSent : 0;

      let healthScore: 'good' | 'warning' | 'critical' = 'good';
      if (bounceRate > 0.05) {
        healthScore = 'critical';
      } else if (bounceRate > 0.03) {
        healthScore = 'warning';
      }

      accounts.push({
        id: accountId,
        email: acc.email,
        sentToday,
        totalSent,
        bounceCount,
        bounceRate,
        lastActiveAt,
        healthScore,
      });
    }

    return NextResponse.json(accounts);
  } catch (err: unknown) {
    console.error('Error calculating account health:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to retrieve accounts health' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Strict whitelist — only accept known fields to prevent settings.json injection
    const allowedFields = ['email', 'password', 'smtpHost', 'imapHost', 'smtpPort', 'imapPort'];
    const sanitized: {
      id?: string;
      email?: string;
      password?: string;
      smtpHost?: string;
      imapHost?: string;
      smtpPort?: string;
      imapPort?: string;
    } = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined && typeof body[field] === 'string') {
        (sanitized as Record<string, string>)[field] = body[field].trim();
      }
    }

    if (!sanitized.email || !sanitized.password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const settings = getSettings();
    const accounts = settings.accounts || [];

    const newAccount = {
      id: Date.now().toString(),
      ...sanitized,
    };

    settings.accounts = [...accounts, newAccount];
    saveSettings(settings);

    // Return account without password
    const safeAccount = { ...newAccount };
    delete safeAccount.password;
    return NextResponse.json(safeAccount);
  } catch {
    return NextResponse.json({ error: 'Failed to save account' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Account ID required' }, { status: 400 });

    const settings = getSettings();
    if (settings.accounts) {
      settings.accounts = (settings.accounts as Record<string, unknown>[]).filter((a) => String(a.id) !== id);
      saveSettings(settings);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
