import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function getRootDir(): string {
  if (fs.existsSync(path.resolve(process.cwd(), 'leads_db.json'))) {
    return process.cwd();
  }
  if (fs.existsSync(path.resolve(process.cwd(), '../leads_db.json'))) {
    return path.resolve(process.cwd(), '..');
  }
  return path.resolve(__dirname, '../../../../..');
}

const ROOT_DIR = getRootDir();
const PID_FILE = path.join(ROOT_DIR, 'scraper.pid');
const LOG_FILE = path.join(ROOT_DIR, 'scraper.log');
const SQ_FILE = path.join(ROOT_DIR, 'search_queries.json');
const DB_FILE = path.join(ROOT_DIR, 'leads_db.json');

export interface ScraperStatus {
  isRunning: boolean;
  activePid: number | null;
  processType: 'scraper' | 'email_scanner' | null;
  startedAt: number | null;
  totalQueries: number;
  completedQueriesCount: number;
  pendingQueriesCount: number;
  totalBusinesses: number;
  needingEmailScanCount: number;
  withEmailCount: number;
  metadata: Record<string, unknown>;
  sampleQueries: string[];
  recentLogs: string;
}

function isProcessAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getStatus(): ScraperStatus {
  let isRunning = false;
  let activePid: number | null = null;
  let processType: 'scraper' | 'email_scanner' | null = null;
  let startedAt: number | null = null;

  if (fs.existsSync(PID_FILE)) {
    try {
      const pidData = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
      if (pidData && pidData.pid && isProcessAlive(pidData.pid)) {
        isRunning = true;
        activePid = pidData.pid;
        processType = pidData.type || 'scraper';
        startedAt = pidData.startedAt || null;
      } else {
        try { fs.unlinkSync(PID_FILE); } catch {}
      }
    } catch {
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  }

  let totalBusinesses = 0;
  let completedQueriesCount = 0;
  let needingEmailScanCount = 0;
  let withEmailCount = 0;

  if (fs.existsSync(DB_FILE)) {
    try {
      const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const bList = Object.values(db.businesses || {}) as Array<{
        website?: string;
        email?: string;
        emailStatus?: string;
      }>;
      totalBusinesses = bList.length;
      completedQueriesCount = (db.completedQueries || []).length;
      needingEmailScanCount = bList.filter(
        b => b.website && (!b.email || b.email.length === 0) && !b.emailStatus
      ).length;
      withEmailCount = bList.filter(b => b.email && b.email.length > 0).length;
    } catch (e: unknown) {
      console.error('Error reading leads_db.json:', (e as Error).message);
    }
  }

  let totalQueries = 0;
  let sampleQueries: string[] = [];
  let metadata: Record<string, unknown> = {};

  if (fs.existsSync(SQ_FILE)) {
    try {
      const sq = JSON.parse(fs.readFileSync(SQ_FILE, 'utf8'));
      if (Array.isArray(sq.queries)) {
        totalQueries = sq.queries.length;
        sampleQueries = sq.queries.slice(0, 50).map((q: unknown) => {
          if (typeof q === 'string') return q;
          if (q && typeof q === 'object' && 'query' in q) return String((q as { query: string }).query);
          return String(q);
        });
      }
      metadata = sq.metadata || {};
    } catch (e: unknown) {
      console.error('Error reading search_queries.json:', (e as Error).message);
    }
  }

  let recentLogs = '';
  if (fs.existsSync(LOG_FILE)) {
    try {
      const logContent = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = logContent.split('\n');
      recentLogs = lines.slice(-60).join('\n');
    } catch {}
  }

  return {
    isRunning,
    activePid,
    processType,
    startedAt,
    totalQueries,
    completedQueriesCount,
    pendingQueriesCount: Math.max(0, totalQueries - completedQueriesCount),
    totalBusinesses,
    needingEmailScanCount,
    withEmailCount,
    metadata,
    sampleQueries,
    recentLogs,
  };
}

export function startProcess(type: 'scraper' | 'email_scanner' = 'scraper'): { success: boolean; pid: number; type: string } {
  const current = getStatus();
  if (current.isRunning) {
    throw new Error(`A process (${current.processType}, PID ${current.activePid}) is already running.`);
  }

  const scriptPath = type === 'email_scanner'
    ? path.join(ROOT_DIR, 'run_email_backlog.js')
    : path.join(ROOT_DIR, 'index.js');

  const outFd = fs.openSync(LOG_FILE, 'a');
  const errFd = outFd;

  const child = spawn(process.execPath, [scriptPath], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  if (!child.pid) {
    throw new Error('Failed to spawn child process.');
  }

  const pidData = {
    pid: child.pid,
    type,
    startedAt: Date.now(),
  };

  const tmpPid = PID_FILE + '.tmp';
  fs.writeFileSync(tmpPid, JSON.stringify(pidData, null, 2), 'utf8');
  fs.renameSync(tmpPid, PID_FILE);

  child.unref();

  return { success: true, pid: child.pid, type };
}

export async function stopProcess(): Promise<{ success: boolean; message: string }> {
  if (!fs.existsSync(PID_FILE)) {
    return { success: true, message: 'No process was running.' };
  }

  let pidData: { pid: number };
  try {
    pidData = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  } catch {
    try { fs.unlinkSync(PID_FILE); } catch {}
    return { success: true, message: 'Cleaned corrupt PID file.' };
  }

  const pid = pidData.pid;
  if (!pid || !isProcessAlive(pid)) {
    try { fs.unlinkSync(PID_FILE); } catch {}
    return { success: true, message: 'Process already terminated.' };
  }

  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
      killer.on('close', () => {
        try { fs.unlinkSync(PID_FILE); } catch {}
        resolve({ success: true, message: 'Process terminated.' });
      });
      killer.on('error', () => {
        try { process.kill(pid, 'SIGKILL'); } catch {}
        try { fs.unlinkSync(PID_FILE); } catch {}
        resolve({ success: true, message: 'Process killed directly.' });
      });
    } else {
      try {
        process.kill(pid, 'SIGINT');
        setTimeout(() => {
          if (isProcessAlive(pid)) {
            try { process.kill(pid, 'SIGKILL'); } catch {}
          }
          try { fs.unlinkSync(PID_FILE); } catch {}
          resolve({ success: true, message: 'Process stopped.' });
        }, 1500);
      } catch {
        try { fs.unlinkSync(PID_FILE); } catch {}
        resolve({ success: true, message: 'Process stopped.' });
      }
    }
  });
}

export function generateQueries({
  niches = [],
  locations = [],
}: {
  niches: string[];
  locations: Array<{ city: string; state: string } | string>;
}): { success: boolean; addedCount: number; totalQueries: number } {
  if (!Array.isArray(niches) || niches.length === 0) {
    throw new Error('Niches list cannot be empty.');
  }
  if (!Array.isArray(locations) || locations.length === 0) {
    throw new Error('Locations list cannot be empty.');
  }

  const newGenerated: string[] = [];
  for (const loc of locations) {
    const locStr = typeof loc === 'string' ? loc : `${loc.city} ${loc.state}`;
    for (const niche of niches) {
      newGenerated.push(`${niche} ${locStr}`.trim());
    }
  }

  let existing: { metadata: Record<string, unknown>; storeTypes: string[]; queries: unknown[] } = {
    metadata: {},
    storeTypes: [],
    queries: [],
  };

  if (fs.existsSync(SQ_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(SQ_FILE, 'utf8'));
      if (!Array.isArray(existing.queries)) existing.queries = [];
    } catch {}
  }

  const querySet = new Set(
    existing.queries.map((q: unknown) => {
      if (typeof q === 'string') return q;
      if (q && typeof q === 'object' && 'query' in q) return String((q as { query: string }).query);
      return String(q);
    })
  );

  let addedCount = 0;
  for (const q of newGenerated) {
    if (!querySet.has(q)) {
      querySet.add(q);
      existing.queries.push(q);
      addedCount++;
    }
  }

  existing.metadata = {
    ...existing.metadata,
    totalQueries: existing.queries.length,
    lastUpdated: new Date().toISOString(),
  };

  const tmpSq = SQ_FILE + '.tmp';
  fs.writeFileSync(tmpSq, JSON.stringify(existing, null, 2), 'utf8');
  fs.renameSync(tmpSq, SQ_FILE);

  return {
    success: true,
    addedCount,
    totalQueries: existing.queries.length,
  };
}

export function addCustomQueries(queries: string[] = []): { success: boolean; addedCount: number; totalQueries: number } {
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error('Queries list cannot be empty.');
  }

  let existing: { metadata: Record<string, unknown>; storeTypes: string[]; queries: unknown[] } = {
    metadata: {},
    storeTypes: [],
    queries: [],
  };

  if (fs.existsSync(SQ_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(SQ_FILE, 'utf8'));
      if (!Array.isArray(existing.queries)) existing.queries = [];
    } catch {}
  }

  const querySet = new Set(
    existing.queries.map((q: unknown) => {
      if (typeof q === 'string') return q;
      if (q && typeof q === 'object' && 'query' in q) return String((q as { query: string }).query);
      return String(q);
    })
  );

  let addedCount = 0;
  for (const raw of queries) {
    const q = String(raw).trim();
    if (q && !querySet.has(q)) {
      querySet.add(q);
      existing.queries.push(q);
      addedCount++;
    }
  }

  existing.metadata = {
    ...existing.metadata,
    totalQueries: existing.queries.length,
    lastUpdated: new Date().toISOString(),
  };

  const tmpSq = SQ_FILE + '.tmp';
  fs.writeFileSync(tmpSq, JSON.stringify(existing, null, 2), 'utf8');
  fs.renameSync(tmpSq, SQ_FILE);

  return {
    success: true,
    addedCount,
    totalQueries: existing.queries.length,
  };
}

export function clearCompletedQueries(): { success: boolean; cleared: number } {
  if (!fs.existsSync(DB_FILE)) {
    return { success: true, cleared: 0 };
  }

  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const count = (db.completedQueries || []).length;
  db.completedQueries = [];

  const tmpDb = DB_FILE + '.tmp';
  fs.writeFileSync(tmpDb, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpDb, DB_FILE);

  return { success: true, cleared: count };
}
