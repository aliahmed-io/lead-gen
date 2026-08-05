'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ShieldAlert,
  Mail,
  AlertTriangle,
  Send,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Activity,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { AccountHealth, Settings } from '@/types';

interface DnsCheckResult {
  overall: 'good' | 'warning' | 'fail';
  spf?: { pass: boolean; warning?: string };
  dmarc?: { pass: boolean; policy?: string; warning?: string };
  mx?: { pass: boolean; warning?: string };
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountHealth[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccount, setNewAccount] = useState({ email: '', password: '', smtpHost: '', imapHost: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dnsResults, setDnsResults] = useState<Record<string, DnsCheckResult>>({});
  const [dnsLoading, setDnsLoading] = useState<Record<string, boolean>>({});
  const [dnsExpanded, setDnsExpanded] = useState<Record<string, boolean>>({});

  const checkDns = async (email: string) => {
    setDnsLoading(prev => ({ ...prev, [email]: true }));
    try {
      const res = await fetch(`/api/accounts/dns?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      setDnsResults(prev => ({ ...prev, [email]: data }));
      setDnsExpanded(prev => ({ ...prev, [email]: true }));
    } catch (e) {
      console.error(e);
    } finally {
      setDnsLoading(prev => ({ ...prev, [email]: false }));
    }
  };

  const handleAddAccount = async () => {
    if (!newAccount.email || !newAccount.password || !newAccount.smtpHost || !newAccount.imapHost) {
      setError('Please fill in all fields.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount)
      });
      if (!res.ok) throw new Error('Failed to save account');
      await loadData();
      setShowAddModal(false);
      setNewAccount({ email: '', password: '', smtpHost: '', imapHost: '' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mailbox?')) return;
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete account');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [accountsRes, settingsRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/settings'),
      ]);

      if (!accountsRes.ok || !settingsRes.ok) {
        throw new Error('Failed to load accounts metadata');
      }

      const accountsData = await accountsRes.json();
      const settingsData = await settingsRes.json();

      setAccounts(accountsData);
      setSettings(settingsData);
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Error loading accounts dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-10 max-w-lg mx-auto text-center font-sans">
        <div className="relative w-16 h-16 mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="w-16 h-16 rounded-full border-4 border-[var(--border-default)] border-t-[var(--honey-500)]"
          />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-secondary)]">Evaluating Mailbox Health...</h2>
      </div>
    );
  }

  const dailyLimit = typeof settings?.maxEmailsPerDay === 'number' ? settings.maxEmailsPerDay : 30;
  const criticalAccountsCount = accounts.filter(a => a.healthScore === 'critical').length;
  const warningAccountsCount = accounts.filter(a => a.healthScore === 'warning' || a.bounceRate > 0.03).length;

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'Never active';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreBadge = (score: 'good' | 'warning' | 'critical', rate: number) => {
    if (score === 'critical') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--danger)] bg-[var(--danger-bg)] border border-red-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
          <ShieldAlert size={10} /> Critical
        </span>
      );
    }
    if (score === 'warning' || rate > 0.03) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--warning)] bg-[var(--warning-bg)] border border-amber-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
          <ShieldAlert size={10} /> Warning
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--success)] bg-[var(--success-bg)] border border-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
        <ShieldCheck size={10} /> Good Health
      </span>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight font-serif">Outreach Mailboxes</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Manage SMTP/IMAP rotation accounts, bounce thresholds, and warmups.</p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--honey-50)] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          title="Refresh Accounts"
          aria-label="Refresh Accounts"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="glass-panel border-[var(--danger)]/20 bg-[var(--danger-bg)] p-4 rounded-xl flex items-center gap-3 text-[var(--danger)] text-sm font-semibold">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Warning Banners */}
      {warningAccountsCount > 0 && (
        <div className="glass-panel border-[var(--warning)]/20 bg-[var(--warning-bg)] p-5 rounded-2xl flex items-start gap-4">
          <div className="p-2 bg-[var(--bg-surface)] rounded-xl border border-[var(--warning)]/20 text-[var(--warning)]">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Outreach Health Notice</h4>
            <p className="text-[var(--text-secondary)] text-xs mt-1 leading-relaxed">
              There are {warningAccountsCount} mailboxes with a bounce rate exceeding 3.0%. 
              To protect domain reputation and avoid ISP rate-limiting, we recommend auditing the lead validation settings.
            </p>
          </div>
        </div>
      )}

      {criticalAccountsCount > 0 && (
        <div className="glass-panel border-[var(--danger)]/20 bg-[var(--danger-bg)] p-5 rounded-2xl flex items-start gap-4">
          <div className="p-2 bg-[var(--bg-surface)] rounded-xl border border-[var(--danger)]/20 text-[var(--danger)] animate-pulse">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Automatic Account Auto-Pause Imminent</h4>
            <p className="text-[var(--text-secondary)] text-xs mt-1 leading-relaxed">
              {criticalAccountsCount} mailboxes have crossed the critical 5.0% bounce threshold and are auto-paused during sender worker execution. 
              Please verify/clean your leads list or update settings to prevent full campaign suspension.
            </p>
          </div>
        </div>
      )}

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map((account, index) => {
          const limitPct = (account.sentToday / dailyLimit) * 100;
          const bouncePct = (account.bounceRate * 100).toFixed(1);

          return (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between h-[280px]"
            >
              {/* Account Top Row */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-[var(--honey-100)] border border-[var(--border-subtle)] rounded-xl text-[var(--honey-600)] group-hover:scale-105 transition-transform">
                    <Mail size={18} />
                  </div>
                  {getScoreBadge(account.healthScore, account.bounceRate)}
                </div>

                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] truncate pr-6" title={account.email}>
                    {account.email}
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Mailbox ID: Account {account.id}</p>
                </div>
              </div>
              <button 
                onClick={() => handleDeleteAccount(String(account.id))} 
                className="absolute top-4 right-4 p-1.5 bg-[var(--danger-bg)] text-[var(--danger)] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--danger)] hover:text-white z-10 cursor-pointer border border-[var(--danger)]/15"
                title="Delete Mailbox"
                aria-label="Delete Mailbox"
              >
                <ShieldAlert size={14} />
              </button>

              {/* DNS Status Panel */}
              {dnsResults[account.email] && (
                <div className="mt-2 mb-2 p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-xs">
                  <div 
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => setDnsExpanded(p => ({ ...p, [account.email]: !p[account.email] }))}
                  >
                    <div className="flex items-center gap-2">
                      {dnsResults[account.email].overall === 'good' && <span className="flex items-center gap-1 text-[var(--success)] font-bold"><CheckCircle size={14}/> DNS Healthy</span>}
                      {dnsResults[account.email].overall === 'warning' && <span className="flex items-center gap-1 text-[var(--warning)] font-bold"><AlertTriangle size={14}/> Warnings</span>}
                      {dnsResults[account.email].overall === 'fail' && <span className="flex items-center gap-1 text-[var(--danger)] font-bold"><XCircle size={14}/> DNS Failing</span>}
                    </div>
                    {dnsExpanded[account.email] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  
                  {dnsExpanded[account.email] && (
                    <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-mono font-bold text-[var(--text-secondary)] w-12">SPF</span>
                        <div className="flex-1 flex gap-2">
                          {dnsResults[account.email].spf?.pass ? <CheckCircle size={14} className="text-[var(--success)] shrink-0"/> : <XCircle size={14} className="text-[var(--danger)] shrink-0"/>}
                          <span className="text-[var(--text-muted)] text-[10px] break-words">{dnsResults[account.email].spf?.warning || 'Pass'}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="font-mono font-bold text-[var(--text-secondary)] w-12">DMARC</span>
                        <div className="flex-1 flex gap-2">
                          {dnsResults[account.email].dmarc?.pass ? <CheckCircle size={14} className="text-[var(--success)] shrink-0"/> : <XCircle size={14} className="text-[var(--danger)] shrink-0"/>}
                          <span className="text-[var(--text-muted)] text-[10px] break-words">{dnsResults[account.email].dmarc?.warning || `Policy: ${dnsResults[account.email].dmarc?.policy}`}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="font-mono font-bold text-[var(--text-secondary)] w-12">MX</span>
                        <div className="flex-1 flex gap-2">
                          {dnsResults[account.email].mx?.pass ? <CheckCircle size={14} className="text-[var(--success)] shrink-0"/> : <XCircle size={14} className="text-[var(--danger)] shrink-0"/>}
                          <span className="text-[var(--text-muted)] text-[10px] break-words">{dnsResults[account.email].mx?.warning || 'Pass'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Progress and Limits */}
              <div className="space-y-2 my-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-[var(--text-secondary)]">Daily Limits Progress</span>
                  <span className="text-[var(--text-primary)] font-bold font-mono">{account.sentToday} / {dailyLimit} sends</span>
                </div>
                <div className="progress-track">
                  <div
                    style={{ width: `${Math.min(limitPct, 100)}%` }}
                    className="progress-fill"
                  />
                </div>
              </div>

              {/* Detailed Metrics Footer */}
              <div className="grid grid-cols-4 gap-1 border-t border-[var(--border-subtle)] pt-3 text-center text-xs">
                <div>
                  <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Opens</p>
                  <p className="text-xs font-bold text-[var(--text-primary)] mt-0.5 font-mono">
                    {((account.openRate || 0) * 100).toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Clicks</p>
                  <p className="text-xs font-bold text-[var(--text-primary)] mt-0.5 font-mono">
                    {((account.clickRate || 0) * 100).toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Replies</p>
                  <p className="text-xs font-bold text-[var(--success)] mt-0.5 font-mono">
                    {((account.replyRate || 0) * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Bounce</p>
                  <p
                    className={`text-xs font-bold mt-0.5 font-mono ${
                      account.bounceRate > 0.04
                        ? 'text-[var(--danger)]'
                        : account.bounceRate > 0.02
                        ? 'text-[var(--warning)]'
                        : 'text-[var(--success)]'
                    }`}
                  >
                    {bouncePct}%
                  </p>
                </div>
              </div>

              {/* Last Active Timestamp & Reset Clock */}
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-2 mt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-1.5">
                  <Clock size={11} />
                  <span>Resets at Midnight CT</span>
                </div>
                <button
                  onClick={() => checkDns(account.email)}
                  disabled={dnsLoading[account.email]}
                  className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Activity size={11} className={dnsLoading[account.email] ? "animate-spin" : ""} />
                  {dnsLoading[account.email] ? 'Checking...' : 'Check DNS'}
                </button>
              </div>
            </motion.div>
          );
        })}

        {/* Add Account Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: accounts.length * 0.05 }}
          onClick={() => setShowAddModal(true)}
          className="card rounded-2xl p-6 hover:bg-[var(--honey-50)] border-dashed border-[var(--border-strong)] flex flex-col items-center justify-center cursor-pointer min-h-[280px]"
        >
          <div className="w-12 h-12 bg-[var(--honey-100)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-default)]">
            <svg className="w-6 h-6 text-[var(--honey-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Add New Mailbox</h3>
          <p className="text-xs text-[var(--text-muted)] mt-2 text-center">Connect a new SMTP/IMAP account for outreach.</p>
        </motion.div>
      </div>

      {showAddModal && (
        <div className="overlay flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel-raised p-6 rounded-2xl max-w-md w-full space-y-4"
          >
            <h2 className="text-xl font-bold text-[var(--text-primary)] font-serif">Add New Mailbox</h2>
            <div className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Email Address</label>
                <input type="email" value={newAccount.email} onChange={e => setNewAccount({...newAccount, email: e.target.value})} className="input w-full p-2.5 outline-none" placeholder="name@domain.com" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">App Password</label>
                <input type="password" value={newAccount.password} onChange={e => setNewAccount({...newAccount, password: e.target.value})} className="input w-full p-2.5 outline-none" placeholder="••••••••••••••••" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">SMTP Host</label>
                <input type="text" value={newAccount.smtpHost} onChange={e => setNewAccount({...newAccount, smtpHost: e.target.value})} className="input w-full p-2.5 outline-none" placeholder="smtp.gmail.com" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">IMAP Host</label>
                <input type="text" value={newAccount.imapHost} onChange={e => setNewAccount({...newAccount, imapHost: e.target.value})} className="input w-full p-2.5 outline-none" placeholder="imap.gmail.com" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} disabled={isSubmitting} className="btn btn-secondary py-2">Cancel</button>
              <button onClick={handleAddAccount} disabled={isSubmitting} className="btn btn-primary py-2">{isSubmitting ? 'Saving...' : 'Save Account'}</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
