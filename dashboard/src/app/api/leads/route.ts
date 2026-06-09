import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { LeadRecord, BusinessDbRecord } from '@/types';

export async function GET() {
  try {
    const dbPath = path.resolve(process.cwd(), '../leads_db.json');
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ records: [] });
    }
    
    let data;
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch {
      return NextResponse.json({ records: [] });
    }
    
    let rawRecords: LeadRecord[] = [];
    if (data.businesses) {
      const businesses = data.businesses as Record<string, BusinessDbRecord>;
      
      let campaignData: any = { records: {} };
      try {
        const campaignPath = path.resolve(process.cwd(), '../campaign_db.json');
        if (fs.existsSync(campaignPath)) {
          campaignData = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
        }
      } catch {}

      rawRecords = Object.values(businesses).map((b) => {
        const campaignRecord = campaignData.records[b.email];
        return {
          email: b.email,
          businessName: b.name,
          platform: b.platform,
          status: campaignRecord ? campaignRecord.status : (b.emailStatus || 'found'),
          updatedAt: b.updatedAt ? new Date(b.updatedAt).getTime() : 0,
          sentAt: campaignRecord?.sentAt,
          repliedAt: campaignRecord?.repliedAt,
          bouncedAt: campaignRecord?.bouncedAt
        };
      });
    } else if (data.records) {
      rawRecords = Object.values(data.records as Record<string, LeadRecord>);
    }

    const records = rawRecords.sort((a: LeadRecord, b: LeadRecord) => {
      const timeA = Number(a.repliedAt || a.completedAt || a.followedUp2At || a.followedUp1At || a.sentAt || a.updatedAt || 0);
      const timeB = Number(b.repliedAt || b.completedAt || b.followedUp2At || b.followedUp1At || b.sentAt || b.updatedAt || 0);
      return timeB - timeA;
    });
    
    return NextResponse.json({ records });
  } catch {
    return NextResponse.json({ error: 'Failed to read leads' }, { status: 500 });
  }
}
