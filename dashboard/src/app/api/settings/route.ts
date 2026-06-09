import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const defaultSettings = { delayMinMs: 300000, delayMaxMs: 1200000, maxEmailsPerDay: 30 };
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
    let newSettings: { delayMinMs?: number; delayMaxMs?: number; maxEmailsPerDay?: number } | null;
    try {
      newSettings = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    
    if (typeof newSettings !== 'object' || newSettings === null) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    if (newSettings.delayMinMs !== undefined && typeof newSettings.delayMinMs !== 'number') {
      return NextResponse.json({ error: 'delayMinMs must be a number' }, { status: 400 });
    }
    if (newSettings.delayMaxMs !== undefined && typeof newSettings.delayMaxMs !== 'number') {
      return NextResponse.json({ error: 'delayMaxMs must be a number' }, { status: 400 });
    }
    if (newSettings.maxEmailsPerDay !== undefined && typeof newSettings.maxEmailsPerDay !== 'number') {
      return NextResponse.json({ error: 'maxEmailsPerDay must be a number' }, { status: 400 });
    }

    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2), 'utf8');
    return NextResponse.json({ success: true, settings: newSettings });
  } catch {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
