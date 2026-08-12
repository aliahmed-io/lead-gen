'use client';
import React from 'react';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ChevronLeft, ChevronRight, UserCheck, UserMinus,
  ChevronDown, ChevronUp, Download, SlidersHorizontal, Upload,
  Users, X, ShieldCheck, CheckCircle, ArrowUpDown,
  Flame, CircleDot, OctagonAlert, MailPlus, RefreshCw, Undo2, Trash2,
  ScanSearch
} from 'lucide-react';
import { LeadRecord } from '@/types';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PageHeader, ErrorBanner } from '@/components/ui/page';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'followed_up', label: 'Followed Up' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'interested', label: 'Interested' },
  { value: 'completed_no_interest', label: 'Opted Out' },
];

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All Platforms' },
  { value: 'Shopify', label: 'Shopify' },
  { value: 'WooCommerce', label: 'WooCommerce' },
  { value: 'WordPress', label: 'WordPress' },
  { value: 'Magento', label: 'Magento' },
  { value: 'Other', label: 'Other' },
];

const STATE_OPTIONS = [
  { value: 'all', label: 'All States' },
  { value: 'TX', label: 'Texas' },
  { value: 'FL', label: 'Florida' },
  { value: 'CA', label: 'California' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'N. Carolina' },
];

function statusStyle(s: string | undefined): { bg: string; color: string; border: string; label: string } {
  const v = s || 'pending';
  if (v === 'interested')              return { bg: 'var(--success-bg)',  color: 'var(--success)', border: 'rgba(74, 109, 75, 0.15)',  label: 'Interested' };
  if (v === 'followed_up_1')           return { bg: 'rgba(161, 136, 107, 0.08)',  color: 'var(--text-secondary)', border: 'rgba(161, 136, 107, 0.15)',  label: 'Follow-up 1' };
  if (v === 'followed_up_2')           return { bg: 'rgba(161, 136, 107, 0.08)',  color: 'var(--text-secondary)', border: 'rgba(161, 136, 107, 0.15)',  label: 'Follow-up 2' };
  if (v === 'sent')                    return { bg: 'var(--honey-100)',   color: 'var(--honey-600)', border: 'var(--honey-glow)',   label: 'Sent' };
  if (v === 'bounced')                 return { bg: 'var(--danger-bg)',    color: 'var(--danger)', border: 'rgba(181, 78, 69, 0.15)',    label: 'Bounced' };
  if (v === 'completed_no_interest')   return { bg: 'var(--bg-neutral-muted)', color: 'var(--text-secondary)', border: 'var(--border-subtle)', label: 'Opted Out' };
  return                                      { bg: 'var(--bg-neutral-muted)', color: 'var(--text-secondary)', border: 'var(--border-subtle)', label: v };
}

export default function Leads() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [qualityTier, setQualityTier] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Sort States
  const [sortBy, setSortBy] = useState('activity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selection States
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectingAllMatching, setSelectingAllMatching] = useState(false);

  // Bulk / Export States
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Verification Report Modal States
  const [verificationResults, setVerificationResults] = useState<{ email: string; valid: boolean; reason: string }[] | null>(null);

  // Enrichment Modal States
  const [enrichResults, setEnrichResults] = useState<{ enriched: number; found: number; results: Array<{ businessName: string; domain: string; email: string | null; method: string; smtpValid: boolean; tried: string[] }> } | null>(null);
  const [enrichConfirm, setEnrichConfirm] = useState(false);
  const [enrichTarget, setEnrichTarget] = useState<'selected' | 'allMissing' | null>(null);

  // CSV Import States
  const { showToast } = useToast();
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    setImporting(true);
    try {
      const lines = csvText.trim().split('\n');
      const parsedLeads = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        
        // Skip header row if present
        if (i === 0 && (cols[0].toLowerCase().includes('email') || cols[0].toLowerCase().includes('name'))) {
          continue;
        }

        parsedLeads.push({
          email: cols[0],
          businessName: cols[1] || cols[0].split('@')[0],
          platform: cols[2] || 'Other',
          city: cols[3] || '',
          state: cols[4] || '',
        });
      }

      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: parsedLeads }),
      });

      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();

      showToast(`Successfully imported ${data.importedCount} leads (${data.duplicateCount} duplicates skipped)`, 'success');
      setShowImportModal(false);
      setCsvText('');
      fetchLeads(true);
    } catch (err: unknown) {
      showToast((err as Error).message || 'Failed to import leads', 'error');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchLeads = useCallback((showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    const q = new URLSearchParams({ 
      page: String(page), 
      limit: String(limit), 
      status, 
      platform, 
      state: stateFilter, 
      qualityTier,
      search: debouncedSearch,
      sortBy,
      sortOrder
    });
    fetch(`/api/leads?${q}`)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch leads'); return r.json(); })
      .then(d => { setLeads(d.records || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 0); setError(null); })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [page, limit, status, platform, stateFilter, qualityTier, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchLeads(false);
    });
  }, [fetchLeads]);

  const handleSort = (field: string) => {
    setLoading(true);
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleBulkAction = async (action: 'unsubscribe' | 'mark_interested' | 'verify') => {
    if (!selectedEmails.length) return;
    setBulkLoading(true);
    setError(null);
    try {
      /* Campaign actions are keyed by lead email — resolve selected record
       * keys to their emails (leads without emails are harmlessly skipped). */
      const selectedEmailList = selectedEmails
        .map(k => leads.find(l => l.key === k)?.email)
        .filter((e): e is string => !!e);
      if (selectedEmailList.length === 0) {
        showToast('The selected leads have no email addresses yet — use Enrich Emails to find them.', 'info');
        setSelectedEmails([]);
        return;
      }
      const res = await fetch('/api/leads', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ action, emails: selectedEmailList }) 
      });
      if (!res.ok) throw new Error(`${action} bulk action failed`);
      const d = await res.json();
      
      if (action === 'verify' && d.results) {
        setVerificationResults(d.results);
        setSelectedEmails([]);
        fetchLeads();
      } else if (d.success) {
        setSelectedEmails([]);
        fetchLeads();
      }
    } catch (e: unknown) { 
      setError((e as Error).message); 
    } finally { 
      setBulkLoading(false); 
    }
  };

  // Leads-DB bulk actions (reset / delete / unsuppress) via /api/leads/bulk
  const handleLeadsDbBulkAction = async (action: 'reset_to_pending' | 'delete' | 'unsuppress') => {
    if (!selectedEmails.length) return;
    setBulkLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, emails: selectedEmails }),
      });
      if (!res.ok) throw new Error(`${action} bulk action failed`);
      const d = await res.json();
      if (d.success) {
        setSelectedEmails([]);
        setSelectingAllMatching(false);
        fetchLeads(true);
        showToast(
          action === 'delete'
            ? `Deleted ${d.count} lead record${d.count === 1 ? '' : 's'} from the database.`
            : `${action === 'reset_to_pending' ? 'Requeued' : 'Unsuppressed'} ${d.count} lead${d.count === 1 ? '' : 's'} back to Pending.`,
          'success'
        );
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBulkLoading(false);
    }
  };

  // Pattern-probe email enrichment for leads without emails
  const runEnrichment = async (target: 'selected' | 'allMissing') => {
    setBulkLoading(true);
    setError(null);
    setEnrichResults(null);
    setEnrichConfirm(false);
    try {
      const body = target === 'allMissing' ? { allMissing: true } : { emails: selectedEmails };
      const res = await fetch('/api/leads/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Email enrichment failed');
      const d = await res.json();
      setEnrichResults({ enriched: d.enriched ?? 0, found: d.found ?? 0, results: d.results || [] });
      setSelectedEmails([]);
      setSelectingAllMatching(false);
      fetchLeads(true);
      if (d.found > 0) {
        showToast(`Enrichment complete: found ${d.found} of ${d.enriched} missing email${d.enriched === 1 ? '' : 's'}.`, 'success');
      } else {
        showToast(`Enrichment complete: no emails were found for ${d.enriched} lead${d.enriched === 1 ? '' : 's'}. Some mail servers block probes.`, 'info');
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBulkLoading(false);
    }
  };

  // Checkbox functions
  const allCurrentPageSelected = leads.length > 0 && leads.every(l => !l.key || selectedEmails.includes(l.key));
  
  const handleSelectAll = (checked: boolean) => {
    const pageKeys = leads.map(l => l.key).filter((k): k is string => !!k);
    if (checked) {
      setSelectedEmails(prev => Array.from(new Set([...prev, ...pageKeys])));
    } else {
      setSelectedEmails(prev => prev.filter(e => !pageKeys.includes(e)));
      setSelectingAllMatching(false);
    }
  };

  const handleSelectRow = (email: string, checked: boolean) => {
    setSelectedEmails(prev => checked ? [...prev, email] : prev.filter(e => e !== email));
  };

  const toggleSelectRow = (email: string) => {
    setSelectedEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  const selectAllMatchingLeads = async () => {
    setBulkLoading(true);
    try {
      const q = new URLSearchParams({ 
        status, 
        platform, 
        state: stateFilter, 
        search: debouncedSearch, 
        limit: '100000', // Retrieve all records
        sortBy,
        sortOrder
      });
      const res = await fetch(`/api/leads?${q}`);
      if (res.ok) {
        const d = await res.json();
        const allEmails = (d.records || []).map((r: LeadRecord) => r.email).filter((e: string | undefined): e is string => !!e);
        setSelectedEmails(allEmails);
        setSelectingAllMatching(true);
      }
    } catch (e) {
      console.error('Failed to select all leads:', e);
    } finally {
      setBulkLoading(false);
    }
  };

  // Export functions
  const triggerCSVDownload = (records: LeadRecord[], filename: string) => {
    const headers = ['Business Name', 'Email', 'Platform', 'Status', 'Website', 'State', 'City', 'Sent At', 'Replied At', 'FollowUp1 At', 'FollowUp2At', 'Completed At'];
    const rows = records.map(l => [
      l.businessName, l.email, l.platform, l.status, l.website, l.state, l.city, 
      l.sentAt ? new Date(l.sentAt).toISOString() : '', 
      l.repliedAt ? new Date(l.repliedAt).toISOString() : '',
      l.followedUp1At ? new Date(l.followedUp1At).toISOString() : '',
      l.followedUp2At ? new Date(l.followedUp2At).toISOString() : '',
      l.completedAt ? new Date(l.completedAt).toISOString() : ''
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = filename;
    a.click();
    setShowExportMenu(false);
  };

  const exportSelected = () => {
    const selectedRecords = leads.filter(l => l.key && selectedEmails.includes(l.key));
    triggerCSVDownload(selectedRecords, `selected_leads_${selectedRecords.length}.csv`);
  };

  const exportFiltered = async () => {
    setBulkLoading(true);
    try {
      const q = new URLSearchParams({ 
        status, 
        platform, 
        state: stateFilter, 
        search: debouncedSearch, 
        limit: '100000', // Fetch all matching leads
        sortBy,
        sortOrder
      });
      const res = await fetch(`/api/leads?${q}`);
      if (res.ok) {
        const d = await res.json();
        triggerCSVDownload(d.records || [], 'leads_export_filtered_all.csv');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBulkLoading(false);
    }
  };

  const activeFilters = [status !== 'all' && status, platform !== 'all' && platform, stateFilter !== 'all' && stateFilter].filter(Boolean);

  // Formatting helpers for single line display
  const formatTableDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatLocation = (city: string | undefined, state: string | undefined) => {
    if (!city && !state) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
    if (city && state) return `${city}, ${state}`;
    return city || state || '—';
  };

  const renderWebsite = (url: string | undefined) => {
    if (!url) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
    const displayUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '');
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    return (
      <a 
        href={fullUrl} 
        target="_blank" 
        rel="noopener noreferrer" 
        style={{ color: 'var(--honey-600)', textDecoration: 'none', fontWeight: 700 }}
        onClick={e => e.stopPropagation()}
      >
        {displayUrl}
      </a>
    );
  };

  // Header column definitions
  const columns = [
    { label: 'Business Name', field: 'businessName', width: '220px' },
    { label: 'Email Address', field: 'email', width: '220px' },
    { label: 'Website', field: 'website', width: '180px' },
    { label: 'Location', field: 'city', width: '160px' },
    { label: 'Platform', field: 'platform', width: '120px' },
    { label: 'Campaign Status', field: 'status', width: '140px' },
    { label: 'Quality Score', field: 'qualityScore', width: '130px' },
    { label: 'Sent At', field: 'sentAt', width: '150px' },
    { label: 'Follow-Up 1', field: 'followedUp1At', width: '150px' },
    { label: 'Follow-Up 2', field: 'followedUp2At', width: '150px' },
    { label: 'Replied At', field: 'repliedAt', width: '150px' },
    { label: 'Completed At', field: 'completedAt', width: '150px' },
    { label: 'Last Updated', field: 'updatedAt', width: '150px' }
  ];

  // Render Sort Indicator next to active headers
  const renderSortIndicator = (field: string) => {
    if (sortBy !== field) return <ArrowUpDown size={11} style={{ opacity: 0.3, marginLeft: '6px' }} />;
    return sortOrder === 'asc' ? 
      <ChevronUp size={12} style={{ color: 'var(--honey-600)', marginLeft: '4px' }} /> : 
      <ChevronDown size={12} style={{ color: 'var(--honey-600)', marginLeft: '4px' }} />;
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-inter)' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="Leads Database"
        subtitle={`${total.toLocaleString()} contacts · interactive sort and verify console`}
      >
        {/* Enrich emails for all leads that have a website but no email address */}
        <Button variant="secondary" icon={ScanSearch} onClick={() => { setEnrichTarget('allMissing'); setEnrichConfirm(true); }}>
          Enrich Emails
        </Button>
        <Button variant="primary" icon={Upload} onClick={() => setShowImportModal(true)}>
          Import CSV
        </Button>

        <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)} 
              className="btn btn-secondary" 
              style={{ gap: '6px' }}
            >
              <Download size={14} /> Export CSV <ChevronDown size={12} />
            </button>
          
          <AnimatePresence>
            {showExportMenu && (
              <>
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowExportMenu(false)} />
                <motion.div 
                  initial={{ opacity: 0, y: 5 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: 5 }}
                  style={{
                    position: 'absolute', right: 0, marginTop: '6px', zIndex: 50,
                    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                    borderRadius: '12px', padding: '6px', width: '220px',
                    boxShadow: '0 6px 20px rgba(44, 34, 25, 0.08)'
                  }}
                >
                  <button 
                    onClick={exportFiltered} 
                    style={{
                      width: '100%', padding: '10px 12px', border: 'none', background: 'none',
                      textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)',
                      borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                    className="hover:bg-[var(--honey-50)]"
                  >
                    <Download size={12} /> Export Filtered ({total})
                  </button>
                  <button 
                    onClick={exportSelected} 
                    disabled={selectedEmails.length === 0}
                    style={{
                      width: '100%', padding: '10px 12px', border: 'none', background: 'none',
                      textAlign: 'left', fontSize: '12px', fontWeight: 600, color: selectedEmails.length ? 'var(--text-primary)' : 'var(--text-disabled)',
                      borderRadius: '8px', cursor: selectedEmails.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                    className={selectedEmails.length ? "hover:bg-[var(--honey-50)]" : ""}
                  >
                    <CheckCircle size={12} /> Export Selected ({selectedEmails.length})
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </PageHeader>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* ── Filter Bar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            id="leads-search-input"
            name="search"
            aria-label="Search leads by name, email, or website"
            type="text" placeholder="Search by name, email, website…"
            value={search} onChange={e => { setLoading(true); setSearch(e.target.value); }}
            className="input" style={{ paddingLeft: '36px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '10px' }}>
          <SlidersHorizontal size={13} style={{ color: 'var(--text-secondary)' }} />
          <span className="section-label" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Filters</span>
        </div>

        {[
          { value: qualityTier, set: (v: string) => { setLoading(true); setQualityTier(v); setPage(1); }, opts: [
            { value: 'all', label: 'All Quality Tiers' },
            { value: 'top', label: 'Top Quality (Score 80-100)' },
            { value: 'average', label: 'Average Quality (Score 50-79)' },
            { value: 'low', label: 'Low Quality (Score < 50)' },
          ], label: 'Filter by Lead Quality' },
          { value: status, set: (v: string) => { setLoading(true); setStatus(v); setPage(1); }, opts: STATUS_OPTIONS, label: 'Filter by Status' },
          { value: platform, set: (v: string) => { setLoading(true); setPlatform(v); setPage(1); }, opts: PLATFORM_OPTIONS, label: 'Filter by Platform' },
          { value: stateFilter, set: (v: string) => { setLoading(true); setStateFilter(v); setPage(1); }, opts: STATE_OPTIONS, label: 'Filter by State' },
        ].map((f, i) => (
          <select key={i} value={f.value} onChange={e => f.set(e.target.value)}
            aria-label={f.label}
            className="input" style={{ width: 'auto', minWidth: '130px', padding: '8px 32px 8px 12px' }}>
            {f.opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}

        {activeFilters.length > 0 && (
          <button onClick={() => { setLoading(true); setStatus('all'); setPlatform('all'); setStateFilter('all'); setQualityTier('all'); setPage(1); }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--honey-600)', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 8px', fontWeight: 600 }}>
            <X size={12} /> Clear Filters
          </button>
        )}
      </div>

      {/* ── Bulk Action Bar ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedEmails.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
              background: 'var(--honey-50)', border: '1px solid var(--border-default)',
              borderRadius: '12px', gap: '16px', flexWrap: 'wrap',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-amber">{selectedEmails.length}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {selectingAllMatching ? "all matching leads selected" : "leads selected"}
              </span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Verify emails action */}
              <button 
                onClick={() => handleBulkAction('verify')} 
                disabled={bulkLoading} 
                className="btn"
                style={{ background: 'var(--honey-100)', color: 'var(--honey-700)', border: '1px solid var(--honey-200)', padding: '7px 14px', gap: '6px' }}
              >
                <ShieldCheck size={13} /> Verify Emails
              </button>
              
              <button onClick={() => handleBulkAction('mark_interested')} disabled={bulkLoading} className="btn"
                style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid rgba(74, 109, 75, 0.15)', padding: '7px 14px' }}>
                <UserCheck size={13} /> Mark Interested
              </button>
              
              <button onClick={() => handleBulkAction('unsubscribe')} disabled={bulkLoading} className="btn btn-danger" style={{ padding: '7px 14px' }}>
                <UserMinus size={13} /> Unsubscribe
              </button>

              <div style={{ height: '16px', width: '1px', background: 'var(--border-strong)', margin: '0 4px' }} />

              <button onClick={() => { setEnrichTarget('selected'); setEnrichConfirm(true); }} disabled={bulkLoading} className="btn"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', padding: '7px 14px' }}>
                <ScanSearch size={13} /> Enrich Selected
              </button>

              <button onClick={() => handleLeadsDbBulkAction('reset_to_pending')} disabled={bulkLoading} className="btn"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', padding: '7px 14px' }}>
                <Undo2 size={13} /> Reset to Pending
              </button>

              <button onClick={() => handleLeadsDbBulkAction('unsuppress')} disabled={bulkLoading} className="btn"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', padding: '7px 14px' }}>
                <RefreshCw size={13} /> Unsuppress
              </button>

              <button onClick={() => handleLeadsDbBulkAction('delete')} disabled={bulkLoading} className="btn"
                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(181, 78, 69, 0.15)', padding: '7px 14px' }}>
                <Trash2 size={13} /> Delete
              </button>

              <div style={{ height: '16px', width: '1px', background: 'var(--border-strong)', margin: '0 4px' }} />

              <button 
                onClick={() => { setSelectedEmails([]); setSelectingAllMatching(false); }} 
                className="btn btn-secondary"
                style={{ padding: '7px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={11} /> Cancel Selection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── All Selection matching banner ─────────────────────────── */}
      <AnimatePresence>
        {allCurrentPageSelected && !selectingAllMatching && total > leads.length && (
          <motion.div 
            initial={{ opacity: 0, y: -4 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -4 }}
            style={{
              background: 'var(--bg-neutral-muted)', border: '1px solid var(--border-subtle)',
              borderRadius: '10px', padding: '10px 16px', fontSize: '12px', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
          >
            <span>All {leads.length} leads on this page are selected.</span>
            <button 
              onClick={selectAllMatchingLeads} 
              disabled={bulkLoading}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--honey-600)', fontWeight: 700, textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Select all {total.toLocaleString()} leads in database matching filters
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Table (Scrollable Spreadsheet) ─────────────────────────── */}
      <div style={{ 
        background: 'var(--bg-surface)', 
        border: '1px solid var(--border-default)', 
        borderRadius: '16px', 
        overflow: 'hidden', 
        boxShadow: '0 4px 20px rgba(44, 34, 25, 0.015)',
      }}>
        {/* Horizontal Scroll wrapper */}
        <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-neutral-muted)' }}>
                {/* Checkbox Header Column */}
                <th style={{ padding: '12px 16px', width: '50px', zIndex: 10, position: 'sticky', left: 0, background: 'var(--bg-neutral-muted)' }}>
                  <input type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={e => handleSelectAll(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: 'var(--honey-500)', width: '14px', height: '14px' }}
                    aria-label="Select all leads"
                  />
                </th>
                {columns.map((h, i) => (
                  <th 
                    key={i} 
                    className="section-label" 
                    onClick={() => handleSort(h.field)}
                    style={{ 
                      padding: '12px 16px', 
                      fontSize: '10px', 
                      fontWeight: 800, 
                      color: sortBy === h.field ? 'var(--text-primary)' : 'var(--text-secondary)',
                      width: h.width,
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {h.label}
                      {renderSortIndicator(h.field)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} style={{ padding: '64px', textAlign: 'center' }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--honey-500)', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading leads…</p>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '64px', textAlign: 'center' }}>
                    <Users size={32} style={{ color: 'var(--text-disabled)', margin: '0 auto 12px', display: 'block' }} />
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No leads match your filters.</p>
                  </td>
                </tr>
              ) : leads.map((lead, idx) => {
                const isSelected = lead.key ? selectedEmails.includes(lead.key) : false;
                const st = statusStyle(lead.status);

                return (
                  <tr
                    key={lead.key || lead.email || idx}
                    onClick={() => lead.key && toggleSelectRow(lead.key)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                      background: isSelected ? 'var(--honey-50)' : undefined,
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'var(--bg-neutral-muted)';
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = isSelected ? 'var(--honey-50)' : '';
                    }}
                  >
                    {/* Checkbox column (Sticky for nice scroll) */}
                    <td style={{ 
                      padding: '12px 16px', 
                      width: '50px', 
                      zIndex: 9, 
                      position: 'sticky', 
                      left: 0, 
                      background: isSelected ? 'var(--honey-50)' : 'var(--bg-surface)',
                      borderRight: '1px solid var(--border-subtle)'
                    }} onClick={e => e.stopPropagation()}>
                      {lead.key && (
                        <input type="checkbox" checked={isSelected}
                          onChange={e => handleSelectRow(lead.key!, e.target.checked)}
                          style={{ cursor: 'pointer', accentColor: 'var(--honey-500)', width: '14px', height: '14px' }}
                          aria-label={`Select lead ${lead.businessName || lead.email}`}
                        />
                      )}
                    </td>

                    {/* Business Name */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {lead.businessName || 'Unknown'}
                    </td>

                    {/* Email */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {lead.email}
                    </td>

                    {/* Website */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {renderWebsite(lead.website)}
                    </td>

                    {/* Location */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {formatLocation(lead.city, lead.state)}
                    </td>

                    {/* Platform */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {lead.platform || 'Other'}
                    </td>

                    {/* Campaign Status */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: 700,
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                      }}>
                        {st.label}
                      </span>
                    </td>

                    {/* Quality Tier */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: 700,
                        background: lead.qualityTier === 'top' ? 'var(--honey-100)' : lead.qualityTier === 'average' ? 'var(--bg-elevated)' : 'var(--danger-bg)',
                        color: lead.qualityTier === 'top' ? 'var(--honey-700)' : lead.qualityTier === 'average' ? 'var(--text-secondary)' : 'var(--danger)',
                        border: lead.qualityTier === 'top' ? '1px solid var(--honey-500)' : '1px solid var(--border-subtle)',
                      }}>
                        {lead.qualityTier === 'top' ? <Flame size={10} /> : lead.qualityTier === 'average' ? <CircleDot size={10} /> : <OctagonAlert size={10} />}
                        {lead.qualityTier === 'top' ? 'Top' : lead.qualityTier === 'average' ? 'Average' : 'Low'} ({lead.qualityScore ?? 0})
                      </span>
                    </td>

                    {/* Sent At */}
                    <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatTableDate(lead.sentAt)}
                    </td>

                    {/* Follow Up 1 At */}
                    <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatTableDate(lead.followedUp1At)}
                    </td>

                    {/* Follow Up 2 At */}
                    <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatTableDate(lead.followedUp2At)}
                    </td>

                    {/* Replied At */}
                    <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatTableDate(lead.repliedAt)}
                    </td>

                    {/* Completed At */}
                    <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatTableDate(lead.completedAt)}
                    </td>

                    {/* Updated At */}
                    <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatTableDate(lead.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-neutral-muted)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing <strong style={{ color: 'var(--text-primary)' }}>{leads.length}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{total.toLocaleString()}</strong>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => { setLoading(true); setPage(p => Math.max(p - 1, 1)); }} disabled={page === 1 || loading} className="btn btn-secondary" style={{ padding: '6px 10px' }} title="Previous Page" aria-label="Previous Page">
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', minWidth: '80px', textAlign: 'center', fontWeight: 600 }}>
                {page} / {totalPages}
              </span>
              <button onClick={() => { setLoading(true); setPage(p => Math.min(p + 1, totalPages)); }} disabled={page === totalPages || loading} className="btn btn-secondary" style={{ padding: '6px 10px' }} title="Next Page" aria-label="Next Page">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Verification Report Modal ──────────────────────────────── */}
      <AnimatePresence>
        {verificationResults && (
          <div className="overlay flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel-raised p-6 rounded-2xl max-w-xl w-full space-y-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={20} className="text-[var(--honey-600)]" /> Email Verification Report
                </h2>
                <button 
                  onClick={() => setVerificationResults(null)} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', background: 'var(--success-bg)', borderRadius: '12px', border: '1px solid rgba(74, 109, 75, 0.15)', textAlign: 'center' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--success)' }}>
                    {verificationResults.filter(r => r.valid).length}
                  </span>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', marginTop: '2px' }}>Deliverable</div>
                </div>
                <div style={{ padding: '12px', background: 'var(--danger-bg)', borderRadius: '12px', border: '1px solid rgba(181, 78, 69, 0.15)', textAlign: 'center' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--danger)' }}>
                    {verificationResults.filter(r => !r.valid).length}
                  </span>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', marginTop: '2px' }}>Undeliverable</div>
                </div>
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                ℹ️ Undeliverable emails have been automatically set to <span style={{ fontWeight: 700, color: 'var(--danger)' }}>Bounced</span> in the database to prevent domain reputation damage.
              </p>

              {/* Detailed Scroll List */}
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '10px', background: 'var(--bg-neutral-muted)', padding: '10px' }} className="space-y-2">
                {verificationResults.map((r, i) => (
                  <div key={i} style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                    padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', fontSize: '12px'
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.email}
                    </span>
                    <span style={{ 
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', flexShrink: 0,
                      background: r.valid ? 'var(--success-bg)' : 'var(--danger-bg)',
                      color: r.valid ? 'var(--success)' : 'var(--danger)',
                      border: `1px solid ${r.valid ? 'rgba(74, 109, 75, 0.15)' : 'rgba(181, 78, 69, 0.15)'}`
                    }} title={r.reason}>
                      {r.valid ? 'Deliverable' : 'Invalid'}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                <button 
                  onClick={() => setVerificationResults(null)} 
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', fontSize: '13px' }}
                >
                  Acknowledge Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global verification loading overlay */}
      {bulkLoading && (
        <div className="overlay flex flex-col items-center justify-center p-4 z-50" style={{ background: 'rgba(250, 248, 245, 0.8)' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--border-default)', borderTopColor: 'var(--honey-500)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>Processing Request...</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Performing validation & database operations.</p>
        </div>
      )}
      {/* ── Email Enrichment Confirmation Modal ────────────────────── */}
      <Modal
        isOpen={enrichConfirm}
        onClose={() => setEnrichConfirm(false)}
        title="Enrich Emails via Pattern Probing"
        confirmLabel={enrichTarget === 'allMissing' ? 'Enrich All Missing' : 'Enrich Selected'}
        confirmVariant="primary"
        onConfirm={() => enrichTarget && runEnrichment(enrichTarget)}
        loading={bulkLoading}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {enrichTarget === 'allMissing'
              ? 'This will probe every lead in the database that has a website but no email address. Leads that already have an email are skipped.'
              : `This will probe the ${selectedEmails.length} selected lead${selectedEmails.length === 1 ? '' : 's'} for missing email addresses. Leads that already have an email are skipped.`}
          </p>
          <div style={{ padding: '10px 12px', background: 'var(--bg-neutral-muted)', border: '1px solid var(--border-subtle)', borderRadius: '10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-primary)' }}>How it works:</strong> common mailbox patterns are tried at each lead&#8217;s domain (e.g. owner@, hello@, info@, contact@, plus the business name). Each candidate is verified against the domain&#8217;s MX records with a direct SMTP handshake — no real email is ever sent. Servers that block probes get a best-effort generic mailbox suggestion.
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Discovered emails are written directly into the lead records and scored against the quality gate, so they appear in the table immediately.
          </p>
        </div>
      </Modal>

      {/* ── Email Enrichment Results Modal ─────────────────────────── */}
      <AnimatePresence>
        {enrichResults && (
          <div className="overlay flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel-raised p-6 rounded-2xl max-w-xl w-full space-y-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MailPlus size={20} className="text-[var(--honey-600)]" /> Email Enrichment Report
                </h2>
                <button onClick={() => setEnrichResults(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', background: 'var(--success-bg)', borderRadius: '12px', border: '1px solid rgba(74, 109, 75, 0.15)', textAlign: 'center' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--success)' }}>{enrichResults.found}</span>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', marginTop: '2px' }}>Emails Found</div>
                </div>
                <div style={{ padding: '12px', background: 'var(--bg-neutral-muted)', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-secondary)' }}>{enrichResults.enriched}</span>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>Leads Probed</div>
                </div>
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                ℹ️ Emails marked <span style={{ fontWeight: 700, color: 'var(--success)' }}>Verified</span> passed a direct SMTP mailbox check. Unverified suggestions come from servers that block probes — double-check before sending at scale.
              </p>

              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '10px', background: 'var(--bg-neutral-muted)', padding: '10px' }} className="space-y-2">
                {enrichResults.results.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                    padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', fontSize: '12px'
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.businessName}>
                        {r.businessName}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {r.email || '—'} · {r.domain}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', flexShrink: 0,
                      background: r.email ? (r.smtpValid ? 'var(--success-bg)' : 'var(--honey-100)') : 'var(--danger-bg)',
                      color: r.email ? (r.smtpValid ? 'var(--success)' : 'var(--honey-700)') : 'var(--danger)',
                      border: `1px solid ${r.email ? (r.smtpValid ? 'rgba(74, 109, 75, 0.15)' : 'var(--honey-500)') : 'rgba(181, 78, 69, 0.15)'}`
                    }}>
                      {r.email ? (r.smtpValid ? 'Verified' : 'Best guess') : 'Not found'}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                <button onClick={() => setEnrichResults(null)} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '13px' }}>
                  Acknowledge Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CSV Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Custom CSV Lead List"
        confirmLabel="Import Leads"
        confirmVariant="primary"
        onConfirm={handleCsvImport}
        loading={importing}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Paste or drag CSV lines below formatted as: <code style={{ fontFamily: 'var(--font-mono)' }}>email, businessName, platform, city, state</code>
          </p>
          <textarea
            id="csv-import-textarea"
            name="csvText"
            aria-label="CSV lead import text"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="alex@shopdecor.com, Shop Decor, Shopify, Austin, TX&#10;sarah@designlab.com, Design Lab, WooCommerce, Dallas, TX"
            style={{
              width: '100%',
              minHeight: '160px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-base)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              resize: 'vertical',
            }}
          />
        </div>
      </Modal>

    </div>
  );
}
