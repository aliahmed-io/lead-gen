import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const defaultSettings = { delayMinMs: 240000, delayMaxMs: 336000, maxEmailsPerDay: 100, bounceThreshold: 3 };
  try {
    const settingsPath = path.resolve(process.cwd(), '../settings.json');
    if (!fs.existsSync(settingsPath)) {
      return NextResponse.json(defaultSettings);
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      return NextResponse.json(defaultSettings);
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const settingsPath = path.resolve(process.cwd(), '../settings.json');
    let newSettings: Record<string, unknown>;
    try {
      newSettings = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    
    if (typeof newSettings !== 'object' || newSettings === null) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let existingSettings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch {}
    }

    const mergedSettings = { ...existingSettings, ...newSettings };
    if ((existingSettings as Record<string, unknown>).accounts) {
      (mergedSettings as Record<string, unknown>).accounts = (existingSettings as Record<string, unknown>).accounts;
    }

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf8');
    return NextResponse.json({ success: true, settings: mergedSettings });
  } catch {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
