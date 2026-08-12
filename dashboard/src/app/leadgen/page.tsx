"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Play,
  Square,
  RefreshCw,
  Plus,
  X,
  Search,
  Award,
  Mail,
  MapPin,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Timer,
} from "lucide-react";
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { PageHeader, PageSkeleton } from '@/components/ui/page';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ScraperStatus {
  running: boolean;
  stopRequested: boolean;
  startedAt: number | null;
  queries: string[];
  lastRun: { at: number | null; durationSec: number | null; newLeads: number | null };
  totalLeads: number;
  avgQualityScore: number | null;
  qualityDistribution: Record<string, number>;
  remoteControl: boolean;
}

const QUALITY_PRESETS: { label: string; query: string }[] = [
  { label: 'Marketing agencies', query: 'marketing agency' },
  { label: 'Web design studios', query: 'web design studio' },
  { label: 'SEO consultants', query: 'SEO consultant' },
  { label: 'Accounting firms', query: 'accounting firm' },
  { label: 'Real estate brokers', query: 'real estate broker' },
  { label: 'Dental clinics', query: 'dental clinic' },
  { label: 'Law firms', query: 'law firm' },
  { label: 'Fitness studios', query: 'fitness studio' },
  { label: 'Restaurants', query: 'restaurant' },
  { label: 'Coffee shops', query: 'coffee shop' },
  { label: 'Home renovation', query: 'home renovation contractor' },
  { label: 'Landscaping', query: 'landscaping company' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function LeadGen() {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [queries, setQueries] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { showToast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper');
      if (res.ok) {
        setStatus(await res.json());
      } else {
        setStatus({ running: false, stopRequested: false, startedAt: null, queries: [], lastRun: { at: null, durationSec: null, newLeads: null }, totalLeads: 0, avgQualityScore: null, qualityDistribution: {}, remoteControl: false });
      }
    } catch {
      setStatus({ running: false, stopRequested: false, startedAt: null, queries: [], lastRun: { at: null, durationSec: null, newLeads: null }, totalLeads: 0, avgQualityScore: null, qualityDistribution: {}, remoteControl: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(fetchStatus, 5000);
    const iv2 = setInterval(() => setNow(Date.now()), 1000);
    void (async () => { await fetchStatus(); })();
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, [fetchStatus]);

  const startScraper = async () => {
    const cleaned = queries.map(q => q.trim()).filter(q => q.length > 0);
    if (cleaned.length === 0) {
      showToast('Add at least one search query to start scraping.', 'error');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', queries: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not start the scraper.');
      setStatus({ ...data, totalLeads: status?.totalLeads ?? 0 });
      showToast(`Started scraping with ${cleaned.length} quer${cleaned.length === 1 ? 'y' : 'ies'}. Progress updates live on this page.`, 'success');
    } catch (e) {
      setError((e as Error).message);
      showToast((e as Error).message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const stopScraper = async () => {
    setStopping(true);
    try {
      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not stop the scraper.');
      setStatus(data);
      showToast(data.message || 'Stop requested.', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setStopping(false);
    }
  };

  const addQuery = () => setQueries(prev => [...prev, '']);
  const removeQuery = (i: number) =>
    setQueries(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));
  const updateQuery = (i: number, value: string) =>
    setQueries(prev => prev.map((q, idx) => (idx === i ? value : q)));

  const elapsed =
    status?.running && status.startedAt
      ? Math.max(0, Math.floor((now - status.startedAt) / 1000))
      : null;

  if (loading || !status) {
    return <PageSkeleton message="Loading lead engine status…" />;
  }

  const hasQueries = queries.some(q => q.trim().length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      <PageHeader
        title="Lead Generation"
        subtitle="Discover businesses from Google Maps, enrich them with verified emails, and score their quality — all before any outreach is sent."
        onRefresh={fetchStatus}
        refreshLoading={starting || stopping}
      />

      {error && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 16px', background: 'var(--danger-bg)',
          border: '1px solid rgba(181, 78, 69, 0.18)',
          borderRadius: '12px', fontSize: '13px', color: 'var(--danger)',
        }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* ── Engine status ── */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div style={{
            width: '46px', height: '46px', borderRadius: '50%',
            background: status.running ? 'var(--success-bg)' : 'var(--bg-neutral-muted)',
            border: `1px solid ${status.running ? 'var(--success)' : 'var(--border-default)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Activity size={20} className={status.running ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              Scraper engine
              <span style={{
                fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                padding: '2px 8px', borderRadius: '99px',
                background: status.running ? (status.stopRequested ? 'var(--warning-bg)' : 'var(--success-bg)') : 'var(--bg-neutral-muted)',
                color: status.running ? (status.stopRequested ? 'var(--warning)' : 'var(--success)') : 'var(--text-muted)',
                border: `1px solid ${status.running ? (status.stopRequested ? 'var(--warning)' : 'var(--success)') : 'var(--border-default)'}`,
              }}>
                {status.running ? (status.stopRequested ? 'STOPPING' : 'RUNNING') : 'IDLE'}
              </span>
              {elapsed !== null && (
                <span className="flex items-center gap-1 text-[var(--text-muted)]" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  <Timer size={11} /> {Math.floor(elapsed / 60)}m {String(elapsed % 60).padStart(2, '0')}s
                </span>
              )}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0' }}>
              {status.running
                ? status.stopRequested
                  ? 'Finishing the current query, then exiting…'
                  : `Searching: ${status.queries.slice(0, 3).join(' · ')}${status.queries.length > 3 ? ` +${status.queries.length - 3} more` : ''}`
                : 'Ready to start a new discovery session.'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <Button variant="secondary" onClick={fetchStatus} loading={starting || stopping} aria-label="Refresh status" style={{ padding: '8px' }}>
            <RefreshCw size={14} />
          </Button>
          {status.running ? (
            <Button variant="danger" onClick={stopScraper} loading={stopping}>
              <Square size={14} /> Stop
            </Button>
          ) : (
            <Button variant="primary" onClick={startScraper} loading={starting} disabled={!hasQueries || starting}>
              <Play size={14} /> Start session
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* ── Query builder ── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Search queries</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0' }}>
              What to search on Google Maps (e.g. {'“'}plumbing company{'”'} + {'“'}Austin TX{'”'}). Already-seen queries are skipped automatically.
            </p>
          </div>
          {queries.map((q, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="text"
                value={q}
                onChange={e => updateQuery(i, e.target.value)}
                placeholder={`Query ${i + 1} — e.g. "marketing agency Houston"`}
                className="input"
                style={{ flex: 1, fontSize: '13px' }}
                disabled={status.running}
              />
              <button
                onClick={() => removeQuery(i)}
                disabled={status.running || queries.length === 1}
                aria-label={`Remove query ${i + 1}`}
                className="btn btn-secondary"
                style={{ padding: '8px' }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <Button variant="secondary" onClick={addQuery} disabled={status.running || queries.length >= 8}>
            <Plus size={14} /> Add query
          </Button>

          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Quick presets
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {QUALITY_PRESETS.filter(p => !queries.includes(p.query)).slice(0, 8).map(p => (
                <button
                  key={p.query}
                  onClick={() => {
                    setQueries(prev => [...prev.filter(q => q.trim().length > 0), p.query]);
                    showToast(`Added preset: ${p.label}`, 'success');
                  }}
                  disabled={status.running}
                  style={{
                    fontSize: '12px', padding: '5px 10px', borderRadius: '99px',
                    background: 'var(--bg-neutral-muted)', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            padding: '10px 12px', borderRadius: '12px',
            background: 'var(--info-bg)', border: '1px solid rgba(59, 100, 160, 0.15)',
            fontSize: '12px', color: 'var(--info)', lineHeight: 1.5,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              Each query can return up to your configured maximum results and is deduplicated against the database.
              A session resumes from the last unfinished query if interrupted.
            </span>
          </div>
        </div>

        {/* ── Session stats ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                <Search size={13} /> Discovered leads
              </div>
              <p style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 0', fontFamily: 'var(--font-serif)' }}>
                {status.totalLeads.toLocaleString()}
              </p>
            </div>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                <Award size={13} /> Avg quality score
              </div>
              <p style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 0', fontFamily: 'var(--font-serif)' }}>
                {status.avgQualityScore ?? '—'}
              </p>
            </div>
          </div>

          {/* Quality distribution */}
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={14} /> Lead quality mix
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', fontFamily: 'var(--font-inter)' }}>
                Computed at discovery time — before any email is sent
              </span>
            </h3>
            {status.qualityDistribution && Object.keys(status.qualityDistribution).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(status.qualityDistribution)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([grade, count]) => {
                    const total = Object.values(status.qualityDistribution).reduce((s, n) => s + n, 0);
                    const pct = total > 0 ? Math.round(((count as number) / total) * 100) : 0;
                    const tone = grade === 'A' || grade === 'B' ? 'var(--success)' : grade === 'C' ? 'var(--warning)' : 'var(--danger)';
                    return (
                      <div key={grade}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Grade {grade}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{count} leads · {pct}%</span>
                        </div>
                        <div style={{ height: '8px', borderRadius: '99px', background: 'var(--bg-neutral-muted)' }}>
                          <div style={{ height: '8px', borderRadius: '99px', background: tone, width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
                Quality grades appear once leads have been enriched and scored.
              </p>
            )}
          </div>

          <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>How it works</h3>
            {[
              { icon: Search, text: 'Discovers businesses from Google Maps using your queries.' },
              { icon: Mail, text: 'Enriches each business by scraping its website for emails.' },
              { icon: ShieldCheck, text: 'Verifies emails with MX lookup and SMTP handshake.' },
              { icon: Award, text: 'Scores each lead 0–100 (website quality, rating, email quality, social presence) before you ever send.' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <Icon size={14} className="text-[var(--honey-500)]" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{text}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={14} /> Last completed run
            </h3>
            {status.lastRun?.at ? (
              <>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
                  {new Date(status.lastRun.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  {status.lastRun.newLeads !== null && ` · ${status.lastRun.newLeads.toLocaleString()} new leads`}
                  {status.lastRun.durationSec !== null && ` · ${Math.round(status.lastRun.durationSec / 60)} min`}
                </p>
              </>
            ) : (
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>No completed runs yet — start a session above.</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <a href="/leads" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={14} /> Browse leads
            </a>
            <a href="/health" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={14} /> Account health
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
