import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

type HealthStatus = 'pass' | 'warn' | 'fail';

type HealthCheck = {
  name: string;
  category: string;
  status: HealthStatus;
  detail: string;
};

const dataRoot = path.resolve(process.cwd(), '..');

function readJson<T extends Record<string, unknown>>(fileName: string): T | null {
  try {
    const filePath = path.join(dataRoot, fileName);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const settings = readJson<{ accounts?: unknown[] }>('settings.json');
  const leadsDb = readJson<Record<string, unknown>>('leads_db.json');
  const campaignDb = readJson<{ unsubscribed?: unknown[]; alerts?: unknown[] }>('campaign_db.json');
  const accounts = Array.isArray(settings?.accounts) ? settings.accounts : [];
  const hasLeadsDb = Boolean(leadsDb);
  const hasCampaignDb = Boolean(campaignDb);
  const encryptionKeySet = Boolean(process.env.ENCRYPTION_KEY);

  const checks: HealthCheck[] = [
    {
      name: 'Database Status',
      category: 'Storage',
      status: hasLeadsDb && hasCampaignDb ? 'pass' : 'fail',
      detail: hasLeadsDb && hasCampaignDb
        ? 'Lead and campaign data files are readable in this runtime.'
        : 'Durable lead and campaign storage is unavailable. Configure a persistent database before launch.',
    },
    {
      name: 'Encryption Key',
      category: 'Security',
      status: encryptionKeySet ? 'pass' : 'warn',
      detail: encryptionKeySet
        ? 'Account passwords can be decrypted for SMTP/IMAP.'
        : 'ENCRYPTION_KEY missing — passwords cannot be decrypted; re-save account credentials or set the key.',
    },
    {
      name: 'SMTP Accounts Configured',
      category: 'Deliverability',
      status: accounts.length > 0 ? 'pass' : 'fail',
      detail: accounts.length > 0
        ? `${accounts.length} mailbox${accounts.length === 1 ? '' : 'es'} configured for rotation.`
        : 'No SMTP accounts configured — outreach cannot send.',
    },
    {
      name: 'IMAP Reply Sync',
      category: 'Deliverability',
      status: 'fail',
      detail: 'The IMAP worker is not running inside this request-scoped dashboard deployment.',
    },
    {
      name: 'SPF Policy',
      category: 'DNS',
      status: 'warn',
      detail: 'DNS policy is not verified by this endpoint.',
    },
    {
      name: 'DKIM Signatures',
      category: 'DNS',
      status: 'warn',
      detail: 'DKIM signing is not verified by this endpoint.',
    },
    {
      name: 'DMARC Enforcement',
      category: 'DNS',
      status: 'warn',
      detail: 'DMARC policy is not verified by this endpoint.',
    },
    {
      name: 'Bounce Threshold',
      category: 'Protection',
      status: settings ? 'pass' : 'warn',
      detail: settings ? 'Bounce threshold configuration is readable.' : 'Bounce threshold configuration is unavailable.',
    },
    {
      name: 'Global Suppression',
      category: 'Protection',
      status: Array.isArray(campaignDb?.unsubscribed) ? 'pass' : 'warn',
      detail: Array.isArray(campaignDb?.unsubscribed)
        ? 'Suppression list is readable.'
        : 'Suppression list is unavailable until persistent campaign storage is configured.',
    },
    {
      name: 'Gaussian Delay Engine',
      category: 'Timing',
      status: 'warn',
      detail: 'Delay logic exists in the standalone worker, which is not running in this deployment.',
    },
    {
      name: 'Business Hours Clock',
      category: 'Timing',
      status: 'warn',
      detail: 'Business-hour scheduling exists in the standalone worker, which is not running in this deployment.',
    },
  ];

  if (Array.isArray(campaignDb?.alerts) && campaignDb.alerts.length > 0) {
    checks.push({
      name: 'Deliverability Alerts',
      category: 'Protection',
      status: 'warn',
      detail: `${campaignDb.alerts.length} deliverability notice(s) active.`,
    });
  }

  const overall = checks.some((check) => check.status === 'fail')
    ? 'critical'
    : checks.some((check) => check.status === 'warn')
      ? 'warning'
      : 'good';

  return NextResponse.json({ overall, checks, timestamp: Date.now() });
}
