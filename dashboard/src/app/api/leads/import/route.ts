import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { leads = [] } = body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: 'No valid leads provided for import' }, { status: 400 });
    }

    const dbPath = path.resolve(process.cwd(), '../leads_db.json');
    let dbData: { businesses?: Record<string, unknown>; records?: Record<string, unknown> } = { businesses: {} };

    let release: (() => Promise<void>) | null = null;
    if (fs.existsSync(dbPath)) {
      release = await lockfile.lock(dbPath, { retries: 5 });
      try {
        dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      } catch {}
    }

    if (!dbData.businesses) dbData.businesses = {};

    let importedCount = 0;
    let duplicateCount = 0;

    for (const lead of leads) {
      const email = (lead.email || '').trim().toLowerCase();
      const businessName = lead.businessName || lead.name || 'Business';
      const key = email || `${businessName}_${Date.now()}`;

      if (email && dbData.businesses[email]) {
        duplicateCount++;
        continue;
      }

      dbData.businesses[key] = {
        name: businessName,
        email: email || undefined,
        platform: lead.platform || 'Other',
        website: lead.website || undefined,
        city: lead.city || undefined,
        state: lead.state || undefined,
        emailStatus: lead.email ? 'verified' : 'found',
        updatedAt: new Date().toISOString(),
      };
      importedCount++;
    }

    const tempPath = `${dbPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(dbData, null, 2), 'utf8');
    fs.renameSync(tempPath, dbPath);

    if (release) await release();

    return NextResponse.json({
      success: true,
      importedCount,
      duplicateCount,
      totalCount: Object.keys(dbData.businesses).length
    });
  } catch (err: unknown) {
    console.error('Error importing leads:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
