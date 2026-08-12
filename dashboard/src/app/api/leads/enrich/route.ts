import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * /api/leads/enrich — Enrich leads that have no email through the
 * owner-discovery pipeline (deep website harvest, owner identity search,
 * name-pattern SMTP verification, graded fallbacks) and write found emails
 * back to leads_db.json with pre-send quality rescore.
 *
 * Each result also carries pipeline metadata (confidence, source, ownerName,
 * stages) so the dashboard can grade lead quality per email found.
 *
 * The actual probing runs in the repo's scripts/enrich_emails_cli.js wrapper
 * (root CommonJS context) via child_process — the dashboard's Turbopack
 * runtime cannot resolve root CJS modules directly.
 *
 * Payload: { allMissing?: boolean, emails?: string[] }  (emails = leads_db keys)
 */
const ROOT = join(process.cwd(), '..');
const CLI = join(ROOT, 'scripts', 'enrich_emails_cli.js');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const enrichAll = Boolean(body?.allMissing);
    const keyList: string[] = Array.isArray(body?.emails) ? (body.emails as string[]).map(String) : [];
    if (!enrichAll && keyList.length === 0) {
      return NextResponse.json({ error: 'Provide allMissing:true or a non-empty emails list' }, { status: 400 });
    }
    if (!existsSync(CLI)) {
      return NextResponse.json({ error: 'Enrichment CLI not found' }, { status: 500 });
    }

    const args = enrichAll ? ['all'] : ['keys', ...keyList];

    /* generous timeout: each lead may crawl up to 8 pages + 2 searches + SMTP probes (~25s worst case) */
    const timeoutMs = Math.max(60000, 40000 + (enrichAll ? 60 : keyList.length) * 30000);
    const result = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Enrichment timed out')), timeoutMs);
      execFile(process.execPath, [CLI, ...args], { timeout: timeoutMs }, (err, stdout, stderr) => {
        clearTimeout(timeout);
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout.trim());
      });
    });

    let parsed: { enriched?: number; found?: number; results?: unknown[] };
    try {
      parsed = JSON.parse(result) as { enriched?: number; found?: number; results?: unknown[] };
    } catch {
      return NextResponse.json({ error: 'Failed to parse enrichment output' }, { status: 500 });
    }

    return NextResponse.json({
      enriched: parsed.enriched ?? 0,
      found: parsed.found ?? 0,
      results: parsed.results ?? [],
    });
  } catch (err: unknown) {
    console.error('Error enriching leads:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to enrich leads' }, { status: 500 });
  }
}
