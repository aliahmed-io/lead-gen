import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { LeadRecord, BusinessDbRecord } from '@/types';

export async function GET() {
  try {
    const dbPath = path.resolve(process.cwd(), '../leads_db.json');
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ total: 0, contacted: 0, sent: 0, replied: 0, bounced: 0, completed: 0, conversion: 0 });
    }
    
    let data;
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch {
      return NextResponse.json({ total: 0, contacted: 0, sent: 0, replied: 0, bounced: 0, completed: 0, conversion: 0 });
    }
    
    let records: LeadRecord[] = [];
    if (data.businesses) {
      const businesses = data.businesses as Record<string, BusinessDbRecord>;
      
      let campaignData: any = { records: {} };
      try {
        const campaignPath = path.resolve(process.cwd(), '../campaign_db.json');
        if (fs.existsSync(campaignPath)) {
          campaignData = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
        }
      } catch {}

      records = Object.values(businesses).map((b) => {
        const campaignRecord = campaignData.records[b.email];
        return {
          email: b.email,
          businessName: b.name,
          platform: b.platform,
          status: campaignRecord ? campaignRecord.status : (b.emailStatus || 'found'),
        };
      });
    } else if (data.records) {
      records = Object.values(data.records as Record<string, LeadRecord>);
    }
    
    const total = records.length;
    const sent = records.filter((r: LeadRecord) => r.status === 'sent' || String(r.status).startsWith('followed_up')).length;
    const replied = records.filter((r: LeadRecord) => r.status === 'interested').length;
    const bounced = records.filter((r: LeadRecord) => r.status === 'bounced' || r.status === 'failed').length;
    const completed = records.filter((r: LeadRecord) => r.status === 'completed_no_interest').length;
    
    const contacted = sent + replied + bounced + completed;
    const conversion = contacted > 0 ? ((replied / contacted) * 100).toFixed(2) : 0;

    return NextResponse.json({
      total,
      contacted,
      sent,
      replied,
      bounced,
      completed,
      conversion
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read stats' }, { status: 500 });
  }
}
