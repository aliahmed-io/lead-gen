'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page';

interface HealthCheck {
  name: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export default function HealthCenter() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [overall, setOverall] = useState<'good' | 'warning' | 'critical'>('good');
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setChecks(data.checks || []);
        setOverall(data.overall || 'good');
      }
    } catch (e) {
      console.error('Failed to fetch health status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/health');
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setChecks(data.checks || []);
          setOverall(data.overall || 'good');
        }
      } catch (e) {
        console.error('Failed to fetch health status', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
     
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      <PageHeader
        title="System Health Center"
        subtitle="Preflight diagnostic checklist before launching outreach campaigns."
        onRefresh={fetchHealth}
        refreshLoading={loading}
      />

      {/* Status Banner */}
      <div className={`p-6 rounded-2xl border flex items-center gap-4 ${
        overall === 'good'
          ? 'bg-[var(--success-bg)] border-emerald-500/20 text-[var(--success)]'
          : overall === 'warning'
          ? 'bg-[var(--warning-bg)] border-amber-500/20 text-[var(--warning)]'
          : 'bg-[var(--danger-bg)] border-red-500/20 text-[var(--danger)]'
      }`}>
        <ShieldCheck size={32} className="shrink-0" />
        <div>
          <h3 className="text-lg font-bold">
            {overall === 'good' ? 'All Systems Operational — Ready to Launch' : overall === 'warning' ? 'Health Warnings Detected' : 'Critical Issues Blocked Launch'}
          </h3>
          <p className="text-xs opacity-90 mt-0.5">
            {overall === 'good'
              ? 'DNS, SMTP, IMAP, Circuit Breaker, and Suppression rules passed preflight checks.'
              : 'Review warning details below to ensure high deliverability.'}
          </p>
        </div>
      </div>

      {/* Checks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checks.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="card p-5 rounded-2xl flex items-start justify-between border border-[var(--border-subtle)]"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-neutral-muted)] px-2 py-0.5 rounded-md">
                  {c.category}
                </span>
                <h4 className="text-sm font-bold text-[var(--text-primary)]">{c.name}</h4>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{c.detail}</p>
            </div>
            {c.status === 'pass' && <CheckCircle size={20} className="text-[var(--success)] shrink-0 mt-1" />}
            {c.status === 'warn' && <AlertTriangle size={20} className="text-[var(--warning)] shrink-0 mt-1" />}
            {c.status === 'fail' && <XCircle size={20} className="text-[var(--danger)] shrink-0 mt-1" />}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
