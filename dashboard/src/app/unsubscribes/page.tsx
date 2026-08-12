'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserMinus, Trash2, Search, Plus, AlertCircle, CheckCircle, ShieldAlert
} from 'lucide-react';
import { PageHeader, ErrorBanner } from '@/components/ui/page';

export default function UnsubscribesPage() {
  const [unsubscribed, setUnsubscribed] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchUnsubscribes = async () => {
    try {
      const res = await fetch('/api/unsubscribes');
      if (!res.ok) throw new Error('Failed to load unsubscribe list');
      const data = await res.json();
      setUnsubscribed(data.unsubscribed || []);
      setError(null);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchUnsubscribes();
    });
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/unsubscribes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unsubscribe email');

      setSuccess(`Successfully unsubscribed ${data.email}`);
      setNewEmail('');
      await fetchUnsubscribes();

      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (email: string) => {
    setDeletingEmail(email);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/unsubscribes?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove email from list');

      setSuccess(`Removed ${data.email} from unsubscribe list`);
      await fetchUnsubscribes();

      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setDeletingEmail(null);
    }
  };

  const filtered = unsubscribed.filter((email) =>
    email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '32px', maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '100px', fontFamily: 'var(--font-inter)' }}>
      
      {/* ── Header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="Unsubscribe Management"
        subtitle="Global opt-out list. Outbound email outreach checker will automatically block sending to these addresses."
        onRefresh={fetchUnsubscribes}
        refreshLoading={loading}
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* ── Quick Stats & Add form ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', alignItems: 'stretch' }}>
        
        {/* Stat Card */}
        <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '130px' }}>
          <span className="section-label" style={{ fontSize: '10px' }}>TOTAL BLOCKED EMAILS</span>
          <span style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0 2px' }}>
            {loading ? '...' : unsubscribed.length}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Active CAN-SPAM compliance filters
          </span>
        </div>

        {/* Add Unsubscribe Form */}
        <div className="card" style={{ padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span className="section-label" style={{ fontSize: '10px', marginBottom: '12px', display: 'block' }}>MANUALLY ADD OPT-OUT</span>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                id="unsub-email-input"
                name="email"
                aria-label="Email address to unsubscribe"
                type="email"
                placeholder="name@domain.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={submitting}
                className="input"
                required
              />
            </div>
            <button type="submit" disabled={submitting || !newEmail.trim()} className="btn btn-primary" style={{ gap: '6px' }}>
              <Plus size={15} />
              {submitting ? 'Adding...' : 'Block Email'}
            </button>
          </form>
        </div>

      </div>

      {/* ── Alerts ─────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid rgba(181, 78, 69, 0.18)', borderRadius: '12px', fontSize: '13px', color: 'var(--danger)' }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--success-bg)', border: '1px solid rgba(74, 109, 75, 0.18)', borderRadius: '12px', fontSize: '13px', color: 'var(--success)' }}>
            <CheckCircle size={15} style={{ flexShrink: 0 }} /> {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search Bar ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search opt-out list..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          style={{ paddingLeft: '36px' }}
        />
      </div>

      {/* ── Block List Table ───────────────────────────────────────── */}
      <div className="card" style={{ overflow: 'hidden', borderRadius: '16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-neutral-muted)' }}>
                <th className="section-label" style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)' }}>Blocked Email Address</th>
                <th className="section-label" style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', width: '160px' }}>Filter Status</th>
                <th className="section-label" style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', width: '100px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} style={{ padding: '48px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', width: '20px', height: '20px', borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--honey-500)', animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Loading opt-out registry...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '48px', textAlign: 'center' }}>
                    <UserMinus size={32} style={{ color: 'var(--text-disabled)', margin: '0 auto 12px', display: 'block' }} />
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {search ? 'No matches found in opt-out list.' : 'Compliance registry is empty.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((email) => (
                  <tr key={email} className="table-row" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '14px 16px', fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {email}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className="badge badge-red" style={{ gap: '4px' }}>
                        <ShieldAlert size={11} /> Blocked
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleRemove(email)}
                        disabled={deletingEmail !== null}
                        className="btn btn-danger"
                        style={{ padding: '6px 12px', fontSize: '11px', gap: '4px' }}
                        title="Remove from unsubscribe list"
                      >
                        <Trash2 size={12} />
                        {deletingEmail === email ? 'Removing...' : 'Re-enable'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
}
