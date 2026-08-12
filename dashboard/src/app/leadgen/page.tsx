"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Zap, Play, Square, RefreshCw } from "lucide-react";
import { useToast } from '@/components/ui/toast';

interface ScraperStatus {
  running: boolean;
  totalLeads: number;
  lastRun?: string;
  currentQuery?: string;
  error?: string;
}

export default function LeadGen() {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const { showToast } = useToast();

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/scraper');
      if (res.ok) {
        setStatus(await res.json());
      } else {
        // Endpoint not wired yet
        setStatus({ running: false, totalLeads: 0 });
      }
    } catch (_e) {
      /* non-fatal */
      setStatus({ running: false, totalLeads: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const iv = setInterval(fetchStatus, 30000);
    void (async () => { await fetchStatus(); })();
    return () => clearInterval(iv);
  }, []);

  const toggleScraper = async () => {
    if (!status) return;
    setToggling(true);
    try {
      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: status.running ? 'stop' : 'start' }),
      });
      if (!res.ok) throw new Error('Scraper endpoint is not active — run the scheduler from the terminal instead.');
      const data = await res.json();
      setStatus(data);
      showToast(status.running ? 'Scraper stopped' : 'Scraper started', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div style={{
      padding: '40px 20px',
      maxWidth: '896px', // max-w-4xl
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      textAlign: 'center',
      fontFamily: 'var(--font-inter, sans-serif)',
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="card"
        style={{
          padding: '40px',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '576px', // max-w-xl
          width: '100%',
          boxShadow: '0 4px 20px rgba(44, 34, 25, 0.015)',
        }}
      >
        <div style={{
          width: '64px',
          height: '64px',
          background: 'var(--honey-100)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          border: '1px solid var(--border-subtle)',
        }}>
          <Activity className="w-8 h-8 text-[var(--honey-500)]" />
        </div>
        
        <h1 style={{
          fontSize: '28px',
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: '16px',
          fontFamily: 'var(--font-serif)',
          lineHeight: 1.2,
        }}>
          Lead Generation Engine
        </h1>
        
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '13px',
          maxWidth: '440px',
          marginBottom: '28px',
          lineHeight: 1.6,
        }}>
          Background Puppeteer scraper that discovers business leads from search queries, target cities, and business types. Control it here or run the scheduler from the terminal.
        </p>
        
        <div style={{
          background: 'var(--bg-neutral-muted)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          padding: '16px 20px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
          marginBottom: '20px',
        }}>
          <div>
            <h3 style={{
              color: 'var(--text-primary)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              margin: 0,
            }}>
              <Zap size={14} className="text-[var(--honey-600)]" />
              Scraper Engine
            </h3>
            <p style={{
              color: status?.running ? 'var(--success)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 700,
              marginTop: '4px',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono)',
            }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: status?.running ? 'var(--success)' : 'var(--text-disabled)',
                display: 'inline-block',
                boxShadow: status?.running ? '0 0 6px var(--success)' : 'none',
              }} />
              {loading ? 'Checking...' : status?.running ? 'Running' : 'Idle'}
              {!loading && typeof status?.totalLeads === 'number' && ` · ${status.totalLeads.toLocaleString()} leads`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={fetchStatus}
              disabled={loading}
              style={{ padding: '8px', display: 'flex', alignItems: 'center' }}
              aria-label="Refresh status"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              className={status?.running ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={toggleScraper}
              disabled={toggling || loading}
              style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {status?.running ? <Square size={13} /> : <Play size={13} />}
              {status?.running ? 'Stop Scraper' : 'Start Scraper'}
            </button>
          </div>
        </div>

        <a
          href="/leads"
          className="btn btn-secondary"
          style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
        >
          <Activity size={14} /> View discovered leads in the Leads database
        </a>
      </motion.div>
    </div>
  );
}
