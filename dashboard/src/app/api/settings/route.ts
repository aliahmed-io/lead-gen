import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Memory cache for rate limiting
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT = 50; // Requests per window
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

const settingsPath = path.resolve(process.cwd(), '../settings.json');

export async function GET(request: Request) {
  // Extract simple IP fallback (in a real app, use x-forwarded-for)
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!applyRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    if (!fs.existsSync(settingsPath)) {
      return NextResponse.json({});
    }
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    
    // Strip passwords from accounts array
    if (data.accounts && Array.isArray(data.accounts)) {
      data.accounts = data.accounts.map((acc: Record<string, unknown>) => {
        const rest = { ...acc };
        // Never expose any credential material to the client; TOTP codes are
        // generated server-side by /api/accounts instead.
        delete rest.pass;
        delete rest.password;
        delete rest.adminPassword;
        delete rest.adminSecret;
        delete rest.totpSecret;
        return rest;
      });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!applyRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    let newSettings: Record<string, unknown>;
    try {
      newSettings = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    
    if (typeof newSettings !== 'object' || newSettings === null) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Reject accounts array updates
    if ('accounts' in newSettings) {
      return NextResponse.json({ error: 'Cannot update accounts via this endpoint' }, { status: 403 });
    }

    let existingSettings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch {}
    }

    // Only allow specific keys
    const allowedKeys = [
      'sequence', 'delayMinMs', 'delayMaxMs', 'maxEmailsPerDay', 'maxDailyTotal',
      'startHour', 'endHour', 'bounceThreshold', 'webhookUrl',
      'senderDisplayName', 'physicalAddress', 'footerText', 'followUpDays'
    ];

    const mergedSettings = { ...existingSettings };
    for (const key of allowedKeys) {
      if (key in newSettings) {
        mergedSettings[key] = newSettings[key];
      }
    }

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf8');
    return NextResponse.json({ success: true, settings: mergedSettings });
  } catch (err: unknown) {
    return NextResponse.json({ error: 'Failed to save settings: ' + (err as Error).message }, { status: 500 });
  }
}
