'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  Send, Users, CheckCircle, XCircle, TrendingUp,
  Play, Pause as PauseIcon, Square,
  Activity, ShieldAlert, ArrowRight, Target,
  Zap, Flame, Inbox as InboxIcon, LayoutTemplate,
} from 'lucide-react';
import { EnhancedStats, CampaignState, AccountHealth } from '@/types';
import { Button } from '@/components/ui/button';
import { ErrorBanner, PageHeader, usePageRefresh } from '@/components/ui/page';

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };
const stagger = { show: { transition: { staggerChildren: 0.06 } } };

const fmt = (n?: number) => (n ?? 0).toLocaleString();

const fmtStatus = (s: string) => {
  if (s === 'followed_up_1') return 'Follow-up 1';
  if (s === 'followed_up_2') return 'Follow-up 2';
  if (s === 'completed_no_interest') return 'Opted Out';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const activityBadge = (s: string) => {
  if (s === 'interested')        return { bg: 'var(--success-bg)', color: 'var(--success)', border: 'rgba(74, 109, 75, 0.15)' };
  if (s.startsWith('followed'))  return { bg: 'rgba(161, 136, 107, 0.08)', color: 'var(--text-secondary)', border: 'rgba(161, 136, 107, 0.15)' };
  if (s === 'sent')              return { bg: 'var(--honey-100)',  color: 'var(--honey-600)', border: 'var(--honey-glow)' };
  if (s === 'bounced')           return { bg: 'var(--danger-bg)',   color: 'var(--danger)', border: 'rgba(181, 78, 69, 0.15)' };
  return                                { bg: 'var(--bg-neutral-muted)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' };
};

export default function Overview() {
  const [stats, setStats] = useState<EnhancedStats | null>(null);
  const [campaignState, setCampaignState] = useState<CampaignState | null>(null);
  const [accounts, setAccounts] = useState<AccountHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [sr, cr, ar] = await Promise.all([
        fetch('/api/stats'), fetch('/api/campaign'), fetch('/api/accounts'),
      ]);
      if (!sr.ok || !cr.ok || !ar.ok) throw new Error('Failed to fetch dashboard data');
      setStats(await sr.json());
      setCampaignState(await cr.json());
      const accountsJson = await ar.json();
      setAccounts(accountsJson.accounts || accountsJson);
      setError(null);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchData();
    });
    const iv = setInterval(fetchData, 8000);
    return () => clearInterval(iv);
     
  }, []);

  const { refresh: refreshData, refreshing } = usePageRefresh(fetchData);

  const handleCampaignAction = async (action: 'pause' | 'resume' | 'stop', reason?: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error('Campaign action failed');
      const d = await res.json();
      if (d.success) { setCampaignState(d.state); fetchData(); }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const status = campaignState?.status ?? 'running';

  // ── Loading skeleton ──────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '16px' }}>
        <motion.div
          animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--honey-500)' }}
        />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-inter)' }}>Loading dashboard…</span>
      </div>
    );
  }

  // ── Metrics ───────────────────────────────────────────────────────
  const totalLeads = stats?.total ?? 0;
  const sentCount = stats?.sent ?? 0;
  const s1 = stats?.followUpBreakdown?.stage1 ?? 0;
  const s2 = stats?.followUpBreakdown?.stage2 ?? 0;
  const replied = stats?.replied ?? 0;
  const volumes = stats?.dailyVolume ?? [];
  const maxVol = Math.max(...volumes.map(v => v.count), 1);

  const replyRate = totalLeads > 0 ? ((replied / totalLeads) * 100) : 0;
  const bounceRatePct = totalLeads > 0 ? (((stats?.bounced ?? 0) / totalLeads) * 100) : 0;
  const completionPct = totalLeads > 0 ? ((sentCount / totalLeads) * 100) : 0;

  // 7-day trailing window for comparison
  const recent7 = volumes.slice(-7);
  const previous7 = volumes.slice(-14, -7);
  const avgRecent = recent7.length ? recent7.reduce((a, v) => a + v.count, 0) / recent7.length : 0;
  const avgPrevious = previous7.length ? previous7.reduce((a, v) => a + v.count, 0) / previous7.length : 0;
  const volumeDeltaPct = avgPrevious > 0 ? Math.round(((avgRecent - avgPrevious) / avgPrevious) * 100) : (avgRecent > 0 ? 100 : 0);

  const statCards = [
    {
      label: 'Total Leads', value: fmt(stats?.total), icon: Users,
      accent: 'var(--honey-500)', glow: 'var(--honey-glow)',
      data: volumes.map(v => v.count), delta: null,
    },
    {
      label: 'Emails Sent', value: fmt(stats?.sent), icon: Send,
      accent: '#8B7355', glow: 'rgba(139,115,85,0.08)',
      data: volumes.map(v => v.count),
      delta: volumeDeltaPct !== 0 ? `${volumeDeltaPct > 0 ? '+' : ''}${volumeDeltaPct}% vs prev 7d` : null,
    },
    {
      label: 'Interested', value: fmt(stats?.replied), icon: CheckCircle,
      accent: 'var(--success)', glow: 'var(--success-bg)',
      data: volumes.map(v => Math.round(v.count * (totalLeads > 0 ? replied / totalLeads : 0))),
      delta: replyRate > 0 ? `${replyRate.toFixed(1)}% reply rate` : null,
    },
    {
      label: 'Bounced', value: fmt(stats?.bounced), icon: XCircle,
      accent: 'var(--danger)', glow: 'var(--danger-bg)',
      data: volumes.map(v => Math.round(v.count * (totalLeads > 0 ? (stats?.bounced ?? 0) / totalLeads : 0))),
      delta: `${bounceRatePct.toFixed(1)}% bounce rate`,
    },
    {
      label: 'Completion', value: `${completionPct.toFixed(0)}%`, icon: Target,
      accent: 'var(--warning)', glow: 'var(--warning-bg)',
      data: volumes.map((v, i) => Math.min(100, ((volumes.slice(0, i + 1).reduce((a, x) => a + x.count, 0) / totalLeads) * 100) || 0)),
      delta: sentCount > 0 ? `${fmt(totalLeads - sentCount)} pending` : null,
    },
  ];

  const chartData = volumes.map(v => ({
    name: new Date(v.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: v.count,
  }));

  const funnelRows = [
    { name: 'Pending', count: Math.max(totalLeads - sentCount, 0), color: 'var(--honey-500)', icon: Users },
    { name: 'Sent', count: sentCount, color: '#8B7355', icon: Send },
    { name: 'Follow-up 1', count: s1, color: '#A1886B', icon: TrendingUp },
    { name: 'Follow-up 2', count: s2, color: '#C69D6E', icon: TrendingUp },
    { name: 'Interested', count: replied, color: 'var(--success)', icon: CheckCircle },
  ];

  const statusMeta = {
    running: { label: 'Live', color: 'var(--success)', bg: 'var(--success-bg)', border: 'rgba(74, 109, 75, 0.15)' },
    paused: { label: 'Paused', color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'rgba(198, 120, 43, 0.15)' },
    stopped: { label: 'Stopped', color: 'var(--danger)', bg: 'var(--danger-bg)', border: 'rgba(181, 78, 69, 0.15)' },
  }[status];

  return (
    <div style={{ padding: '32px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="Campaign Overview"
        subtitle="Real-time metrics and controls for your outreach system."
        onRefresh={refreshData}
        refreshLoading={refreshing || actionLoading}
      />

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* ── Deliverability Alert Center Banner ─────────────────────── */}
      {stats?.alerts && (stats.alerts as Array<{ id: string; message: string; severity?: string }>).length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 20px',
          background: 'var(--danger-bg)', border: '1px solid rgba(181, 78, 69, 0.25)',
          borderRadius: '14px', fontSize: '13px', color: 'var(--danger)', fontFamily: 'var(--font-inter)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={18} className="animate-pulse" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontWeight: 700 }}>Deliverability Circuit Breaker Alert:</strong>{' '}
              {(stats.alerts as Array<{ id: string; message: string }>)[0].message}
            </div>
          </div>
          <Link href="/accounts" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
            View Mailboxes <ArrowRight size={12} style={{ marginLeft: '4px' }} />
          </Link>
        </div>
      )}

      {/* ── Campaign Control Banner ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="card"
        style={{ padding: '18px 24px', background: statusMeta.bg, border: `1px solid ${statusMeta.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
            background: 'var(--bg-surface)', border: `1px solid ${statusMeta.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(44, 34, 25, 0.02)',
          }}>
            <Zap size={16} style={{ color: statusMeta.color }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', fontFamily: 'var(--font-inter)' }}>
                Campaign is {status === 'running' ? 'running' : status}
              </span>
              <span className="badge" style={{ background: statusMeta.bg, color: statusMeta.color, borderColor: statusMeta.border }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%', background: statusMeta.color, display: 'inline-block',
                  animation: status === 'running' ? 'pulse-glow 2s ease-in-out infinite' : undefined,
                }} />
                {statusMeta.label}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-inter)' }}>
              {status === 'running' && 'Sending emails on schedule across all active accounts.'}
              {status === 'paused' && `Paused — ${campaignState?.pauseReason ?? 'No reason specified.'}`}
              {status === 'stopped' && 'Campaign stopped. Click resume to restart outreach.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {status !== 'running' && (
            <Button variant="primary" icon={Play} onClick={() => handleCampaignAction('resume')} loading={actionLoading}>
              Resume
            </Button>
          )}
          {status === 'running' && (
            <Button variant="secondary" icon={PauseIcon} onClick={() => handleCampaignAction('pause', 'Paused via dashboard')} loading={actionLoading}>
              Pause
            </Button>
          )}
          {status !== 'stopped' && (
            <Button variant="danger" icon={Square} onClick={() => handleCampaignAction('stop')} loading={actionLoading}>
              Stop
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Stat Cards ─────────────────────────────────────────────── */}
      <motion.div variants={stagger} initial="hidden" animate="show"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
        {statCards.map((c) => (
          <motion.div key={c.label} variants={fadeUp} transition={{ duration: 0.3 }} className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span className="section-label">{c.label}</span>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: c.glow, border: `1px solid ${c.accent}1c`,
              }}>
                <c.icon size={14} style={{ color: c.accent }} />
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1, fontFamily: 'var(--font-serif)' }}>
              {c.value}
            </div>
            <div style={{ height: '26px', marginTop: '8px' }}>
              <ResponsiveContainer width="100%" height={26}>
                <AreaChart data={c.data.map((v, i) => ({ i, v: Math.max(0, v as number) }))}>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={c.accent}
                    strokeWidth={1.5}
                    fill={c.accent}
                    fillOpacity={0.12}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {c.delta && (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.delta}
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* ── Charts Row ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px', fontFamily: 'var(--font-inter)' }}>

        {/* Volume Chart */}
        <div className="card" style={{ padding: '24px', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>Send Volume</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Daily emails — last 14 days</div>
            </div>
            <span className="badge badge-gray">CT timezone</span>
          </div>

          <div style={{ flex: 1, minHeight: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--honey-200)" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="var(--honey-500)" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  domain={[0, Math.max(maxVol, 1)]}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--text-primary)',
                    boxShadow: '0 8px 24px rgba(44, 34, 25, 0.08)',
                  }}
                  formatter={(value: unknown) => [`${value} sends`, 'Sent']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--honey-500)"
                  strokeWidth={2}
                  fill="url(#volGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel */}
        <div className="card" style={{ padding: '24px', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginBottom: '4px' }}>Pipeline</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>Outreach stage breakdown</div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '14px' }}>
            {funnelRows.map((row) => {
              const pct = totalLeads > 0 ? (row.count / totalLeads) * 100 : 0;
              return (
                <div key={row.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      <row.icon size={12} style={{ color: row.color }} />
                      {row.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {row.count.toLocaleString()} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="progress-track">
                    <motion.div
                      className="progress-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pct, 1)}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      style={{ background: `linear-gradient(90deg, ${row.color}bb, ${row.color})` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── A/B/C Template Performance Experiment Card ─────────────── */}
      <div className="card" style={{ padding: '24px', fontFamily: 'var(--font-inter)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>A/B/C Template Experiment</span>
              <span className="badge badge-amber">3-Stage Drip</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Tracking reply rates, positive sentiment, booked calls, and deals closed per template variant.
            </div>
          </div>
          <Link href="/templates" style={{ fontSize: '12px', color: 'var(--honey-600)', fontWeight: 700, textDecoration: 'none' }}>
            Manage Templates →
          </Link>
        </div>

        {stats?.variantBreakdown && ['A', 'B', 'C'].some(k => (stats.variantBreakdown?.[k]?.sent ?? 0) > 0) ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 12px' }}>Template Variant</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Sent</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Open Rate</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Reply Rate</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Positive Replies</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Calls Booked</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Clients Closed</th>
                </tr>
              </thead>
              <tbody>
                {['A', 'B', 'C'].map((vKey) => {
                  const v = stats.variantBreakdown?.[vKey] || {
                    name: vKey === 'A' ? 'Template A (Control - No Prices)' : vKey === 'B' ? 'Template B (Introductory Prices)' : 'Template C (Aggressive Value)',
                    sent: 0, opens: 0, replies: 0, positiveReplies: 0, callsBooked: 0, clientsClosed: 0,
                  };
                  const openPct = v.sent > 0 ? ((v.opens / v.sent) * 100).toFixed(1) : '0.0';
                  const replyPct = v.sent > 0 ? ((v.replies / v.sent) * 100).toFixed(1) : '0.0';

                  return (
                    <tr key={vKey} className="table-row">
                      <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        <span className="badge badge-gray" style={{ marginRight: '8px' }}>Variant {vKey}</span>
                        {v.name}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{v.sent}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--honey-600)', fontWeight: 700 }}>{openPct}%</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--success)', fontWeight: 700 }}>{replyPct}%</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>{v.positiveReplies}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>{v.callsBooked}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 800, color: 'var(--success)' }}>{v.clientsClosed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-inter)' }}>
            No template split-test data yet — runs populate automatically as emails are sent across variants.
          </div>
        )}
      </div>

      {/* ── Bottom Row: Quick Actions + Accounts + Activity ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 320px', gap: '16px', fontFamily: 'var(--font-inter)' }}>

        {/* Quick Actions */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginBottom: '4px' }}>Quick Actions</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Jump to where the work is</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link href="/leads" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <Users size={15} /> Manage {fmt(totalLeads)} Leads
            </Link>
            <Link href="/inbox" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <InboxIcon size={15} /> Review Inbox & Replies
            </Link>
            <Link href="/sequences" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <Flame size={15} /> Edit Follow-up Sequence
            </Link>
            <Link href="/templates" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <LayoutTemplate size={15} /> Edit Email Templates
            </Link>
            <Link href="/health" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <ShieldAlert size={15} /> Run Deliverability Preflight
            </Link>
          </div>
        </div>

        {/* Account Health */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>Mailbox Health</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Active SMTP accounts</div>
            </div>
            {accounts.some(a => a.healthScore === 'critical') && (
              <span className="badge badge-red"><ShieldAlert size={10} /> Auto-Pause Risk</span>
            )}
          </div>

          {accounts.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No accounts configured. <Link href="/accounts" style={{ color: 'var(--honey-500)', textDecoration: 'none', fontWeight: 600 }}>Add one →</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {accounts.slice(0, 6).map(acc => {
                const hColor = acc.healthScore === 'good' ? 'var(--success)' : acc.healthScore === 'warning' ? 'var(--warning)' : 'var(--danger)';
                return (
                  <div key={acc.id} style={{
                    padding: '14px 16px', borderRadius: '12px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    display: 'flex', flexDirection: 'column', gap: '10px',
                    transition: 'border-color 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                        {acc.email}
                      </span>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: hColor, flexShrink: 0 }} />
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div>
                        <div className="section-label" style={{ fontSize: '9px' }}>Today</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{acc.sentToday}</div>
                      </div>
                      <div>
                        <div className="section-label" style={{ fontSize: '9px' }}>Bounce</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: hColor, marginTop: '2px' }}>{(acc.bounceRate * 100).toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <Link href="/accounts" style={{ fontSize: '12px', color: 'var(--honey-600)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 700 }}>
              Manage all mailboxes <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', maxHeight: '320px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginBottom: '4px' }}>
            Activity Feed
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Live status changes</div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stats?.recentActivity?.length ? (
              stats.recentActivity.map((act, i) => {
                const badge = activityBadge(act.to);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px',
                    paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {act.email}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                        {new Date(act.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', flexShrink: 0,
                      background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                    }}>
                      {fmtStatus(act.to)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
                <Activity size={24} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: '12px' }}>No activity yet</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
