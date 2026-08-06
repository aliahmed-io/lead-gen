import { NextResponse } from 'next/server';
import dns from 'dns/promises';
import { analyzeSpamScore, SpamCheckRequest } from '@/lib/spam-checker';

export async function POST(request: Request) {
  try {
    const body: SpamCheckRequest = await request.json();
    const email = body.email || '';
    const domain = body.domain || (email.includes('@') ? email.split('@')[1] : '');

    const dnsStatus = { spf: false, dkim: false, dmarc: false };

    if (domain) {
      // 1. Check SPF
      try {
        const spfTxts = await dns.resolveTxt(domain);
        dnsStatus.spf = spfTxts.some(r => r.join('').includes('v=spf1'));
      } catch (e) {}

      // 2. Check DKIM (google._domainkey)
      try {
        const dkimTxts = await dns.resolveTxt(`google._domainkey.${domain}`);
        dnsStatus.dkim = dkimTxts.some(r => r.join('').includes('v=DKIM1') || r.join('').includes('p='));
      } catch (e) {}

      // 3. Check DMARC (_dmarc)
      try {
        const dmarcTxts = await dns.resolveTxt(`_dmarc.${domain}`);
        dnsStatus.dmarc = dmarcTxts.some(r => r.join('').includes('v=DMARC1'));
      } catch (e) {}
    }

    const report = analyzeSpamScore(body, domain ? dnsStatus : undefined);

    return NextResponse.json({
      success: true,
      domain,
      dnsStatus,
      report
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
