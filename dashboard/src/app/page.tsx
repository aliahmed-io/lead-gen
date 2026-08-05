'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Send, Users, CheckCircle, XCircle, TrendingUp,
  Play, Pause as PauseIcon, Square, AlertCircle,
  Activity, ShieldAlert, ArrowRight, RefreshCw,
  Zap,
} from 'lucide-react';
import { EnhancedStats, CampaignState, AccountHealth } from '@/types';

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };
const stagger = { show: { transition: { staggerChildren: 0.06 } } };

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
      setAccounts(await ar.json());
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

  const fmt = (n?: number) => (n ?? 0).toLocaleString();
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
  const sentCount  = stats?.sent ?? 0;
  const s1 = stats?.followUpBreakdown?.stage1 ?? 0;
  const s2 = stats?.followUpBreakdown?.stage2 ?? 0;
  const replied = stats?.replied ?? 0;
  const volumes = stats?.dailyVolume ?? [];
  const maxVol = Math.max(...volumes.map(v => v.count), 1);

  const statCards = [
    { label: 'Total Leads',   value: fmt(stats?.total),            delta: null,  icon: Users,         accent: 'var(--honey-500)', glow: 'var(--honey-glow)' },
    { label: 'Emails Sent',   value: fmt(stats?.sent),             delta: null,  icon: Send,           accent: '#8B7355',          glow: 'rgba(139,115,85,0.08)' },
    { label: 'Interested',    value: fmt(stats?.replied),           delta: null,  icon: CheckCircle,    accent: 'var(--success)',   glow: 'var(--success-bg)' },
    { label: 'Bounced',       value: fmt(stats?.bounced),           delta: null,  icon: XCircle,        accent: 'var(--danger)',    glow: 'var(--danger-bg)' },
    { label: 'Reply Rate',    value: `${stats?.conversion ?? 0}%`, delta: null,  icon: TrendingUp,     accent: 'var(--warning)',   glow: 'var(--warning-bg)' },
  ];

  const funnelRows = [
    { name: 'Pending',      count: Math.max(totalLeads - sentCount, 0), color: 'var(--honey-500)' },
    { name: 'Sent',         count: sentCount,                            color: '#8B7355' },
    { name: 'Follow-up 1',  count: s1,                                   color: '#A1886B' },
    { name: 'Follow-up 2',  count: s2,                                   color: '#C69D6E' },
    { name: 'Interested',   count: replied,                              color: 'var(--success)' },
  ];

  const statusMeta = {
    running: { label: 'Live',    color: 'var(--success)', bg: 'var(--success-bg)',  border: 'rgba(74, 109, 75, 0.15)' },
    paused:  { label: 'Paused',  color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'rgba(198, 120, 43, 0.15)' },
    stopped: { label: 'Stopped', color: 'var(--danger)', bg: 'var(--danger-bg)',  border: 'rgba(181, 78, 69, 0.15)' },
  }[status];

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

  return (
    <div style={{ padding: '32px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Campaign Overview
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-inter)' }}>
            Real-time metrics and controls for your outreach system.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="btn btn-secondary"
          style={{ padding: '8px', borderRadius: '10px' }}
          aria-label="Refresh"
        >
          <RefreshCw size={15} className={actionLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
          background: 'var(--danger-bg)', border: '1px solid rgba(181, 78, 69, 0.18)',
          borderRadius: '12px', fontSize: '13px', color: 'var(--danger)', fontFamily: 'var(--font-inter)'
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

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
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px',
          padding: '18px 24px', borderRadius: '16px',
          background: statusMeta.bg, border: `1px solid ${statusMeta.border}`,
        }}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, fontFamily: 'var(--font-inter)' }}>
          {status !== 'running' && (
            <button onClick={() => handleCampaignAction('resume')} disabled={actionLoading} className="btn btn-primary">
              <Play size={14} fill="white" /> Resume
            </button>
          )}
          {status === 'running' && (
            <button onClick={() => handleCampaignAction('pause', 'Paused via dashboard')} disabled={actionLoading}
              style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', borderRadius:'10px', fontSize:'13px', fontWeight:600, cursor:'pointer', border:'1px solid rgba(198, 120, 43, 0.2)', background:'var(--warning-bg)', color:'var(--warning)', transition:'all 0.15s' }}>
              <PauseIcon size={14} fill="var(--warning)" /> Pause
            </button>
          )}
          {status !== 'stopped' && (
            <button onClick={() => handleCampaignAction('stop')} disabled={actionLoading} className="btn btn-danger" style={{ padding: '8px 14px' }}>
              <Square size={12} fill="currentColor" /> Stop
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Stat Cards ─────────────────────────────────────────────── */}
      <motion.div variants={stagger} initial="hidden" animate="show"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
        {statCards.map((c) => (
          <motion.div key={c.label} variants={fadeUp} transition={{ duration: 0.3 }}
            className="stat-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span className="section-label" style={{ fontSize: '10px' }}>{c.label}</span>
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
          </motion.div>
        ))}
      </motion.div>

      {/* ── Charts Row ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px', fontFamily: 'var(--font-inter)' }}>

        {/* Volume Chart */}
        <div className="card" style={{ padding: '24px', height: '300px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', fontFamily: 'var(--font-serif)' }}>Send Volume</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Daily emails — last 14 days</div>
            </div>
            <span className="badge badge-gray">CT timezone</span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '5px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', position: 'relative' }}>
            {/* Y-axis grid */}
            {[0, 25, 50, 75, 100].map(pct => (
              <div key={pct} style={{
                position: 'absolute', left: 0, right: 0, top: `${100 - pct}%`,
                borderTop: '1px solid var(--border-subtle)', pointerEvents: 'none',
              }} />
            ))}
            {volumes.map((v, i) => {
              const pct = (v.count / maxVol) * 100;
              const d = new Date(v.date + 'T12:00:00');
              const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const isRecent = i >= volumes.length - 3;
              return (
                <div key={v.date} title={`${v.count} sends — ${label}`}
                  style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'pointer', position: 'relative', zIndex: 10 }}
                >
                  <div style={{
                    width: '100%',
                    height: `${Math.max(pct, 3)}%`,
                    borderRadius: '4px 4px 2px 2px',
                    background: isRecent
                      ? 'linear-gradient(180deg, var(--honey-200) 0%, var(--honey-500) 100%)'
                      : 'linear-gradient(180deg, rgba(110, 97, 83, 0.25) 0%, rgba(110, 97, 83, 0.1) 100%)',
                    transition: 'all 0.2s',
                  }} />
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            {[0, 6, 13].map(i => volumes[i] && (
              <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {new Date(volumes[i].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            ))}
          </div>
        </div>

        {/* Funnel */}
        <div className="card" style={{ padding: '24px', height: '300px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', fontFamily: 'var(--font-serif)', marginBottom: '4px' }}>Pipeline</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>Outreach stage breakdown</div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px' }}>
            {funnelRows.map((row) => {
              const pct = totalLeads > 0 ? (row.count / totalLeads) * 100 : 0;
              return (
                <div key={row.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{row.name}</span>
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

      {/* ── Bottom Row: Accounts + Activity ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', fontFamily: 'var(--font-inter)' }}>

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
