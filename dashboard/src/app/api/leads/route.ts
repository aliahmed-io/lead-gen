import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { LeadRecord, BusinessDbRecord } from '@/types';
import { verifyEmail } from './verifier';

const dbPath = path.resolve(process.cwd(), '../leads_db.json');
const campaignDbPath = path.resolve(process.cwd(), '../campaign_db.json');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const statusFilter = searchParams.get('status');
    const platformFilter = searchParams.get('platform');
    const stateFilter = searchParams.get('state');
    const searchQuery = searchParams.get('search')?.toLowerCase() || '';
    const allowedSortFields = [
      'activity', 'businessName', 'email', 'website', 'city', 'state', 'platform', 'status',
      'sentAt', 'followedUp1At', 'followedUp2At', 'repliedAt', 'completedAt', 'updatedAt'
    ];
    let sortBy = searchParams.get('sortBy') || 'activity';
    if (!allowedSortFields.includes(sortBy)) {
      sortBy = 'activity';
    }
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ records: [], total: 0, page: 1, totalPages: 0 });
    }

    let data;
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch {
      return NextResponse.json({ records: [], total: 0, page: 1, totalPages: 0 });
    }

    interface CampaignData {
      records: Record<string, { status?: string; sentAt?: number; followedUp1At?: number; followedUp2At?: number; repliedAt?: number; bouncedAt?: number; completedAt?: number; state?: string; city?: string; website?: string; }>;
    }
    let campaignData: CampaignData = { records: {} };
    if (fs.existsSync(campaignDbPath)) {
      try {
        campaignData = JSON.parse(fs.readFileSync(campaignDbPath, 'utf8'));
      } catch {}
    }
    if (!campaignData.records) campaignData.records = {};

    let rawRecords: LeadRecord[] = [];
    if (data.businesses) {
      const businesses = data.businesses as Record<string, BusinessDbRecord>;
      rawRecords = Object.values(businesses).map((b) => {
        const campaignRecord = campaignData.records[b.email || ''];
        return {
          email: b.email,
          businessName: b.name,
          platform: b.platform,
          status: campaignRecord ? campaignRecord.status : (b.emailStatus || 'found'),
          updatedAt: b.updatedAt ? new Date(b.updatedAt).getTime() : 0,
          sentAt: campaignRecord?.sentAt,
          followedUp1At: campaignRecord?.followedUp1At,
          followedUp2At: campaignRecord?.followedUp2At,
          repliedAt: campaignRecord?.repliedAt,
          bouncedAt: campaignRecord?.bouncedAt,
          completedAt: campaignRecord?.completedAt,
          state: b.state || campaignRecord?.state || '',
          city: b.city || campaignRecord?.city || '',
          website: b.website || campaignRecord?.website || '',
        };
      });
    } else if (data.records) {
      rawRecords = Object.values(data.records as Record<string, LeadRecord>);
    }

    // Filtering
    let filteredRecords = rawRecords;
    if (statusFilter && statusFilter !== 'all') {
      filteredRecords = filteredRecords.filter((r) => {
        if (statusFilter === 'followed_up') {
          return String(r.status).startsWith('followed_up');
        }
        return r.status === statusFilter;
      });
    }

    if (platformFilter && platformFilter !== 'all') {
      filteredRecords = filteredRecords.filter((r) => r.platform?.toLowerCase() === platformFilter.toLowerCase());
    }

    if (stateFilter && stateFilter !== 'all') {
      filteredRecords = filteredRecords.filter((r) => r.state?.toLowerCase() === stateFilter.toLowerCase());
    }

    if (searchQuery) {
      filteredRecords = filteredRecords.filter((r) => {
        return (
          r.email?.toLowerCase().includes(searchQuery) ||
          r.businessName?.toLowerCase().includes(searchQuery) ||
          r.status?.toLowerCase().includes(searchQuery) ||
          r.website?.toLowerCase().includes(searchQuery) ||
          r.city?.toLowerCase().includes(searchQuery) ||
          r.state?.toLowerCase().includes(searchQuery)
        );
      });
    }

    // Dynamic Sorting
    if (sortBy === 'activity') {
      filteredRecords.sort((a: LeadRecord, b: LeadRecord) => {
        const timeA = Number(a.repliedAt || a.completedAt || a.followedUp2At || a.followedUp1At || a.sentAt || a.updatedAt || 0);
        const timeB = Number(b.repliedAt || b.completedAt || b.followedUp2At || b.followedUp1At || b.sentAt || b.updatedAt || 0);
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    } else {
      filteredRecords.sort((a: LeadRecord, b: LeadRecord) => {
        const valA = a[sortBy];
        const valB = b[sortBy];

        // Push null/undefined values to the bottom regardless of order
        const isNilA = valA === undefined || valA === null || valA === '';
        const isNilB = valB === undefined || valB === null || valB === '';
        if (isNilA && isNilB) return 0;
        if (isNilA) return 1;
        if (isNilB) return -1;

        if (typeof valA === 'string' && typeof valB === 'string') {
          const comp = valA.localeCompare(valB, undefined, { sensitivity: 'base', numeric: true });
          return sortOrder === 'desc' ? -comp : comp;
        } else {
          const numA = Number(valA);
          const numB = Number(valB);
          return sortOrder === 'desc' ? numB - numA : numA - numB;
        }
      });
    }

    const total = filteredRecords.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedRecords = filteredRecords.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      records: paginatedRecords,
      total,
      page,
      totalPages,
    });
  } catch (err: unknown) {
    console.error('Error getting leads:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to read leads' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, emails } = await request.json();

    if (!action || !emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    interface CampaignData {
      records: Record<string, { email?: string; status?: string; bouncedAt?: number; updatedAt?: number; repliedAt?: number; }>;
      unsubscribed: string[];
      activityLog: { email: string; from: string | null; to: string; at: number; }[];
    }
    let campaignData: CampaignData = { records: {}, unsubscribed: [], activityLog: [] };
    if (fs.existsSync(campaignDbPath)) {
      try {
        campaignData = JSON.parse(fs.readFileSync(campaignDbPath, 'utf8'));
      } catch {}
    }

    if (!campaignData.records) campaignData.records = {};
    if (!campaignData.unsubscribed) campaignData.unsubscribed = [];
    if (!campaignData.activityLog) campaignData.activityLog = [];

    const now = Date.now();

    if (action === 'verify') {

      const results = [];
      for (const email of emails) {
        const normalizedEmail = email.toLowerCase().trim();
        const res = await verifyEmail(normalizedEmail);
        results.push({ email: normalizedEmail, ...res });

        if (!res.valid) {
          // Auto-mark as bounced in campaign database
          const oldRecord = campaignData.records[normalizedEmail] || {};
          const oldStatus = oldRecord.status || null;
          const newStatus = 'bounced';

          campaignData.records[normalizedEmail] = {
            ...oldRecord,
            email: normalizedEmail,
            status: newStatus,
            bouncedAt: now,
            updatedAt: now,
          };

          if (oldStatus !== newStatus) {
            campaignData.activityLog.push({
              email: normalizedEmail,
              from: oldStatus,
              to: newStatus,
              at: now,
            });
          }
        }
      }

      // Save campaign database atomically
      const tempPath = campaignDbPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(campaignData, null, 2), 'utf8');
      fs.renameSync(tempPath, campaignDbPath);

      return NextResponse.json({ success: true, results });
    }

    for (const email of emails) {
      const normalizedEmail = email.toLowerCase().trim();

      if (action === 'unsubscribe') {
        if (!campaignData.unsubscribed.includes(normalizedEmail)) {
          campaignData.unsubscribed.push(normalizedEmail);
        }

        const oldRecord = campaignData.records[normalizedEmail] || {};
        const oldStatus = oldRecord.status || null;
        const newStatus = 'completed_no_interest';

        campaignData.records[normalizedEmail] = {
          ...oldRecord,
          email: normalizedEmail,
          status: newStatus,
          updatedAt: now,
        };

        if (oldStatus !== newStatus) {
          campaignData.activityLog.push({
            email: normalizedEmail,
            from: oldStatus,
            to: newStatus,
            at: now,
          });
        }
      } else if (action === 'mark_interested') {
        const oldRecord = campaignData.records[normalizedEmail] || {};
        const oldStatus = oldRecord.status || null;
        const newStatus = 'interested';

        campaignData.records[normalizedEmail] = {
          ...oldRecord,
          email: normalizedEmail,
          status: newStatus,
          repliedAt: now,
          updatedAt: now,
        };

        if (oldStatus !== newStatus) {
          campaignData.activityLog.push({
            email: normalizedEmail,
            from: oldStatus,
            to: newStatus,
            at: now,
          });
        }
      }
    }

    // Save campaign database atomically
    const tempPath = campaignDbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(campaignData, null, 2), 'utf8');
    fs.renameSync(tempPath, campaignDbPath);

    return NextResponse.json({ success: true, count: emails.length });
  } catch (err: unknown) {
    console.error('Error executing bulk action:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to execute bulk action' }, { status: 500 });
  }
}
