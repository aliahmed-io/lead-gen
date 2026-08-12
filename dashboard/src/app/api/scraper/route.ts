import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';

const ROOT = join(process.cwd(), '..');
const LEADS_DB = join(ROOT, 'leads_db.json');
const STATE_FILE = join(ROOT, 'scrape_state.json');

/**
 * Scraper control / status endpoint.
 * GET:  returns live scraper state (running?, session progress, total leads,
 *       last run info) read from scrape_state.json + leads_db.json.
 * POST: { action: 'start', queries: string[] }
 *   Spawns `node index.js` as a detached background process. The scraper
 *   honours the --query= flag for custom queries; other config (delays,
 *   headless mode, deduplication, resume) is inherited from config.js.
 * POST: { action: 'stop' } sends SIGINT so the scraper exits gracefully.
 *
 * Safety notes (personal-use tool):
 *  - The scraper is a Node process on the same machine; a single scrape
 *    session is enforced — a second POST while running returns 409.
 *  - State is persisted to scrape_state.json so a crash doesn't leave the
 *    UI falsely thinking a scrape is still running (orphan detection in GET).
 */

interface ScrapeState {
  running: boolean;
  startedAt: number | null;
  queries: string[];
  lastRun: { at: number | null; durationSec: number | null; newLeads: number | null };
  stopRequested: boolean;
  pid: number | null;
}

function loadState(): ScrapeState {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      return {
        running: Boolean(parsed.running),
        startedAt: parsed.startedAt ?? null,
        queries: Array.isArray(parsed.queries) ? parsed.queries : [],
        lastRun: parsed.lastRun ?? { at: null, durationSec: null, newLeads: null },
        stopRequested: Boolean(parsed.stopRequested),
        pid: parsed.pid ?? null,
      };
    }
  } catch {
    /* corrupt state — reset */
  }
  return { running: false, startedAt: null, queries: [], lastRun: { at: null, durationSec: null, newLeads: null }, stopRequested: false, pid: null };
}

function saveState(state: ScrapeState) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    /* non-fatal */
  }
}

interface LeadQualitySnapshot {
  totalLeads: number;
  avgQualityScore: number | null;
  qualityDistribution: Record<string, number>;
  lastRunAt: number | null;
  lastRunDurationSec: number | null;
  lastRunNewLeads: number | null;
}

function leadsSnapshot(): LeadQualitySnapshot {
  const empty: LeadQualitySnapshot = { totalLeads: 0, avgQualityScore: null, qualityDistribution: {}, lastRunAt: null, lastRunDurationSec: null, lastRunNewLeads: null };
  try {
    if (!existsSync(LEADS_DB)) return empty;
    const data = JSON.parse(readFileSync(LEADS_DB, 'utf8') || '{}');
    const businesses: Record<string, { qualityScore?: number; qualityGrade?: string; qualityTier?: string }> = data?.businesses ?? {};
    const entries = Object.values(businesses);
    let scoreSum = 0;
    let scoreCount = 0;
    const qualityDistribution: Record<string, number> = {};
    for (const b of entries) {
      if (typeof b?.qualityScore === 'number') {
        scoreSum += b.qualityScore as number;
        scoreCount++;
      }
      const tier = b?.qualityTier || b?.qualityGrade || '';
      if (typeof tier === 'string' && tier) {
        qualityDistribution[tier] = (qualityDistribution[tier] || 0) + 1;
      }
    }
    const meta = data?.metadata ?? {};
    return {
      totalLeads: entries.length,
      avgQualityScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
      qualityDistribution,
      lastRunAt: typeof meta?.lastRunAt === 'number' ? meta.lastRunAt : null,
      lastRunDurationSec: typeof meta?.lastRunDurationSec === 'number' ? meta.lastRunDurationSec : null,
      lastRunNewLeads: typeof meta?.lastRunNewLeads === 'number' ? meta.lastRunNewLeads : null,
    };
  } catch {
    return empty;
  }
}

export async function GET() {
  const state = loadState();

  /* Detect orphaned state: process no longer alive */
  if (state.running && state.pid !== null) {
    let alive = false;
    try {
      process.kill(state.pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (!alive) {
      state.running = false;
      state.stopRequested = false;
      state.pid = null;
      saveState(state);
    }
  }

  const snapshot = leadsSnapshot();

  /* Track last completed run: refresh once when a running session finishes */
  if (!state.running && state.lastRun?.at === null && snapshot.lastRunAt) {
    state.lastRun = { at: snapshot.lastRunAt, durationSec: snapshot.lastRunDurationSec, newLeads: snapshot.lastRunNewLeads };
    saveState(state);
  }

  return NextResponse.json({
    running: state.running,
    stopRequested: state.stopRequested,
    startedAt: state.startedAt,
    queries: state.queries,
    lastRun: state.lastRun,
    totalLeads: snapshot.totalLeads,
    avgQualityScore: snapshot.avgQualityScore,
    qualityDistribution: snapshot.qualityDistribution,
    remoteControl: true,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const state = loadState();

  if (action === 'stop') {
    if (state.running && state.pid !== null) {
      try {
        process.kill(state.pid, 'SIGINT');
      } catch {
        /* already gone */
      }
      state.stopRequested = true;
      saveState(state);
      return NextResponse.json({ ok: true, running: state.running, message: 'Stop requested. The scraper will finish its current query and exit.' });
    }
    return NextResponse.json({ ok: true, running: false, message: 'No scrape session is running.' });
  }

  if (action === 'start') {
    if (state.running) {
      return NextResponse.json(
        { ok: false, running: true, error: 'A scrape session is already running. Stop it first or wait for it to finish.' },
        { status: 409 }
      );
    }

    const rawQueries = Array.isArray(body?.queries) ? body.queries : [];
    const queries: string[] = rawQueries
      .map((q: unknown) => String(q || '').trim())
      .filter((q: string) => q.length > 0);

    if (queries.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Provide at least one non-empty search query.' },
        { status: 400 }
      );
    }

    const args = ['index.js'];
    for (const q of queries) {
      args.push(`--query=${q}`);
    }

    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });

    child.on('error', () => {
      const s = loadState();
      s.running = false;
      saveState(s);
    });
    child.unref();

    state.running = true;
    state.startedAt = Date.now();
    state.queries = queries;
    state.stopRequested = false;
    state.pid = child.pid ?? null;
    state.lastRun = { at: null, durationSec: null, newLeads: null };
    saveState(state);

    return NextResponse.json({
      ok: true,
      running: true,
      pid: child.pid ?? null,
      queries,
      message: `Scrape session started for ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}. Follow progress on this page.`,
    });
  }

  return NextResponse.json(
    { ok: false, error: 'Unknown action. Use { action: "start", queries: [...] } or { action: "stop" }.' },
    { status: 400 }
  );
}
