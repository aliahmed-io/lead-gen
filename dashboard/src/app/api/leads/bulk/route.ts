import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../leads_db.json');
const campaignDbPath = path.resolve(process.cwd(), '../campaign_db.json');

/**
 * Leads-database bulk actions: delete, reset_to_pending, unsuppress.
 * Payload: { action: 'delete' | 'reset_to_pending' | 'unsuppress', emails: string[] }
 * where emails are the leads_db.json record keys (business domain/name keys).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || '');
    const emailList: string[] = Array.isArray(body?.emails) ? (body.emails as string[]).map(String) : [];
    if (!action || emailList.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: 'Leads database not found' }, { status: 404 });
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch {
      return NextResponse.json({ error: 'Failed to read leads database' }, { status: 500 });
    }
    const businesses = (data.businesses || {}) as Record<string, Record<string, unknown>>;
    if (!data.businesses) data.businesses = businesses;

    /* Payload 'emails' are leads_db record keys (business keys, which may
     * not be email addresses themselves). Resolve them to actual lead emails
     * so campaign_db lookups work for leads without emails too. */
    const campaignEmails = emailList
      .map(k => String(businesses[k]?.email || ''))
      .filter(e => e);

    let affected = 0;

    if (action === 'delete') {
      const keysToRemove = emailList.filter(e => businesses[e]);
      const removedEmails = keysToRemove
        .map(k => String(businesses[k]?.email || k))
        .filter(e => e);
      for (const key of keysToRemove) {
        delete businesses[key];
        affected++;
      }
      if (fs.existsSync(campaignDbPath) && removedEmails.length > 0) {
        let campaignData: Record<string, unknown>;
        try {
          campaignData = JSON.parse(fs.readFileSync(campaignDbPath, 'utf8'));
        } catch {
          campaignData = {};
        }
        const records = (campaignData.records || {}) as Record<string, unknown>;
        for (const email of removedEmails) {
          if (records[email]) {
            delete records[email];
            affected++;
          }
        }
        campaignData.records = records;
        const tempPath = campaignDbPath + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(campaignData, null, 2), 'utf8');
        fs.renameSync(tempPath, campaignDbPath);
      }
    } else if (action === 'reset_to_pending') {
      if (!fs.existsSync(campaignDbPath)) {
        return NextResponse.json({ error: 'No campaign activity to reset' }, { status: 404 });
      }
      let campaignData: Record<string, unknown>;
      try {
        campaignData = JSON.parse(fs.readFileSync(campaignDbPath, 'utf8'));
      } catch {
        campaignData = {};
      }
      const records = (campaignData.records || {}) as Record<string, Record<string, unknown>>;
      const activityLog = Array.isArray(campaignData.activityLog)
        ? (campaignData.activityLog as Record<string, unknown>[])
        : [];
      const now = Date.now();
      for (const email of campaignEmails) {
        const record = records[email];
        if (!record) continue;
        const oldStatus = record.status || null;
        record.status = 'pending';
        record.updatedAt = now;
        delete record.sentAt;
        delete record.followedUp1At;
        delete record.followedUp2At;
        delete record.repliedAt;
        delete record.completedAt;
        delete record.bouncedAt;
        delete record.openCount;
        delete record.clickCount;
        delete record.openedAt;
        delete record.clickedAt;
        delete record.score;
        delete record.sentiment;
        if (oldStatus !== 'pending') {
          activityLog.push({ email, from: oldStatus, to: 'pending', at: now });
        }
        affected++;
      }
      campaignData.records = records;
      campaignData.activityLog = activityLog;
      const tempPath = campaignDbPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(campaignData, null, 2), 'utf8');
      fs.renameSync(tempPath, campaignDbPath);
    } else if (action === 'unsuppress') {
      if (!fs.existsSync(campaignDbPath)) {
        return NextResponse.json({ error: 'No campaign activity to unsuppress' }, { status: 404 });
      }
      let campaignData: Record<string, unknown>;
      try {
        campaignData = JSON.parse(fs.readFileSync(campaignDbPath, 'utf8'));
      } catch {
        campaignData = {};
      }
      const records = (campaignData.records || {}) as Record<string, Record<string, unknown>>;
      const unsubscribed = Array.isArray(campaignData.unsubscribed)
        ? (campaignData.unsubscribed as string[])
        : [];
      const activityLog = Array.isArray(campaignData.activityLog)
        ? (campaignData.activityLog as Record<string, unknown>[])
        : [];
      const now = Date.now();
      for (const email of campaignEmails) {
        const idx = unsubscribed.indexOf(email);
        if (idx !== -1) unsubscribed.splice(idx, 1);
        const record = records[email];
        if (record && record.status === 'completed_no_interest') {
          activityLog.push({ email, from: record.status, to: 'pending', at: now });
          record.status = 'pending';
          record.updatedAt = now;
          affected++;
        }
      }
      campaignData.records = records;
      campaignData.unsubscribed = unsubscribed;
      campaignData.activityLog = activityLog;
      const tempPath = campaignDbPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(campaignData, null, 2), 'utf8');
      fs.renameSync(tempPath, campaignDbPath);
    } else {
      return NextResponse.json({ error: `Unknown bulk action: ${action}` }, { status: 400 });
    }

    const tempPath = dbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, dbPath);
    return NextResponse.json({ success: true, count: affected });
  } catch (err: unknown) {
    console.error('Error executing leads bulk action:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to execute bulk action' }, { status: 500 });
  }
}
