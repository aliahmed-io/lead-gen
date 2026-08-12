'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ShieldAlert,
  Mail,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  Eye,
  EyeOff,
  Copy,
  Pause,
  Play
} from 'lucide-react';
import { AccountHealth, Settings } from '@/types';
import { Modal } from '@/components/ui/modal';
import { PageHeader, ErrorBanner } from '@/components/ui/page';

interface DnsCheckResult {
  overall: 'good' | 'warning' | 'fail';
  spf?: { pass: boolean; warning?: string };
  dmarc?: { pass: boolean; policy?: string; warning?: string };
  mx?: { pass: boolean; warning?: string };
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountHealth[]>([]);
  const [pausedAll, setPausedAll] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccount, setNewAccount] = useState({ email: '', password: '', smtpHost: '', imapHost: '' });
  const [editingAccount, setEditingAccount] = useState<AccountHealth | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'credentials' | 'admin'>('details');
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    senderName: '',
    signature: '',
    forwardingDestination: '',
    adminEmail: '',
    adminPassword: '',
    adminSecret: '',
    password: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  interface SpamReportRule {
    name: string;
    rule?: string;
    passed: boolean;
    score?: number;
    description?: string;
  }
  interface SpamReport {
    score: number;
    verdict?: string;
    summary?: string;
    rules: SpamReportRule[];
    recommendations?: string[];
    spamAssassinRating?: string;
    ratingLabel?: string;
    [key: string]: unknown;
  }
  const [spamReportModal, setSpamReportModal] = useState<{
    email: string;
    report: SpamReport | null;
  } | null>(null);
  const [spamLoading, setSpamLoading] = useState<Record<string, boolean>>({});

  const runSpamCheck = async (email: string) => {
    setSpamLoading(prev => ({ ...prev, [email]: true }));
    try {
      const res = await fetch('/api/spam-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setSpamReportModal({ email, report: data.report });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSpamLoading(prev => ({ ...prev, [email]: false }));
    }
  };

  const openEditModal = (acc: AccountHealth) => {
    setEditingAccount(acc);
    setActiveTab('details');
    // Credential fields are intentionally not pre-filled: the server never
    // returns passwords, 2FA secrets, or admin credentials, so the edit form
    // only applies changes the user types in explicitly.
    setEditForm({
      firstName: acc.firstName || 'Ali',
      lastName: acc.lastName || 'Ahmed',
      senderName: acc.senderName || 'Ali Ahmed',
      signature: acc.signature || 'Ali Ahmed\nFounder & Interactive Developer | Aethelon Labs\naethelonlabs.com',
      forwardingDestination: acc.forwardingDestination || acc.email,
      adminEmail: acc.adminEmail || acc.email,
      adminPassword: '',
      adminSecret: '',
      password: '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAccount) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAccount.id,
          ...editForm,
        }),
      });
      if (!res.ok) throw new Error('Failed to update account details');
      await loadData();
      setEditingAccount(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dnsResults, setDnsResults] = useState<Record<string, DnsCheckResult>>({});
  const [dnsLoading, setDnsLoading] = useState<Record<string, boolean>>({});
  const [dnsExpanded, setDnsExpanded] = useState<Record<string, boolean>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [totpData, setTotpData] = useState<Record<string, { code: string; secondsRemaining: number }>>({});
  const [totpStaleAt, setTotpStaleAt] = useState<number>(0);
  const [copiedTotpEmail, setCopiedTotpEmail] = useState<string | null>(null);

  const togglePasswordVisibility = (email: string) => {
    setShowPasswords(prev => ({ ...prev, [email]: !prev[email] }));
  };

  const copyPassword = (email: string, password?: string) => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const copyTOTP = (email: string, code?: string) => {
    if (!code || code === '------') return;
    navigator.clipboard.writeText(code);
    setCopiedTotpEmail(email);
    setTimeout(() => setCopiedTotpEmail(null), 2000);
  };

  // Refresh live 2FA codes from the server so the TOTP secret never
  // leaves the backend. Codes are requested once per 30-second window
  // and stay valid until the next window starts.
  useEffect(() => {
    const updateCodes = async () => {
      const now = Math.floor(Date.now() / 1000);
      const windowStart = Math.floor(now / 30) * 30;
      if (totpStaleAt === windowStart) return;
      setTotpStaleAt(windowStart);

      const newTotp: Record<string, { code: string; secondsRemaining: number }> = {};
      await Promise.all(
        accounts.map(async (acc) => {
          try {
            const res = await fetch(`/api/accounts/totp?email=${encodeURIComponent(acc.email)}`);
            if (res.ok) {
              const data = await res.json();
              newTotp[acc.email] = { code: data.code, secondsRemaining: data.secondsRemaining };
            }
          } catch (e) {
            console.error(e);
          }
        })
      );
      setTotpData(newTotp);
    };

    updateCodes();
    const interval = setInterval(updateCodes, 1000);
    return () => clearInterval(interval);
  }, [accounts, totpStaleAt]);

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

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const confirmDeleteAccount = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`/api/accounts?id=${deleteTargetId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete account');
      setDeleteTargetId(null);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Bulk pause/resume all accounts — persisted in campaign_db.json accountState
  // so the sender worker respects the toggle during execution.
  const [pausingAll, setPausingAll] = useState(false);
  const bulkTogglePause = async (resume: boolean) => {
    setPausingAll(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setPauseAll', paused: !resume }),
      });
      if (!res.ok) throw new Error(`Failed to ${resume ? 'resume' : 'pause'} all accounts`);
      setError(null);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPausingAll(false);
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

      // GET shape: { accounts: AccountHealth[], paused: boolean }
      setAccounts(accountsData.accounts || accountsData);
      setPausedAll(Boolean(accountsData.paused));
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
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4 md:space-y-5 font-sans">
      {/* Header */}
      <PageHeader
        title="Outreach Mailboxes"
        subtitle="Manage SMTP/IMAP rotation accounts, bounce thresholds, and warmups."
        onRefresh={loadData}
        refreshLoading={refreshing}
      >
        {/* Bulk Pause/Resume all accounts */}
        <button
          onClick={() => bulkTogglePause(false)}
          disabled={pausingAll || pausedAll}
          className="btn btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: pausedAll ? 0.5 : 1, padding: '6px 10px', fontSize: '12px' }}
        >
          <Pause size={13} /> Pause All
        </button>
        <button
          onClick={() => bulkTogglePause(true)}
          disabled={pausingAll || !pausedAll}
          className="btn btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: pausedAll ? 1 : 0.5, padding: '6px 10px', fontSize: '12px' }}
        >
          <Play size={13} /> Resume All
        </button>
      </PageHeader>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Warning Banners */}
      {warningAccountsCount > 0 && (
        <div className="glass-panel border-[var(--warning)]/20 bg-[var(--warning-bg)] p-3.5 md:p-4 rounded-xl flex items-start gap-3">
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
        <div className="glass-panel border-[var(--danger)]/20 bg-[var(--danger-bg)] p-3.5 md:p-4 rounded-xl flex items-start gap-3">
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

      {/* Accounts Grid — 6 equal slots */}
      <div className="accounts-6grid">
        {accounts.map((account, index) => {
          const limitPct = (account.sentToday / dailyLimit) * 100;
          const bouncePct = (account.bounceRate * 100).toFixed(1);

          return (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card rounded-2xl p-5 relative overflow-hidden group flex flex-col justify-between"
            >
              {/* Account Top Row */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(account)}
                    className="flex items-center gap-2 min-w-0 text-left cursor-pointer group/btn"
                    title="Details & Credentials"
                  >
                    <div className="p-1.5 bg-[var(--honey-100)] border border-[var(--border-subtle)] rounded-lg text-[var(--honey-600)] group-hover/btn:scale-105 transition-transform shrink-0">
                      <Mail size={14} />
                    </div>
                    <h3 className="text-[13px] font-bold text-[var(--text-primary)] truncate group-hover/btn:underline underline-offset-4 decoration-[var(--honey-500)]" title={account.email}>
                      {account.email}
                    </h3>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {getScoreBadge(account.healthScore, account.bounceRate)}
                    <button
                      type="button"
                      onClick={() => openEditModal(account)}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--honey-600)] transition-colors cursor-pointer"
                      title="Details & Credentials"
                      aria-label="Details & Credentials"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                </div>

                {/* App Password Display Box */}
                {account.appPassword && (
                  <div className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">App Pass:</span>
                      <span className="text-xs font-mono font-semibold text-[var(--text-primary)] truncate">
                        {showPasswords[account.email] ? account.appPassword : '••••••••••••••••'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => togglePasswordVisibility(account.email)}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title={showPasswords[account.email] ? "Hide Password" : "Show Password"}
                      >
                        {showPasswords[account.email] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        onClick={() => copyPassword(account.email, account.appPassword)}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--honey-600)] transition-colors"
                        title="Copy App Password"
                      >
                        {copiedEmail === account.email ? <CheckCircle size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Live 2FA Authentication Code Box */}
                {account.totpCode && account.totpCode !== '------' && (
                  <div className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-[var(--border-subtle)]"
                            strokeWidth="3"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className="text-[var(--honey-500)] transition-all duration-300"
                            strokeDasharray={`${((totpData[account.email]?.secondsRemaining || 30) / 30) * 100}, 100`}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <span className="absolute text-[8px] font-bold text-[var(--text-muted)] font-mono">
                          {totpData[account.email]?.secondsRemaining || 30}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">2FA Code:</span>
                        <span className="text-xs font-mono font-bold text-[var(--honey-600)] tracking-wider">
                          {totpData[account.email]?.code || '------'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => copyTOTP(account.email, totpData[account.email]?.code)}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--honey-600)] transition-colors cursor-pointer"
                      title="Copy 2FA Code"
                    >
                      {copiedTotpEmail === account.email ? <CheckCircle size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
                    </button>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setDeleteTargetId(String(account.id))} 
                className="absolute top-2 right-2 p-1 bg-[var(--danger-bg)] text-[var(--danger)] rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--danger)] hover:text-white z-10 cursor-pointer border border-[var(--danger)]/15"
                title="Delete Mailbox"
                aria-label="Delete Mailbox"
              >
                <ShieldAlert size={12} />
              </button>

              {/* DNS Status Panel */}
              {dnsResults[account.email] && (
                <div className="mb-2 p-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs">
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

              {/* Detailed Metrics Row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                <span style={{ fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>Opens </span><span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{((account.openRate || 0) * 100).toFixed(0)}%</span></span>
                <span style={{ fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>Clicks </span><span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{((account.clickRate || 0) * 100).toFixed(0)}%</span></span>
                <span style={{ fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>Replies </span><span className="font-mono font-bold" style={{ color: 'var(--success)' }}>{((account.replyRate || 0) * 100).toFixed(1)}%</span></span>
                <span style={{ fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>Bounce </span><span className="font-mono font-bold" style={{ color: account.bounceRate > 0.04 ? 'var(--danger)' : account.bounceRate > 0.02 ? 'var(--warning)' : 'var(--success)' }}>{bouncePct}%</span></span>
              </div>

              {/* Progress and Limits */}
              <div className="space-y-1.5 mt-2">
                <div className="flex justify-between items-center text-[11px] whitespace-nowrap">
                  <span className="text-[var(--text-secondary)]">Daily Progress</span>
                  <span className="text-[var(--text-primary)] font-bold font-mono">{account.sentToday} / {dailyLimit}</span>
                </div>
                <div className="progress-track" style={{ height: '5px' }}>
                  <div
                    style={{ width: `${Math.min(limitPct, 100)}%` }}
                    className="progress-fill"
                  />
                </div>
              </div>

              {/* Last Active Timestamp & Reset Clock */}
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-2 mt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Clock size={11} className="shrink-0" />
                  <span className="whitespace-nowrap truncate hidden sm:inline">Resets at Midnight CT</span>
                  <span className="whitespace-nowrap sm:hidden">Daily reset: 00:00 CT</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => checkDns(account.email)}
                    disabled={dnsLoading[account.email]}
                    className="flex items-center gap-1 whitespace-nowrap hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <Activity size={11} className={dnsLoading[account.email] ? "animate-spin" : ""} />
                    {dnsLoading[account.email] ? 'Checking...' : 'Check DNS'}
                  </button>
                  <button
                    onClick={() => runSpamCheck(account.email)}
                    disabled={spamLoading[account.email]}
                    className="flex items-center gap-1 whitespace-nowrap text-[var(--honey-600)] hover:underline font-bold transition-colors cursor-pointer"
                  >
                    <ShieldCheck size={11} className={spamLoading[account.email] ? "animate-spin" : ""} />
                    {spamLoading[account.email] ? 'Auditing...' : 'Spam Check'}
                  </button>
                </div>
              </div>
            </motion.div>
        );
      })}

        {/* Add Account Card — 7th grid slot */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: accounts.length * 0.05 }}
          onClick={() => setShowAddModal(true)}
          className="card rounded-2xl p-5 hover:bg-[var(--honey-50)] border-dashed border-[var(--border-strong)] flex flex-col items-center justify-center gap-1.5 cursor-pointer text-left"
          aria-label="Add New Mailbox"
        >
          <div className="w-10 h-10 bg-[var(--honey-100)] border border-[var(--border-subtle)] rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--honey-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Add New Mailbox</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-center">Connect a new SMTP/IMAP account.</p>
        </motion.button>
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

      {/* Delete Account Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        title="Delete Outreach Mailbox"
        confirmLabel="Delete Mailbox"
        confirmVariant="danger"
        onConfirm={confirmDeleteAccount}
      >
        Are you sure you want to delete this mailbox account? Active cold email sequences assigned to this account will be paused.
      </Modal>

      {/* Account Details & Credentials Modal */}
      {editingAccount && (
        <div className="overlay flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel-raised p-6 rounded-2xl max-w-xl w-full space-y-5"
          >
            {/* Header with Mail Icon & Active Badge */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[var(--honey-100)] rounded-xl border border-[var(--border-subtle)] text-[var(--honey-600)]">
                  <Mail size={18} />
                </div>
                <h2 className="text-lg font-extrabold text-[var(--text-primary)] font-sans">{editingAccount.email}</h2>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Active
              </span>
            </div>

            {/* Tabs Navigation */}
            <div className="flex gap-2 bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'details'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-extrabold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('credentials')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'credentials'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-extrabold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Credentials
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-extrabold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Admin credentials
              </button>
            </div>

            {/* TAB 1: DETAILS */}
            {activeTab === 'details' && (
              <div className="space-y-4 font-sans max-h-[60vh] overflow-y-auto pr-1">
                {/* Profile Picture */}
                <div className="flex items-center gap-4 p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-2xl">
                  <div className="w-14 h-14 rounded-full bg-amber-600/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-600 font-extrabold text-lg shrink-0 overflow-hidden">
                    <span>{editForm.firstName.slice(0, 1).toUpperCase()}{editForm.lastName.slice(0, 1).toUpperCase()}</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">Profile Picture</h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Square image recommended (250×250 – 500×500), JPG/PNG/GIF/WEBP, max 25MB
                    </p>
                    <button type="button" className="text-xs font-bold text-red-500 hover:underline mt-1">Remove</button>
                  </div>
                </div>

                {/* First & Last Name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-first-name" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">First Name</label>
                    <input
                      id="edit-first-name"
                      name="firstName"
                      aria-label="First Name"
                      type="text"
                      value={editForm.firstName}
                      onChange={e => setEditForm({ ...editForm, firstName: e.target.value })}
                      className="input w-full p-2.5 outline-none text-xs"
                      placeholder="Ali"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-last-name" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Last Name</label>
                    <input
                      id="edit-last-name"
                      name="lastName"
                      aria-label="Last Name"
                      type="text"
                      value={editForm.lastName}
                      onChange={e => setEditForm({ ...editForm, lastName: e.target.value })}
                      className="input w-full p-2.5 outline-none text-xs"
                      placeholder="Ahmed"
                    />
                  </div>
                </div>

                {/* Sender Name */}
                <div>
                  <label htmlFor="edit-sender-name" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Sender Name</label>
                  <input
                    id="edit-sender-name"
                    name="senderName"
                    aria-label="Sender Name"
                    type="text"
                    value={editForm.senderName}
                    onChange={e => setEditForm({ ...editForm, senderName: e.target.value })}
                    className="input w-full p-2.5 outline-none text-xs"
                    placeholder="Ali Ahmed"
                  />
                </div>

                {/* Signature */}
                <div>
                  <label htmlFor="edit-signature" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Signature</label>
                  <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
                    <textarea
                      id="edit-signature"
                      name="signature"
                      aria-label="Signature"
                      rows={4}
                      value={editForm.signature}
                      onChange={e => setEditForm({ ...editForm, signature: e.target.value })}
                      className="w-full p-3 text-xs outline-none bg-transparent font-sans resize-none"
                      placeholder="Your professional email signature..."
                    />
                    <div className="flex items-center gap-2 p-2 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] font-mono">
                      <button type="button" title="Bold" aria-label="Bold" onClick={() => setEditForm(prev => ({ ...prev, signature: prev.signature + ' **bold**' }))} className="px-2 py-0.5 rounded font-bold hover:bg-[var(--honey-100)] hover:text-[var(--text-primary)] cursor-pointer">B</button>
                      <button type="button" title="Italic" aria-label="Italic" onClick={() => setEditForm(prev => ({ ...prev, signature: prev.signature + ' *italic*' }))} className="px-2 py-0.5 rounded italic hover:bg-[var(--honey-100)] hover:text-[var(--text-primary)] cursor-pointer">I</button>
                      <button type="button" title="Underline" aria-label="Underline" onClick={() => setEditForm(prev => ({ ...prev, signature: prev.signature + ' <u>underline</u>' }))} className="px-2 py-0.5 rounded underline hover:bg-[var(--honey-100)] hover:text-[var(--text-primary)] cursor-pointer">U</button>
                      <button type="button" title="Strikethrough" aria-label="Strikethrough" onClick={() => setEditForm(prev => ({ ...prev, signature: prev.signature + ' ~~strikethrough~~' }))} className="px-2 py-0.5 rounded line-through hover:bg-[var(--honey-100)] hover:text-[var(--text-primary)] cursor-pointer">S</button>
                      <button type="button" title="Insert Link" aria-label="Insert Link" onClick={() => setEditForm(prev => ({ ...prev, signature: prev.signature + ' [Link](https://)' }))} className="px-2 py-0.5 rounded hover:bg-[var(--honey-100)] hover:text-[var(--text-primary)] cursor-pointer">🔗</button>
                    </div>
                  </div>
                </div>

                {/* Email Forwarding Destination */}
                <div>
                  <label htmlFor="edit-forwarding-dest" className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Email forwarding destination</label>
                  <input
                    id="edit-forwarding-dest"
                    name="forwardingDestination"
                    aria-label="Email forwarding destination"
                    type="email"
                    value={editForm.forwardingDestination}
                    onChange={e => setEditForm({ ...editForm, forwardingDestination: e.target.value })}
                    className="input w-full p-2.5 outline-none text-xs font-mono"
                    placeholder={editingAccount.email}
                  />
                </div>
              </div>
            )}

            {/* TAB 2: CREDENTIALS */}
            {activeTab === 'credentials' && (
              <div className="space-y-4 font-sans max-h-[60vh] overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={editingAccount.email}
                    className="input w-full p-2.5 outline-none bg-[var(--bg-elevated)] text-xs font-mono text-[var(--text-muted)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">App Password (16 Characters)</label>
                  <input
                    type="text"
                    value={editForm.password}
                    onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                    className="input w-full p-2.5 outline-none font-mono text-xs"
                    placeholder="••••••••••••••••"
                  />
                </div>

                {/* Live 2FA Code Box */}
                <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-[var(--border-subtle)]"
                          strokeWidth="3"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-[var(--honey-500)] transition-all duration-300"
                          strokeDasharray={`${((totpData[editingAccount.email]?.secondsRemaining || 30) / 30) * 100}, 100`}
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span className="absolute text-[9px] font-bold text-[var(--text-muted)] font-mono">
                        {totpData[editingAccount.email]?.secondsRemaining || 30}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Live 2FA Authentication Code</span>
                      <span className="text-sm font-mono font-bold text-[var(--honey-600)] tracking-widest">
                        {totpData[editingAccount.email]?.code || '------'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyTOTP(editingAccount.email, totpData[editingAccount.email]?.code)}
                    className="p-2 text-xs font-bold rounded-lg bg-[var(--honey-100)] text-[var(--honey-700)] hover:bg-[var(--honey-200)] transition-colors cursor-pointer"
                  >
                    {copiedTotpEmail === editingAccount.email ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: ADMIN CREDENTIALS */}
            {activeTab === 'admin' && (
              <div className="space-y-4 font-sans max-h-[60vh] overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Admin Email</label>
                  <input
                    type="email"
                    value={editForm.adminEmail}
                    onChange={e => setEditForm({ ...editForm, adminEmail: e.target.value })}
                    className="input w-full p-2.5 outline-none text-xs font-mono"
                    placeholder="admin@domain.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Admin Password</label>
                  <input
                    type="text"
                    value={editForm.adminPassword}
                    onChange={e => setEditForm({ ...editForm, adminPassword: e.target.value })}
                    className="input w-full p-2.5 outline-none font-mono text-xs"
                    placeholder="••••••••••••••••"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Admin 2FA Secret Key</label>
                  <input
                    type="text"
                    value={editForm.adminSecret}
                    onChange={e => setEditForm({ ...editForm, adminSecret: e.target.value })}
                    className="input w-full p-2.5 outline-none font-mono text-xs"
                    placeholder="32-character base32 secret"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                disabled={savingEdit}
                className="btn btn-secondary py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="btn btn-primary py-2 text-xs font-bold"
              >
                {savingEdit ? 'Updating...' : 'Update'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Spam & Deliverability Audit Modal */}
      {spamReportModal && spamReportModal.report && (
        <div className="overlay flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel-raised p-6 rounded-2xl max-w-lg w-full space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="text-[var(--honey-600)]" size={22} />
                <div>
                  <h2 className="text-lg font-extrabold text-[var(--text-primary)] font-sans">Spam & Deliverability Audit</h2>
                  <p className="text-xs text-[var(--text-muted)] font-mono">{spamReportModal.email}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black font-mono text-[var(--success)]">{spamReportModal.report.score}/100</span>
                <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Spam Score</p>
              </div>
            </div>

            {/* Rating Banner */}
            <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">SpamAssassin Rating</span>
                <p className="text-sm font-extrabold text-[var(--text-primary)] font-mono">
                  {spamReportModal.report.spamAssassinRating} / 10.0 (Lower is better)
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                spamReportModal.report.ratingLabel === 'EXCELLENT' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
              }`}>
                {spamReportModal.report.ratingLabel}
              </span>
            </div>

            {/* Checklist */}
            <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Rule Compliance Checklist</h4>
              {spamReportModal.report.rules.map((r, idx: number) => (
                <div key={idx} className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl flex items-start gap-3">
                  {r.passed ? (
                    <CheckCircle size={16} className="text-[var(--success)] shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={16} className="text-[var(--danger)] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">{r.rule}</span>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{r.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Actionable Recommendations */}
            {(spamReportModal.report.recommendations?.length ?? 0) > 0 && (
              <div className="p-4 bg-[var(--warning-bg)] border border-[var(--warning)]/20 rounded-xl space-y-1.5">
                <h5 className="text-xs font-bold text-[var(--warning)] flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Actionable Deliverability Recommendations
                </h5>
                <ul className="list-disc list-inside text-xs text-[var(--text-secondary)] space-y-1 pl-1">
                  {spamReportModal.report.recommendations?.map((rec, i: number) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => setSpamReportModal(null)} className="btn btn-primary py-2 text-xs font-bold">
                Close Report
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
