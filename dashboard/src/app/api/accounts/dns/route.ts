import { NextResponse } from 'next/server';
import dns from 'dns';

const dnsPromises = dns.promises;

async function checkSPF(domain: string) {
  try {
    const records = await dnsPromises.resolveTxt(domain);
    const spf = records.find(r => r.join('').startsWith('v=spf1'));
    if (spf) {
      const value = spf.join('');
      const includesGoogle = value.includes('include:_spf.google.com');
      return {
        pass: true,
        record: value,
        warning: !includesGoogle ? 'SPF found but does not include Google mail servers.' : null,
      };
    }
    return { pass: false, record: null, warning: 'No SPF record found.' };
  } catch (err: unknown) {
    return { pass: false, record: null, warning: `SPF lookup failed: ${(err as Error).message}` };
  }
}

async function checkDMARC(domain: string) {
  try {
    const records = await dnsPromises.resolveTxt(`_dmarc.${domain}`);
    const dmarc = records.find(r => r.join('').startsWith('v=DMARC1'));
    if (dmarc) {
      const value = dmarc.join('');
      const policy = value.match(/p=([^;]+)/)?.[1] || 'none';
      return {
        pass: true,
        policy,
        record: value,
        warning: policy === 'none'
          ? 'DMARC policy is "none" — consider upgrading to "quarantine".'
          : null,
      };
    }
    return { pass: false, record: null, warning: 'No DMARC record found.' };
  } catch (err: unknown) {
    return { pass: false, record: null, warning: `DMARC lookup failed: ${(err as Error).message}` };
  }
}

async function checkMX(domain: string) {
  try {
    const records = await dnsPromises.resolveMx(domain);
    if (records?.length > 0) {
      return { pass: true, records: records.map(r => r.exchange) };
    }
    return { pass: false, records: [], warning: 'No MX records found.' };
  } catch (err: unknown) {
    return { pass: false, records: [], warning: `MX lookup failed: ${(err as Error).message}` };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'email query parameter is required' }, { status: 400 });
    }

    const domain = email.split('@')[1];
    if (!domain) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const [spf, dmarc, mx] = await Promise.all([
      checkSPF(domain),
      checkDMARC(domain),
      checkMX(domain),
    ]);

    const criticalFails = [!spf.pass, !dmarc.pass, !mx.pass].filter(Boolean).length;
    const warnings = [spf.warning, dmarc.warning, mx.warning].filter(Boolean);

    let overall: 'good' | 'warning' | 'fail' = 'good';
    if (criticalFails >= 2) overall = 'fail';
    else if (criticalFails === 1 || warnings.length > 0) overall = 'warning';

    return NextResponse.json({
      domain,
      overall,
      spf,
      dmarc,
      mx,
      summary: criticalFails === 0
        ? warnings.length > 0
          ? `DNS configured but has ${warnings.length} warning(s).`
          : 'All DNS records correctly configured.'
        : `${criticalFails} critical DNS record(s) missing.`,
      checkedAt: Date.now(),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
