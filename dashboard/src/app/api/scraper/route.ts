import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const LEADS_DB = join(process.cwd(), '..', 'leads_db.json');

/**
 * Scraper control / status endpoint.
 * GET:  reports current scraper state + discovered lead count.
 * POST: reports that remote start/stop is not supported in dashboard mode
 *       (the scheduler runs as a Node.js process in the terminal), but
 *       still returns an updated status snapshot so the UI stays in sync.
 */
export async function GET() {
  let totalLeads = 0;
  try {
    if (existsSync(LEADS_DB)) {
      const raw = readFileSync(LEADS_DB, 'utf8');
      const data = JSON.parse(raw || '{}');
      const records = data?.records ?? data?.leads ?? [];
      totalLeads = Array.isArray(records) ? records.length : 0;
    }
  } catch (e) {
    // Non-fatal: count simply unavailable
    void e;
  }

  return NextResponse.json({
    running: false,
    totalLeads,
    remoteControl: false,
    message: 'Start/stop the scheduler from the terminal (node start.js); the dashboard shows lead discovery progress here.',
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(
    {
      running: false,
      totalLeads: 0,
      remoteControl: false,
      error: 'Remote scraper start/stop is not supported in dashboard mode. Run "node start.js" in the terminal to control the scheduler.',
      requestedAction: body?.action,
    },
    { status: 409 }
  );
}
