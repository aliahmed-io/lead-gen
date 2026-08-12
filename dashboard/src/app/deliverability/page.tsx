'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Gauge, MailOpen, TrendingUp, Activity, ShieldAlert, ShieldCheck,
  Shield, Eye, MousePointerClick, AlertTriangle, Info,
} from 'lucide-react';
import { PageHeader, PageSkeleton } from '@/components/ui/page';
import Link from 'next/link';

interface AccountStats {
  id: string;
  sentToday: number;
  totalSent: number;
  bounceCount: number;
  bounceRate: number;
  replyCount: number;
  replyRate: number;
  openCount: number;
  clickCount: number;
  lastActiveAt: number | null;
  health: 'healthy' | 'watch' | 'recovering' | 'paused' | 'unknown';
}

interface DailyRow {
  date: string;
  sent: number;
  bounced: number;
  replied: number;
  opened: number;
  clicked: number;
}

interface DeliverabilityData {
  accounts: AccountStats[];
  daily: DailyRow[];
  overall: {
    totalSent: number;
    bounceCount: number;
    bounceRate: number;
    replyCount: number;
    replyRate: number;
    openCount: number;
    clickCount: number;
  };
}

const HEALTH_META: Record<AccountStats['health'], { label: string; color: string; icon: typeof ShieldCheck; advice: string }> = {
  healthy: { label: 'Healthy', color: 'var(--success)', icon: ShieldCheck, advice: 'Deliverability looks good — keep the current pace.' },
  watch: { label: 'Watch', color: 'var(--warning)', icon: AlertTriangle, advice: 'Bounce rate above 2%. Slow down sending and review recent bounces.' },
  recovering: { label: 'Recovering', color: 'var(--info)', icon: TrendingUp, advice: 'Ramping back up after a pause. Increase volume gradually.' },
  paused: { label: 'Paused', color: 'var(--danger)', icon: ShieldAlert, advice: 'High bounce rate (>4%) — sending paused automatically. Investigate the source list.' },
  unknown: { label: 'Unknown', color: 'var(--text-muted)', icon: Shield, advice: 'No sending data yet for this account.' },
};

export default function Deliverability() {
  const [data, setData] = useState<DeliverabilityData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDeliverability = useCallback(async () => {
    try {
      const res = await fetch('/api/deliverability');
      if (res.ok) setData(await res.json());
    } catch {
      /* non-fatal — keep showing last data or empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => { await fetchDeliverability(); })();
  }, [fetchDeliverability]);

  if (loading || !data) return <PageSkeleton message="Loading deliverability data…" />;

  const hasTraffic = data.overall.totalSent > 0 || data.daily.some(d => d.sent > 0);
  const healthyCount = data.accounts.filter(a => a.health === 'healthy').length;
  const atRiskCount = data.accounts.filter(a => a.health === 'watch' || a.health === 'paused').length;

  const adviceItems: { severity: 'critical' | 'warning' | 'info'; title: string; detail: string }[] = [];
  for (const a of data.accounts) {
    if (a.health === 'paused') adviceItems.push({ severity: 'critical', title: `Account ${a.id} paused`, detail: `Bounce rate ${(a.bounceRate * 100).toFixed(1)}% exceeded 4%. Review list quality before resuming.` });
    else if (a.health === 'watch') adviceItems.push({ severity: 'warning', title: `Account ${a.id} on watch`, detail: `Bounce rate ${(a.bounceRate * 100).toFixed(1)}% is above 2%. Consider cooling down.` });
  }
  if (data.overall.bounceRate > 0.02) adviceItems.push({ severity: 'warning', title: 'Overall bounce rate elevated', detail: `Aggregate bounce rate is ${(data.overall.bounceRate * 100).toFixed(1)}%. Check for stale lists or hard bounces.` });
  if (data.overall.replyRate < 0.02 && data.overall.totalSent > 20) adviceItems.push({ severity: 'info', title: 'Reply rate below 2%', detail: 'Consider revisiting subject lines and the first line of your templates.' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      <PageHeader
        title="Deliverability"
        subtitle="Account health, bounce/reply trends, and reputation signals across your sending accounts."
        onRefresh={fetchDeliverability}
        refreshLoading={loading}
      />

      {/* ── Overall summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Total sent', value: data.overall.totalSent.toLocaleString(), icon: MailOpen, tone: 'var(--text-primary)' },
          { label: 'Bounce rate', value: `${(data.overall.bounceRate * 100).toFixed(2)}%`, icon: Gauge, tone: data.overall.bounceRate > 0.02 ? 'var(--danger)' : 'var(--success)' },
          { label: 'Reply rate', value: `${(data.overall.replyRate * 100).toFixed(2)}%`, icon: Activity, tone: 'var(--honey-500)' },
          { label: 'Opens', value: data.overall.openCount.toLocaleString(), icon: Eye, tone: 'var(--info)' },
          { label: 'Clicks', value: data.overall.clickCount.toLocaleString(), icon: MousePointerClick, tone: 'var(--success)' },
          { label: 'Accounts healthy', value: `${healthyCount}/${data.accounts.length}`, icon: ShieldCheck, tone: atRiskCount > 0 ? 'var(--warning)' : 'var(--success)' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              <card.icon size={13} /> {card.label}
            </div>
            <p style={{ fontSize: '24px', fontWeight: 800, color: card.tone, margin: '6px 0 0', fontFamily: 'var(--font-serif)' }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Alerts ── */}
      {adviceItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {adviceItems.map(a => (
            <div
              key={a.title}
              role="alert"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '12px 16px', borderRadius: '12px', fontSize: '13px',
                background: a.severity === 'critical' ? 'var(--danger-bg)' : a.severity === 'warning' ? 'var(--warning-bg)' : 'var(--info-bg)',
                border: `1px solid ${a.severity === 'critical' ? 'rgba(181, 78, 69, 0.18)' : a.severity === 'warning' ? 'rgba(178, 120, 40, 0.2)' : 'rgba(59, 100, 160, 0.15)'}`,
                color: a.severity === 'critical' ? 'var(--danger)' : a.severity === 'warning' ? 'var(--warning)' : 'var(--info)',
              }}
            >
              {a.severity === 'critical' ? <AlertTriangle size={15} style={{ marginTop: '2px' }} /> : <Info size={15} style={{ marginTop: '2px' }} />}
              <span>
                <strong>{a.title}.</strong> {a.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Per-account health ── */}
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Sending accounts</h2>
        {data.accounts.length === 0 ? (
          <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No sending accounts found in the campaign database yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {data.accounts.map(a => {
              const meta = HEALTH_META[a.health];
              const Icon = meta.icon;
              return (
                <div key={a.id} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                    }}>
                      {a.id}
                    </span>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      fontSize: '11px', fontWeight: 700, color: meta.color,
                      padding: '2px 8px', borderRadius: '99px',
                      background: `${meta.color}14`, border: `1px solid ${meta.color}40`,
                      whiteSpace: 'nowrap',
                    }}>
                      <Icon size={11} /> {meta.label}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Sent today</p>
                      <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0' }}>{a.sentToday}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Total sent</p>
                      <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0' }}>{a.totalSent}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Bounce rate</p>
                      <p style={{ fontSize: '16px', fontWeight: 700, margin: '2px 0 0', color: a.bounceRate > 0.02 ? 'var(--danger)' : 'var(--text-primary)' }}>
                        {(a.bounceRate * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Reply rate</p>
                      <p style={{ fontSize: '16px', fontWeight: 700, margin: '2px 0 0', color: 'var(--text-primary)' }}>
                        {(a.replyRate * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    {a.lastActiveAt ? `Last active ${new Date(a.lastActiveAt).toLocaleString(undefined, { dateStyle: 'medium' })}. ${meta.advice}` : meta.advice}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 30-day trends ── */}
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>30-day trends</h2>
        {!hasTraffic ? (
          <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No sending activity in the last 30 days. Trends will appear once campaigns start sending.
          </div>
        ) : (
          <div className="card" style={{ padding: '20px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickFormatter={d => d.slice(5)}
                  minTickGap={28}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={36} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-base)', border: '1px solid var(--border-default)',
                    borderRadius: '12px', fontSize: '12px', boxShadow: '0 8px 24px rgba(44, 34, 25, 0.08)',
                  }}
                  labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="sent" name="Sent" stroke="var(--honey-500)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="bounced" name="Bounced" stroke="var(--danger)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="replied" name="Replied" stroke="var(--success)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="opened" name="Opened" stroke="var(--info)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Healthy: bounce rate under 2%. Watch: 2–4%. Paused: above 4% (automatic).
          <Link href="/accounts" style={{ color: 'var(--honey-500)', textDecoration: 'none', marginLeft: '6px' }}>Manage accounts →</Link>
        </p>
      </div>
    </motion.div>
  );
}
