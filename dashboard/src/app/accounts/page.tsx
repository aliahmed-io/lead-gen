'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ShieldAlert,
  Mail,
  AlertTriangle,
  Send,
  Activity,
  CheckCircle,
  Clock,
  Settings as SettingsIcon,
  RefreshCw,
} from 'lucide-react';
import { AccountHealth, Settings } from '@/types';

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountHealth[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccount, setNewAccount] = useState({ email: '', password: '', smtpHost: '', imapHost: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message || 'Error loading accounts dashboard data.');
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
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-10 max-w-lg mx-auto text-center">
        <div className="relative w-16 h-16 mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="w-16 h-16 rounded-full border-4 border-white/10 border-t-blue-500"
          />
        </div>
        <h2 className="text-xl font-medium text-gray-300">Evaluating Mailbox Health...</h2>
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
        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
          <ShieldAlert size={10} /> Critical
        </span>
      );
    }
    if (score === 'warning' || rate > 0.03) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
          <ShieldAlert size={10} /> Warning
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
        <ShieldCheck size={10} /> Good Health
      </span>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Outreach Mailboxes</h1>
          <p className="text-gray-400 text-sm mt-1">Manage SMTP/IMAP rotation accounts, bounce thresholds, and warmups.</p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="glass-panel border-rose-500/20 bg-rose-500/5 p-4 rounded-xl flex items-center gap-3 text-rose-400 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Warning Banners */}
      {warningAccountsCount > 0 && (
        <div className="glass-panel border-amber-500/20 bg-amber-500/5 p-5 rounded-2xl flex items-start gap-4">
          <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Outreach Health Notice</h4>
            <p className="text-gray-400 text-xs mt-1">
              There are {warningAccountsCount} mailboxes with a bounce rate exceeding 3.0%. 
              To protect domain reputation and avoid ISP rate-limiting, we recommend auditing the lead validation settings.
            </p>
          </div>
        </div>
      )}

      {criticalAccountsCount > 0 && (
        <div className="glass-panel border-rose-500/20 bg-rose-500/5 p-5 rounded-2xl flex items-start gap-4">
          <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400 animate-pulse">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Automatic Account Auto-Pause Imminent</h4>
            <p className="text-gray-400 text-xs mt-1">
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
              className="glass-panel rounded-2xl p-6 hover:bg-white/[0.04] transition-all border border-white/5 relative overflow-hidden group flex flex-col justify-between h-[280px]"
            >
              {/* Account Top Row */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 group-hover:scale-105 transition-transform">
                    <Mail size={18} />
                  </div>
                  {getScoreBadge(account.healthScore, account.bounceRate)}
                </div>

                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-white truncate pr-2" title={account.email}>
                    {account.email}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Mailbox ID: Account {account.id}</p>
                </div>
              </div>
              <button onClick={() => handleDeleteAccount(String(account.id))} className="absolute top-4 right-4 p-1.5 bg-rose-500/10 text-rose-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500/20 z-10 cursor-pointer">
                <ShieldAlert size={14} />
              </button>

              {/* Progress and Limits */}
              <div className="space-y-2 my-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-gray-400">Daily Limits Progress</span>
                  <span className="text-white font-mono">{account.sentToday} / {dailyLimit} sends</span>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <div
                    style={{ width: `${Math.min(limitPct, 100)}%` }}
                    className={`h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500`}
                  />
                </div>
              </div>

              {/* Detailed Metrics Footer */}
              <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Total Sent</p>
                  <p className="text-sm font-bold text-gray-200 mt-1 flex items-center justify-center gap-1 font-mono">
                    <Send size={11} className="text-gray-500" /> {account.totalSent}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Bounces</p>
                  <p className={`text-sm font-bold mt-1 font-mono ${account.bounceCount > 0 ? 'text-rose-400' : 'text-gray-200'}`}>
                    {account.bounceCount}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Bounce Rate</p>
                  <p
                    className={`text-sm font-bold mt-1 font-mono ${
                      account.bounceRate > 0.05
                        ? 'text-rose-400'
                        : account.bounceRate > 0.03
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {bouncePct}%
                  </p>
                </div>
              </div>

              {/* Last Active Timestamp */}
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 pt-2.5 mt-2 border-t border-white/5">
                <Clock size={11} />
                <span>Last active: {formatDate(account.lastActiveAt)}</span>
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
          className="glass-panel rounded-2xl p-6 hover:bg-white/[0.04] transition-all border border-white/5 border-dashed flex flex-col items-center justify-center cursor-pointer min-h-[280px]"
        >
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-white">Add New Mailbox</h3>
          <p className="text-xs text-gray-500 mt-2 text-center">Connect a new SMTP/IMAP account for outreach.</p>
        </motion.div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 border border-white/10 p-6 rounded-2xl max-w-md w-full"
          >
            <h2 className="text-xl font-bold text-white mb-4">Add New Mailbox</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Email Address</label>
                <input type="email" value={newAccount.email} onChange={e => setNewAccount({...newAccount, email: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">App Password</label>
                <input type="password" value={newAccount.password} onChange={e => setNewAccount({...newAccount, password: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">SMTP Host</label>
                <input type="text" value={newAccount.smtpHost} onChange={e => setNewAccount({...newAccount, smtpHost: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">IMAP Host</label>
                <input type="text" value={newAccount.imapHost} onChange={e => setNewAccount({...newAccount, imapHost: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} disabled={isSubmitting} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white disabled:opacity-50 cursor-pointer">Cancel</button>
              <button onClick={handleAddAccount} disabled={isSubmitting} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 cursor-pointer">{isSubmitting ? 'Saving...' : 'Save Account'}</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
