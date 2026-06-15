'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Users,
  CheckCircle,
  XCircle,
  TrendingUp,
  Play,
  Pause as PauseIcon,
  Square,
  AlertCircle,
  Activity,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { EnhancedStats, CampaignState, AccountHealth } from '@/types';

export default function Overview() {
  const [stats, setStats] = useState<EnhancedStats | null>(null);
  const [campaignState, setCampaignState] = useState<CampaignState | null>(null);
  const [accounts, setAccounts] = useState<AccountHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [statsRes, campaignRes, accountsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/campaign'),
        fetch('/api/accounts'),
      ]);

      if (!statsRes.ok || !campaignRes.ok || !accountsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const statsData = await statsRes.json();
      const campaignData = await campaignRes.json();
      const accountsData = await accountsRes.json();

      setStats(statsData);
      setCampaignState(campaignData);
      setAccounts(accountsData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleCampaignAction = async (action: 'pause' | 'resume' | 'stop', reason?: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error('Failed to update campaign status');
      const data = await res.json();
      if (data.success) {
        setCampaignState(data.state);
        fetchData();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

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
        <h2 className="text-xl font-medium text-gray-300">Synchronizing Command Center...</h2>
      </div>
    );
  }

  // Formatting stats
  const formatNum = (num: number | undefined) => (num !== undefined ? num.toLocaleString() : '0');

  const cards = [
    { title: 'Total Leads', value: formatNum(stats?.total), icon: Users, color: 'text-blue-400', bg: 'from-blue-500/10 to-transparent' },
    { title: 'Total Sent', value: formatNum(stats?.sent), icon: Send, color: 'text-purple-400', bg: 'from-purple-500/10 to-transparent' },
    { title: 'Interested', value: formatNum(stats?.replied), icon: CheckCircle, color: 'text-emerald-400', bg: 'from-emerald-500/10 to-transparent' },
    { title: 'Bounced', value: formatNum(stats?.bounced), icon: XCircle, color: 'text-rose-400', bg: 'from-rose-500/10 to-transparent' },
    { title: 'Conversion Rate', value: `${stats?.conversion || 0}%`, icon: TrendingUp, color: 'text-amber-400', bg: 'from-amber-500/10 to-transparent' },
  ];

  // Daily volume chart calculations
  const volumes = stats?.dailyVolume || [];
  const maxVolume = Math.max(...volumes.map((v) => v.count), 1);

  // Funnel calculations
  const totalLeads = stats?.total || 1;
  const sentCount = stats?.sent || 0;
  const stage1Count = stats?.followUpBreakdown?.stage1 || 0;
  const stage2Count = stats?.followUpBreakdown?.stage2 || 0;
  const repliedCount = stats?.replied || 0;

  const funnelStages = [
    { name: 'Pending Leads', count: totalLeads - sentCount, color: 'bg-blue-600/30 text-blue-400 border-blue-500/20' },
    { name: 'Outreach Sent', count: sentCount, color: 'bg-indigo-600/30 text-indigo-400 border-indigo-500/20' },
    { name: 'Follow-up Stage 1', count: stage1Count, color: 'bg-purple-600/30 text-purple-400 border-purple-500/20' },
    { name: 'Follow-up Stage 2', count: stage2Count, color: 'bg-pink-600/30 text-pink-400 border-pink-500/20' },
    { name: 'Interested Replies', count: repliedCount, color: 'bg-emerald-600/30 text-emerald-400 border-emerald-500/20' },
  ];

  const status = campaignState?.status || 'running';
  const statusColors = {
    running: {
      text: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
      dot: 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)] animate-pulse',
      banner: 'border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent',
    },
    paused: {
      text: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
      dot: 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.7)]',
      banner: 'border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent',
    },
    stopped: {
      text: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
      dot: 'bg-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]',
      banner: 'border-rose-500/20 bg-gradient-to-r from-rose-500/5 to-transparent',
    },
  }[status];

  // Helper to format activity status
  const formatStatus = (s: string) => {
    if (s === 'followed_up_1') return 'Follow-up 1';
    if (s === 'followed_up_2') return 'Follow-up 2';
    if (s === 'completed_no_interest') return 'Opted Out';
    return s;
  };

  const getStatusBadgeColor = (s: string) => {
    if (s === 'interested') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (s.startsWith('followed_up')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    if (s === 'sent') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (s === 'bounced') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Campaign Command Center</h1>
          <p className="text-gray-400 text-sm mt-1">Real-time control and unified metrics for your cold outreach systems.</p>
        </div>
        <button
          onClick={fetchData}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
        >
          <RefreshCw size={18} className={actionLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="glass-panel border-rose-500/20 bg-rose-500/5 p-4 rounded-xl flex items-center gap-3 text-rose-400 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Campaign Control Banner */}
      <div className={`border rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 transition-all ${statusColors.banner}`}>
        <div className="flex items-center gap-4.5">
          <span className={`w-3.5 h-3.5 rounded-full ${statusColors.dot}`} />
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Campaign is <span className="capitalize">{status}</span>
            </h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {status === 'running' && 'Outreach automation is running actively. Emails are sending according to schedule.'}
              {status === 'paused' && `Outreach is temporarily paused. Reason: ${campaignState?.pauseReason || 'None specified'}.`}
              {status === 'stopped' && 'Outreach is fully stopped. Manual action is required to reactivate sending.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {status !== 'running' && (
            <button
              onClick={() => handleCampaignAction('resume')}
              disabled={actionLoading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-600/20"
            >
              <Play size={16} fill="white" /> Resume Campaign
            </button>
          )}

          {status === 'running' && (
            <button
              onClick={() => handleCampaignAction('pause', 'Paused via control center')}
              disabled={actionLoading}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-600/20"
            >
              <PauseIcon size={16} fill="white" /> Pause Campaign
            </button>
          )}

          {status !== 'stopped' && (
            <button
              onClick={() => handleCampaignAction('stop')}
              disabled={actionLoading}
              className="flex items-center gap-2 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Square size={14} fill="currentColor" /> Stop
            </button>
          )}
        </div>
      </div>

      {/* Main Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {cards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`glass-panel p-6 rounded-2xl bg-gradient-to-b ${card.bg} hover:bg-white/[0.04] transition-all relative overflow-hidden group`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{card.title}</h3>
              <card.icon className={`w-5 h-5 ${card.color} group-hover:scale-110 transition-transform`} />
            </div>
            <p className="text-3xl font-extrabold text-white tracking-tight">
              {stats === null ? '-' : card.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Daily Send Volume & Follow-up Funnel Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Send Volume Chart (CSS) */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-7 flex flex-col h-[380px]">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Sending Volume</h3>
              <p className="text-gray-400 text-xs mt-0.5">Daily emails sent across all accounts for the last 14 days.</p>
            </div>
            <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full font-semibold">
              Central Time (CT)
            </span>
          </div>

          {/* Chart Core */}
          <div className="flex-1 flex items-end gap-3.5 pb-2 border-b border-white/5">
            {volumes.map((vol, idx) => {
              const pct = (vol.count / maxVolume) * 100;
              const dateObj = new Date(vol.date + 'T00:00:00');
              const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <div key={vol.date} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 bg-gray-900 border border-white/10 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 transform translate-y-1 group-hover:translate-y-0 shadow-xl z-10 whitespace-nowrap">
                    <span className="font-bold">{vol.count}</span> sends ({shortDate})
                  </div>

                  {/* Visual Bar */}
                  <div
                    style={{ height: `${Math.max(pct, 3)}%` }}
                    className="w-full bg-gradient-to-t from-blue-600 to-purple-500 rounded-t-md group-hover:from-blue-500 group-hover:to-purple-400 transition-all shadow-[0_0_8px_rgba(59,130,246,0.2)]"
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis Labels */}
          <div className="flex justify-between mt-3 px-1">
            {volumes.length > 0 && (
              <>
                <span className="text-[10px] text-gray-500 font-medium">{new Date(volumes[0].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span className="text-[10px] text-gray-500 font-medium">Halfway</span>
                <span className="text-[10px] text-gray-500 font-medium">{new Date(volumes[volumes.length - 1].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </>
            )}
          </div>
        </div>

        {/* Follow-up Funnel */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-5 flex flex-col h-[380px]">
          <div>
            <h3 className="text-base font-bold text-white">Outreach Pipeline</h3>
            <p className="text-gray-400 text-xs mt-0.5">Conversion breakdown through stages of lead campaign lifecycle.</p>
          </div>

          <div className="flex-1 flex flex-col justify-center space-y-4.5 mt-4">
            {funnelStages.map((stage, i) => {
              const pct = totalLeads > 0 ? ((stage.count / totalLeads) * 100).toFixed(1) : '0';
              return (
                <div key={stage.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-300">{stage.name}</span>
                    <span className="text-gray-400 font-mono">
                      {formatNum(stage.count)} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div
                      style={{ width: `${Math.max(parseFloat(pct), 1)}%` }}
                      className={`h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Account Health & Activity Logs Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Account Health Summary */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Active Sending Accounts</h3>
              <p className="text-gray-400 text-xs mt-0.5">Real-time health and safety limits per SMTP/IMAP mailbox.</p>
            </div>
            {accounts.some((a) => a.healthScore === 'critical') && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full">
                <ShieldAlert size={12} /> Auto-Pause Warning
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {accounts.slice(0, 4).map((account) => {
              const dotColor =
                account.healthScore === 'good'
                  ? 'bg-emerald-500'
                  : account.healthScore === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-rose-500 animate-pulse';

              return (
                <div
                  key={account.id}
                  className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3 hover:bg-white/[0.04] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-200 truncate max-w-[80%]">
                      {account.email}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <p className="text-gray-500 font-semibold">SENT TODAY</p>
                      <p className="text-white font-bold font-mono mt-0.5">
                        {account.sentToday} <span className="text-gray-600 font-normal">sends</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-semibold">BOUNCE RATE</p>
                      <p
                        className={`font-bold font-mono mt-0.5 ${
                          account.bounceRate > 0.05
                            ? 'text-rose-400'
                            : account.bounceRate > 0.03
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {(account.bounceRate * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center pt-2">
            <Link
              href="/accounts"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold hover:underline"
            >
              Manage all email accounts <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-5 flex flex-col h-[320px]">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">Live Activity Feed</h3>
            <p className="text-gray-400 text-xs mt-0.5">Real-time trace logs of campaign status mutations.</p>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              stats.recentActivity.map((act, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-3 text-xs border-b border-white/5 pb-2.5 last:border-0"
                >
                  <div className="space-y-0.5 truncate max-w-[70%]">
                    <p className="text-gray-300 font-semibold truncate">{act.email}</p>
                    <p className="text-[10px] text-gray-500">
                      {new Date(act.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {act.from && (
                      <>
                        <span className="text-[10px] text-gray-500 capitalize">{formatStatus(act.from)}</span>
                        <ArrowRight size={10} className="text-gray-600" />
                      </>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadgeColor(act.to)}`}>
                      {formatStatus(act.to)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-10">
                <Activity className="w-8 h-8 text-gray-600 mb-2" />
                <p className="text-xs text-gray-500">No recent campaign activity found.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
