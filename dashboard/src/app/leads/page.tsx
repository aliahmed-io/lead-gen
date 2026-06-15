'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle,
  XCircle,
  Mail,
  UserCheck,
  UserMinus,
  Globe,
  MapPin,
  ListFilter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { LeadRecord } from '@/types';

export default function Leads() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [limit] = useState(50);

  // Filters state
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Row selection & expansion state
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Fetch paginated and filtered leads
  const fetchLeads = () => {
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      status,
      platform,
      state: stateFilter,
      search: debouncedSearch,
    });

    fetch(`/api/leads?${query.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch leads from database');
        return res.json();
      })
      .then((data) => {
        setLeads(data.records || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 0);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounced search trigger
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [search]);

  // Re-fetch when page or filters change
  useEffect(() => {
    fetchLeads();
  }, [page, status, platform, stateFilter, debouncedSearch]);

  // Handle bulk actions
  const handleBulkAction = async (action: 'unsubscribe' | 'mark_interested') => {
    if (selectedEmails.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, emails: selectedEmails }),
      });
      if (!res.ok) throw new Error('Bulk action failed');
      const data = await res.json();
      if (data.success) {
        setSelectedEmails([]);
        fetchLeads();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const emailsOnPage = leads.map((l) => l.email).filter((e): e is string => !!e);
      setSelectedEmails(emailsOnPage);
    } else {
      setSelectedEmails([]);
    }
  };

  const handleSelectRow = (email: string, checked: boolean) => {
    if (checked) {
      setSelectedEmails((prev) => [...prev, email]);
    } else {
      setSelectedEmails((prev) => prev.filter((e) => e !== email));
    }
  };

  const toggleExpandRow = (email: string) => {
    setExpandedEmail((prev) => (prev === email ? null : email));
  };

  const getStatusBadge = (s: string | undefined) => {
    const statusVal = s || 'found';
    if (statusVal === 'interested') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (statusVal.startsWith('followed_up')) return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
    if (statusVal === 'sent') return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    if (statusVal === 'bounced') return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
    return 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
  };

  const exportToCSV = () => {
    if (!leads.length) return;
    const headers = ['Business Name', 'Email', 'Platform', 'Status', 'Website', 'State', 'City', 'Sent At', 'Replied At'];
    const rows = leads.map(l => [
      l.businessName || '',
      l.email || '',
      l.platform || '',
      l.status || '',
      l.website || '',
      l.state || '',
      l.city || '',
      l.sentAt || '',
      l.repliedAt || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'leads_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Leads Database</h1>
          <p className="text-gray-400 text-sm mt-1">Browse, filter, and execute bulk actions on your verified contacts.</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {/* Filter Bar */}
      <div className="glass-panel p-5 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by company, email, status, website..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-gray-500 text-xs font-semibold shrink-0 uppercase tracking-wider">Status</span>
            <select
              value={status}
              onChange={(e) => { setPage(1); setStatus(e.target.value); }}
              className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer w-full md:w-auto"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="followed_up">Followed Up</option>
              <option value="bounced">Bounced</option>
              <option value="interested">Interested</option>
              <option value="completed_no_interest">Opted Out</option>
            </select>
          </div>

          {/* Platform Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-gray-500 text-xs font-semibold shrink-0 uppercase tracking-wider">Platform</span>
            <select
              value={platform}
              onChange={(e) => { setPage(1); setPlatform(e.target.value); }}
              className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer w-full md:w-auto"
            >
              <option value="all">All Platforms</option>
              <option value="Shopify">Shopify</option>
              <option value="WooCommerce">WooCommerce</option>
              <option value="WordPress">WordPress</option>
              <option value="Magento">Magento</option>
              <option value="Other">Other / Custom</option>
            </select>
          </div>

          {/* State Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-gray-500 text-xs font-semibold shrink-0 uppercase tracking-wider">State</span>
            <select
              value={stateFilter}
              onChange={(e) => { setPage(1); setStateFilter(e.target.value); }}
              className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer w-full md:w-auto"
            >
              <option value="all">All States</option>
              <option value="TX">Texas (TX)</option>
              <option value="FL">Florida (FL)</option>
              <option value="CA">California (CA)</option>
              <option value="NY">New York (NY)</option>
              <option value="NC">North Carolina (NC)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      <AnimatePresence>
        {selectedEmails.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-blue-500/10 border border-blue-500/20 px-5 py-4 rounded-xl text-blue-400 text-xs font-bold"
          >
            <div className="flex items-center gap-2">
              <ListFilter size={16} />
              <span>Selected {selectedEmails.length} leads for bulk modification</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleBulkAction('mark_interested')}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <UserCheck size={14} /> Mark Interested
              </button>
              <button
                onClick={() => handleBulkAction('unsubscribe')}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <UserMinus size={14} /> Unsubscribe (Opt-out)
              </button>
              <button
                onClick={() => setSelectedEmails([])}
                className="text-gray-400 hover:text-white px-2 py-1 transition-colors"
              >
                Clear Selection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leads Table Card */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedEmails.length === leads.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4.5 h-4.5 border border-white/10 rounded cursor-pointer accent-blue-500"
                  />
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Business Name</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Email Address</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Platform</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 w-16 text-center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-gray-400">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-t-2 border-blue-500 mb-3" />
                    <p className="text-xs">Loading Leads Database...</p>
                  </td>
                </tr>
              ) : leads.length > 0 ? (
                leads.map((lead, idx) => {
                  const isSelected = lead.email ? selectedEmails.includes(lead.email) : false;
                  const isExpanded = lead.email ? expandedEmail === lead.email : false;

                  return (
                    <>
                      <tr
                        key={lead.email || idx}
                        className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${
                          isExpanded ? 'bg-white/[0.01]' : ''
                        }`}
                        onClick={() => lead.email && toggleExpandRow(lead.email)}
                      >
                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                          {lead.email && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleSelectRow(lead.email!, e.target.checked)}
                              className="w-4.5 h-4.5 border border-white/10 rounded cursor-pointer accent-blue-500"
                            />
                          )}
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-200">
                          {lead.businessName || 'Unknown Store'}
                        </td>
                        <td className="px-6 py-4 text-gray-400">{lead.email}</td>
                        <td className="px-6 py-4 text-gray-400">{lead.platform || 'Other'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${getStatusBadge(lead.status)}`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-gray-500">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>

                      {/* Expandable Details Drawer */}
                      <AnimatePresence>
                        {isExpanded && (
                          <tr className="bg-white/[0.01]">
                            <td colSpan={6} className="px-10 py-6 border-t border-b border-white/5">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs text-gray-400 overflow-hidden"
                              >
                                {/* Column 1: Core Details */}
                                <div className="space-y-3">
                                  <h4 className="text-white font-bold uppercase tracking-wider text-[10px]">Business Profile</h4>
                                  <p className="flex items-center gap-2">
                                    <Globe size={14} className="text-gray-500" />
                                    {lead.website ? (
                                      <a
                                        href={lead.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:underline hover:text-blue-300"
                                      >
                                        {lead.website}
                                      </a>
                                    ) : (
                                      'No website found'
                                    )}
                                  </p>
                                  <p className="flex items-center gap-2">
                                    <MapPin size={14} className="text-gray-500" />
                                    {lead.city && lead.state ? `${lead.city}, ${lead.state}` : lead.state || 'Location missing'}
                                  </p>
                                </div>

                                {/* Column 2: Platform & Status */}
                                <div className="space-y-3">
                                  <h4 className="text-white font-bold uppercase tracking-wider text-[10px]">E-commerce Engine</h4>
                                  <p>
                                    <span className="font-semibold text-gray-500">Tech Stack:</span> {lead.platform || 'Unknown platform'}
                                  </p>
                                  <p>
                                    <span className="font-semibold text-gray-500">Campaign Status:</span>{' '}
                                    <span className="capitalize">{lead.status}</span>
                                  </p>
                                </div>

                                {/* Column 3: Timestamps */}
                                <div className="space-y-3">
                                  <h4 className="text-white font-bold uppercase tracking-wider text-[10px]">Activity Timestamps</h4>
                                  {lead.sentAt && (
                                    <p>
                                      <span className="font-semibold text-gray-500">Sent Outreach:</span>{' '}
                                      {new Date(lead.sentAt).toLocaleString()}
                                    </p>
                                  )}
                                  {lead.repliedAt && (
                                    <p>
                                      <span className="font-semibold text-gray-500">Last Replied:</span>{' '}
                                      {new Date(lead.repliedAt).toLocaleString()}
                                    </p>
                                  )}
                                  {(!lead.sentAt && !lead.repliedAt) && <p className="text-gray-500">No activity logged.</p>}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-gray-500">
                    No leads found matching current filter rules.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/5 px-6 py-4.5 bg-white/[0.01]">
            <span className="text-xs text-gray-500 font-medium">
              Showing <span className="text-gray-300 font-bold">{leads.length}</span> of{' '}
              <span className="text-gray-300 font-bold">{total.toLocaleString()}</span> leads
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1 || loading}
                className="p-2 border border-white/10 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-400 font-semibold px-2">
                Page <span className="text-white font-bold">{page}</span> of{' '}
                <span className="text-white font-bold">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages || loading}
                className="p-2 border border-white/10 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
