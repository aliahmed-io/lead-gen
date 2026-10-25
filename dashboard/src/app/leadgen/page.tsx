'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Square,
  Mail,
  RefreshCw,
  Plus,
  Terminal,
  Database,
  Sparkles,
  Search,
  CheckCircle2,
  Trash2,
  Cpu,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface LeadGenStatus {
  blockedReason?: string;
  jobStatus?: string;
  isRunning: boolean;
  activePid: number | null;
  processType: 'scraper' | 'email_scanner' | null;
  startedAt: number | null;
  totalQueries: number;
  completedQueriesCount: number;
  pendingQueriesCount: number;
  totalBusinesses: number;
  needingEmailScanCount: number;
  withEmailCount: number;
  sampleQueries: string[];
  recentLogs: string;
}

const PRESET_NICHES = [
  'Luxury Watch Store',
  'Artisan Leather Goods',
  'Custom Boots Boutique',
  'Fine Jewelry Store',
  'Gourmet Coffee Roaster',
  'Eyewear Optical Store',
  'Artisan Bakery Shop',
  'Specialty Tea Shop',
  'Organic Spice Shop',
  'Handcrafted Sneakers Shop',
];

const PRESET_LOCATIONS = [
  { city: 'Houston', state: 'TX' },
  { city: 'Dallas', state: 'TX' },
  { city: 'Austin', state: 'TX' },
  { city: 'Miami', state: 'FL' },
  { city: 'Orlando', state: 'FL' },
  { city: 'Tampa', state: 'FL' },
  { city: 'Charlotte', state: 'NC' },
  { city: 'Raleigh', state: 'NC' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'New York', state: 'NY' },
];

export default function LeadGenPage() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<LeadGenStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'matrix' | 'queue' | 'logs'>('matrix');

  // Matrix generator state
  const [selectedNiches, setSelectedNiches] = useState<string[]>([
    'Luxury Watch Store',
    'Artisan Leather Goods',
  ]);
  const [customNicheInput, setCustomNicheInput] = useState('');
  const [selectedLocations, setSelectedLocations] = useState<Array<{ city: string; state: string }>>([
    { city: 'Houston', state: 'TX' },
    { city: 'Dallas', state: 'TX' },
    { city: 'Miami', state: 'FL' },
  ]);
  const [customCityInput, setCustomCityInput] = useState('');
  const [customStateInput, setCustomStateInput] = useState('');

  // Custom bulk query input
  const [customQueriesText, setCustomQueriesText] = useState('');

  // Queue filter
  const [queueSearch, setQueueSearch] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/leadgen');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      showToast('Lead generation status is unavailable. Retry before starting a job.','error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void Promise.resolve().then(fetchStatus);
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStartProcess = async (type: 'scraper' | 'email_scanner') => {
    try {
      setActionInProgress(type);
      const action = type === 'scraper' ? 'start_scraper' : 'start_email_scan';
      const res = await fetch('/api/leadgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start process');
      showToast(
        type === 'scraper' ? 'Google Maps Scraper started in background.' : 'Email Backlog Scanner started.',
        'success'
      );
      await fetchStatus();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error starting process', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStopProcess = async () => {
    try {
      setActionInProgress('stop');
      const res = await fetch('/api/leadgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stop process');
      showToast('Engine process signaled to stop.', 'info');
      await fetchStatus();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error stopping process', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleGenerateMatrix = async () => {
    if (selectedNiches.length === 0 || selectedLocations.length === 0) {
      showToast('Please select at least 1 niche and 1 location.', 'error');
      return;
    }
    try {
      setActionInProgress('generate');
      const res = await fetch('/api/leadgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_queries',
          niches: selectedNiches,
          locations: selectedLocations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate queries');
      showToast(`Added ${data.addedCount} new search queries to queue!`, 'success');
      await fetchStatus();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error generating queries', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAddCustomQueries = async () => {
    const lines = customQueriesText
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (lines.length === 0) {
      showToast('Please enter at least one query.', 'error');
      return;
    }
    try {
      setActionInProgress('add_custom');
      const res = await fetch('/api/leadgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_queries',
          queries: lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add queries');
      showToast(`Added ${data.addedCount} queries to queue.`, 'success');
      setCustomQueriesText('');
      await fetchStatus();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error adding queries', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleClearCompleted = async () => {
    try {
      setActionInProgress('clear_completed');
      const res = await fetch('/api/leadgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_completed' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear completed list');
      showToast(`Cleared ${data.cleared} completed queries.`, 'info');
      await fetchStatus();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error clearing completed', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const toggleNiche = (niche: string) => {
    setSelectedNiches(prev =>
      prev.includes(niche) ? prev.filter(n => n !== niche) : [...prev, niche]
    );
  };

  const addCustomNiche = () => {
    const val = customNicheInput.trim();
    if (val && !selectedNiches.includes(val)) {
      setSelectedNiches(prev => [...prev, val]);
      setCustomNicheInput('');
    }
  };

  const toggleLocation = (loc: { city: string; state: string }) => {
    const key = `${loc.city}, ${loc.state}`;
    setSelectedLocations(prev => {
      const exists = prev.some(l => `${l.city}, ${l.state}` === key);
      return exists
        ? prev.filter(l => `${l.city}, ${l.state}` !== key)
        : [...prev, loc];
    });
  };

  const addCustomLocation = () => {
    const city = customCityInput.trim();
    const state = customStateInput.trim().toUpperCase();
    if (city && state) {
      setSelectedLocations(prev => [...prev, { city, state }]);
      setCustomCityInput('');
      setCustomStateInput('');
    }
  };

  const filteredSampleQueries = (status?.sampleQueries || []).filter(q =>
    q.toLowerCase().includes(queueSearch.toLowerCase())
  );

  const completionPercent = status && status.totalQueries > 0
    ? Math.round((status.completedQueriesCount / status.totalQueries) * 100)
    : 0;

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-serif)' }}>
              Lead Generation Command Center
            </h1>
            {status?.blockedReason&&<p role="alert" className="error-message">{status.blockedReason}</p>}
            {status?.isRunning ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: 'rgba(74, 109, 75, 0.15)',
                  color: 'var(--success)',
                  border: '1px solid rgba(74, 109, 75, 0.3)',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                Active ({status.processType === 'email_scanner' ? 'Email Scanner' : 'Maps Scraper'})
              </span>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'var(--bg-neutral-muted)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <Cpu size={12} />
                Idle
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0 0' }}>
            Discover independent local businesses and research published owner contacts. Search results alone do not prove ownership or business size; both require evidence review before outreach.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={fetchStatus}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {status?.isRunning ? (
            <button
              onClick={handleStopProcess}
              disabled={actionInProgress === 'stop'}
              className="btn btn-secondary"
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(181, 78, 69, 0.1)',
                borderColor: 'rgba(181, 78, 69, 0.3)',
                color: 'var(--danger)',
              }}
            >
              <Square size={14} />
              Stop Engine
            </button>
          ) : (
            <>
              <button
                onClick={() => handleStartProcess('scraper')}
                disabled={actionInProgress === 'scraper'}
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Play size={14} />
                Start Maps Scraper
              </button>
              <button
                onClick={() => handleStartProcess('email_scanner')}
                disabled={actionInProgress === 'email_scanner'}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Mail size={14} />
                Scan Email Backlog
              </button>
            </>
          )}
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Queue Size
            </span>
            <Database size={16} className="text-[var(--honey-500)]" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {status?.totalQueries?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {status?.pendingQueriesCount?.toLocaleString() || 0} pending execution
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Queries Completed
            </span>
            <CheckCircle2 size={16} className="text-[var(--success)]" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {status?.completedQueriesCount?.toLocaleString() || 0}
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--bg-neutral-muted)', borderRadius: '4px', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{ width: `${completionPercent}%`, height: '100%', background: 'var(--honey-500)', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {completionPercent}% of queue completed
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Businesses in DB
            </span>
            <Search size={16} className="text-[var(--honey-500)]" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {status?.totalBusinesses?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {status?.withEmailCount?.toLocaleString() || 0} with verified email
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Needs Email Search
            </span>
            <Mail size={16} className="text-[var(--danger)]" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {status?.needingEmailScanCount?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Leads with website but no email found yet
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', marginBottom: '24px', gap: '8px' }}>
        <button
          onClick={() => setActiveTab('matrix')}
          style={{
            padding: '12px 18px',
            fontSize: '13px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'matrix' ? '2px solid var(--honey-600)' : '2px solid transparent',
            color: activeTab === 'matrix' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Sparkles size={16} />
          Query Matrix Generator
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          style={{
            padding: '12px 18px',
            fontSize: '13px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'queue' ? '2px solid var(--honey-600)' : '2px solid transparent',
            color: activeTab === 'queue' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Database size={16} />
          Queue Inspector ({status?.totalQueries || 0})
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '12px 18px',
            fontSize: '13px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'logs' ? '2px solid var(--honey-600)' : '2px solid transparent',
            color: activeTab === 'logs' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Terminal size={16} />
          Live Terminal Output
        </button>
      </div>

      {/* Tab 1: Matrix Generator */}
      {activeTab === 'matrix' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
          {/* Niche & Location Selector Card */}
          <div className="card" style={{ padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              1. Select Niches & Categories
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Choose predefined business categories or add your own targeted store types.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {PRESET_NICHES.map(niche => {
                const selected = selectedNiches.includes(niche);
                return (
                  <button
                    key={niche}
                    type="button"
                    onClick={() => toggleNiche(niche)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: selected ? '1px solid var(--honey-600)' : '1px solid var(--border-default)',
                      background: selected ? 'var(--honey-100)' : 'var(--bg-surface)',
                      color: selected ? 'var(--honey-700)' : 'var(--text-secondary)',
                    }}
                  >
                    {selected ? '✓ ' : '+ '} {niche}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <input
                type="text"
                placeholder="Add custom niche (e.g. Leather Jacket Workshop)..."
                value={customNicheInput}
                onChange={e => setCustomNicheInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomNiche()}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  fontSize: '13px',
                }}
              />
              <button
                type="button"
                onClick={addCustomNiche}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '13px' }}
              >
                <Plus size={14} /> Add
              </button>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              2. Select Target Geographic Locations
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Select target cities or add new metro areas.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {PRESET_LOCATIONS.map(loc => {
                const key = `${loc.city}, ${loc.state}`;
                const selected = selectedLocations.some(l => `${l.city}, ${l.state}` === key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleLocation(loc)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: selected ? '1px solid var(--honey-600)' : '1px solid var(--border-default)',
                      background: selected ? 'var(--honey-100)' : 'var(--bg-surface)',
                      color: selected ? 'var(--honey-700)' : 'var(--text-secondary)',
                    }}
                  >
                    {selected ? '✓ ' : '+ '} {loc.city}, {loc.state}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <input
                type="text"
                placeholder="City (e.g. Phoenix)..."
                value={customCityInput}
                onChange={e => setCustomCityInput(e.target.value)}
                style={{
                  flex: 2,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  fontSize: '13px',
                }}
              />
              <input
                type="text"
                placeholder="State (e.g. AZ)..."
                maxLength={2}
                value={customStateInput}
                onChange={e => setCustomStateInput(e.target.value)}
                style={{
                  width: '90px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  fontSize: '13px',
                }}
              />
              <button
                type="button"
                onClick={addCustomLocation}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '13px' }}
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {/* Matrix Calculation Summary */}
            <div
              style={{
                background: 'var(--bg-neutral-muted)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Matrix Output: {selectedNiches.length * selectedLocations.length} Search Queries
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {selectedNiches.length} categories × {selectedLocations.length} locations
                </div>
              </div>
              <button
                onClick={handleGenerateMatrix}
                disabled={actionInProgress === 'generate'}
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={14} />
                Generate & Queue
              </button>
            </div>
          </div>

          {/* Bulk Query Ingestion Card */}
          <div className="card" style={{ padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Bulk Paste Custom Queries
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Already have a custom list of queries? Paste them below (one search query per line) to append them to the scraper backlog.
            </p>

            <textarea
              rows={12}
              placeholder={'custom jewelry store Miami FL\nleather luggage workshop Austin TX\nspecialty coffee roaster Seattle WA'}
              value={customQueriesText}
              onChange={e => setCustomQueriesText(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                fontSize: '13px',
                fontFamily: 'monospace',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />

            <button
              onClick={handleAddCustomQueries}
              disabled={actionInProgress === 'add_custom'}
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px 16px', fontSize: '13px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} />
              Append Custom Queries to Queue
            </button>
          </div>
        </motion.div>
      )}

      {/* Tab 2: Queue Inspector */}
      {activeTab === 'queue' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: '24px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Pending Query Queue
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Showing sample of active search queries configured in the system.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter queries..."
                  value={queueSearch}
                  onChange={e => setQueueSearch(e.target.value)}
                  style={{
                    padding: '8px 12px 8px 32px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    fontSize: '13px',
                    width: '200px',
                  }}
                />
              </div>

              <button
                onClick={handleClearCompleted}
                disabled={actionInProgress === 'clear_completed'}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)' }}
                title="Clears the working database query tracker to allow queries to run again"
              >
                <Trash2 size={14} />
                Reset Completed
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-default)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-neutral-muted)', borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-muted)', width: '60px' }}>#</th>
                  <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>Query Target</th>
                  <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-muted)', width: '120px' }}>Engine</th>
                </tr>
              </thead>
              <tbody>
                {filteredSampleQueries.map((queryStr, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{queryStr}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>Google Maps</td>
                  </tr>
                ))}
                {filteredSampleQueries.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No queries match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Tab 3: Live Terminal Output */}
      {activeTab === 'logs' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: '24px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Live Scraper & Email Finder Terminal
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Streaming stdout/stderr directly from active background processes.
              </p>
            </div>
            <button
              onClick={fetchStatus}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={12} /> Refresh Logs
            </button>
          </div>

          <pre
            style={{
              background: '#111317',
              color: '#4ade80',
              padding: '16px',
              borderRadius: '12px',
              fontSize: '12px',
              fontFamily: 'Consolas, Monaco, monospace',
              height: '420px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              border: '1px solid #23272f',
              boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.4)',
            }}
          >
            {status?.recentLogs || 'No active log output available. Start the scraper or email scanner to view execution logs.'}
          </pre>
        </motion.div>
      )}
    </div>
  );
}
