import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { AccountHealth } from '@/types';

import { encryptPassword, isEncrypted, safeDecryptPassword } from '@/lib/crypto';
import { generateTOTP } from '@/lib/totp';

// ─── Rate Limiting (in-memory, per IP) ─────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// ─── File Paths ─────────────────────────────────────────────────────
const settingsPath = path.resolve(process.cwd(), '../settings.json');
const campaignDbPath = path.resolve(process.cwd(), '../campaign_db.json');

function getSettings(): Record<string, unknown> {
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {}
  }
  return {};
}

function saveSettings(settings: Record<string, unknown>) {
  // Never save to a git-tracked path — double-check .gitignore
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function getTodayDateString(): string {
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

// ─── GET — Account Health ───────────────────────────────────────────
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const settings = getSettings();
    const storedAccounts = (settings.accounts as Record<string, unknown>[]) || [];

    interface CampaignData {
      records: Record<string, {
        accountId?: string | number;
        status?: string;
        sentAt?: number;
        followedUp1At?: number;
        followedUp2At?: number;
        repliedAt?: number;
        openedAt?: number;
        openCount?: number;
        clickedAt?: number;
        clickCount?: number;
      }>;
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
      const accountId = acc.id as string;
      let totalSent = 0;
      let bounceCount = 0;
      let replyCount = 0;
      let openCount = 0;
      let clickCount = 0;
      let lastActiveAt: number | null = null;

      for (const record of Object.values(campaignData.records)) {
        if (String(record.accountId) === String(accountId)) {
          if (['sent', 'followed_up_1', 'followed_up_2', 'interested', 'completed_no_interest'].includes(String(record.status))) {
            totalSent++;
          }
          if (record.status === 'bounced') {
            bounceCount++;
            totalSent++;
          }
          if (record.repliedAt || record.status === 'interested') {
            replyCount++;
          }
          if (record.openedAt || record.openCount) {
            openCount += (record.openCount || 1);
          }
          if (record.clickedAt || record.clickCount) {
            clickCount += (record.clickCount || 1);
          }
          const ts = record.sentAt || record.followedUp1At || record.followedUp2At;
          if (ts && (lastActiveAt === null || ts > lastActiveAt)) lastActiveAt = ts;
        }
      }

      const sentToday = campaignData.dailyCounts[accountId]?.[todayStr] || 0;
      const bounceRate = totalSent > 0 ? bounceCount / totalSent : 0;
      const replyRate = totalSent > 0 ? replyCount / totalSent : 0;
      const openRate = totalSent > 0 ? Math.min(1, openCount / totalSent) : 0;
      const clickRate = totalSent > 0 ? Math.min(1, clickCount / totalSent) : 0;

      let healthScore: 'good' | 'warning' | 'critical' = 'good';
      if (bounceRate > 0.04) healthScore = 'critical';
      else if (bounceRate > 0.02) healthScore = 'warning';

      accounts.push({
        id: accountId,
        email: acc.email as string,
        appPassword: safeDecryptPassword(acc.password as string),
        ...(acc.totpSecret
          ? await generateTOTP(acc.totpSecret as string)
          : { totpCode: '------', totpSecondsRemaining: 30 }),
        firstName: (acc.firstName as string) || 'Ali',
        lastName: (acc.lastName as string) || 'Ahmed',
        senderName: (acc.senderName as string) || 'Ali Ahmed',
        signature: (acc.signature as string) || 'Ali Ahmed\nFounder & Interactive Developer | Aethelon Labs\naethelonlabs.com',
        forwardingDestination: (acc.forwardingDestination as string) || (acc.email as string),
        adminEmail: (acc.adminEmail as string) || (acc.email as string),
        hasAdminCredentials: Boolean(acc.adminPassword || acc.adminSecret),
        sentToday,
        totalSent,
        bounceCount,
        bounceRate,
        replyCount,
        replyRate,
        openRate,
        clickRate,
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

// ─── POST — Add Account ─────────────────────────────────────────────
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await request.json();

    const allowedFields = ['email', 'password', 'smtpHost', 'imapHost', 'smtpPort', 'imapPort'];
    const sanitized: Record<string, string> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined && typeof body[field] === 'string') {
        sanitized[field] = body[field].trim();
      }
    }

    if (!sanitized.email || !sanitized.password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized.email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Encrypt password before storing — never store plain text
    const encryptedPassword = isEncrypted(sanitized.password)
      ? sanitized.password  // already encrypted, don't double-encrypt
      : encryptPassword(sanitized.password);

    const settings = getSettings();
    const accounts = (settings.accounts as Record<string, unknown>[]) || [];

    // Prevent duplicate accounts
    const alreadyExists = accounts.some(a => String(a.email).toLowerCase() === sanitized.email.toLowerCase());
    if (alreadyExists) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    }

    const newAccount = {
      id: Date.now().toString(),
      email: sanitized.email,
      password: encryptedPassword,  // encrypted
      smtpHost: sanitized.smtpHost || 'smtp.gmail.com',
      imapHost: sanitized.imapHost || 'imap.gmail.com',
      smtpPort: sanitized.smtpPort || '465',
      imapPort: sanitized.imapPort || '993',
    };

    settings.accounts = [...accounts, newAccount];
    saveSettings(settings);

    // Never return password in response
    const safeAccount = {
      id: newAccount.id,
      email: newAccount.email,
      smtpHost: newAccount.smtpHost,
      imapHost: newAccount.imapHost,
      smtpPort: newAccount.smtpPort,
      imapPort: newAccount.imapPort,
    };
    return NextResponse.json(safeAccount);
  } catch {
    return NextResponse.json({ error: 'Failed to save account' }, { status: 500 });
  }
}

// ─── PUT — Update Account Details ───────────────────────────────────
export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { id, firstName, lastName, senderName, signature, forwardingDestination, adminEmail, adminPassword, adminSecret, password } = body;

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const settings = getSettings();
    const accounts = (settings.accounts as Record<string, unknown>[]) || [];
    const accIndex = accounts.findIndex(a => String(a.id) === String(id));

    if (accIndex === -1) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const target = accounts[accIndex];
    if (target) {
      if (firstName !== undefined) target.firstName = String(firstName).trim();
      if (lastName !== undefined) target.lastName = String(lastName).trim();
      if (senderName !== undefined) target.senderName = String(senderName).trim();
      if (signature !== undefined) target.signature = String(signature);
      if (forwardingDestination !== undefined) target.forwardingDestination = String(forwardingDestination).trim();
      if (adminEmail !== undefined) target.adminEmail = String(adminEmail).trim();
      if (adminPassword !== undefined) target.adminPassword = String(adminPassword);
      if (adminSecret !== undefined) target.adminSecret = String(adminSecret).trim();
      if (password !== undefined && String(password).trim()) {
        const plain = String(password).trim();
        target.password = isEncrypted(plain) ? plain : encryptPassword(plain);
      }
    }

    saveSettings(settings);
    return NextResponse.json({ success: true, account: target });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ─── DELETE — Remove Account ────────────────────────────────────────
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Account ID required' }, { status: 400 });

    const settings = getSettings();
    if (settings.accounts) {
      settings.accounts = (settings.accounts as Record<string, unknown>[]).filter(a => String(a.id) !== id);
      saveSettings(settings);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
