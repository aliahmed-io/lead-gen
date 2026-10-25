'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail,
  Send,
  RefreshCw,
  Search,
  MapPin,
  ExternalLink,
  Sparkles,
  FileText,
  Briefcase,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import type { EnrichedThread } from '@/lib/inbox-types';
import {useDirtyGuard} from '@/lib/use-dirty-guard';

type FilterTab = 'all' | 'unread' | 'meeting' | 'interested';

export default function InboxPage() {
  const { showToast } = useToast();
  const [threads, setThreads] = useState<EnrichedThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<EnrichedThread | null>(null);
  const [replyText, setReplyText] = useState('');
  const selectedEmailRef=useRef<string|null>(null);
  const draftsRef=useRef<Record<string,string>>({});
  const requestIdsRef=useRef<Record<string,string>>({});
  useDirtyGuard(Boolean(replyText.trim()));
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/inbox');
      if (!res.ok)throw new Error('Inbox request failed');
      if (res.ok) {
        const data = await res.json();
        const loaded: EnrichedThread[] = data.threads || [];
        setThreads(loaded);
        if (selectedEmailRef.current) {
          const updated = loaded.find(t => t.leadEmail === selectedEmailRef.current);
          if (updated) setSelectedThread(updated);
        }
      }
    } catch {
      showToast('Inbox refresh failed. Your last loaded messages are still shown.','error');
    }
  }, [showToast]);

  useEffect(() => {
    void Promise.resolve().then(fetchThreads);
    const iv = setInterval(fetchThreads, 15000);
    return () => clearInterval(iv);
  }, [fetchThreads]);

  const handleSyncInbox = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync inbox');
      const stats = data.stats || {};
      showToast(
        `Sync complete: ${stats.totalReplies || 0} new replies, ${stats.totalBounces || 0} bounces.`,
        'success'
      );
      await fetchThreads();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error syncing inbox', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const selectThread = async (thread: EnrichedThread) => {
    if(selectedEmailRef.current)draftsRef.current[selectedEmailRef.current]=replyText;
    selectedEmailRef.current=thread.leadEmail;
    setReplyText(draftsRef.current[thread.leadEmail]||'');
    setSelectedThread(thread);
    if (thread.unread) {
      setThreads(prev =>
        prev.map(t => (t.leadEmail === thread.leadEmail ? { ...t, unread: false } : t))
      );
      try {
        await fetch('/api/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadEmail: thread.leadEmail }),
        });
      } catch (e) {
        console.error('Failed to mark read', e);
      }
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth' });
    }
  }, [selectedThread?.messages]);

  const handleSend = async () => {
    if (!selectedThread || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadEmail: selectedThread.leadEmail,
          replyText,
          requestId:requestIdsRef.current[selectedThread.leadEmail] ||= crypto.randomUUID(),
          subject: selectedThread.messages[0]?.subject,
        }),
      });
      const result=await res.json();
      if (res.ok && result.success) {
        draftsRef.current[selectedThread.leadEmail]='';
        delete requestIdsRef.current[selectedThread.leadEmail];
        setReplyText('');
        showToast('Reply sent successfully!', 'success');
        await fetchThreads();
      } else {
        showToast('Reply was not sent: '+(result.error||result.skipped||'Check account readiness'),'error');
      }
    } catch (e: unknown) {
      showToast('Error: ' + (e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const insertProposalDraft = (draftText: string) => {
    setReplyText(draftText);
    showToast('Proposal template loaded into editor.', 'info');
  };

  const insertCaseStudy = () => {
    if (!selectedThread?.portfolioMatch) return;
    const snippet = selectedThread.portfolioMatch.recommendationSnippet;
    setReplyText(prev => (prev ? `${prev}\n\n${snippet}` : snippet));
    showToast('Relevant portfolio case study appended.', 'info');
  };

  // Filter threads
  const filteredThreads = threads.filter(thread => {
    const matchesSearch =
      thread.leadEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (thread.leadInfo?.businessName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (thread.messages[0]?.subject || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeFilter === 'unread') return thread.unread;
    if (activeFilter === 'meeting') return thread.sentiment === 'meeting_requested';
    if (activeFilter === 'interested') return thread.sentiment === 'interested';
    return true;
  });

  return (
    <div className="page-container inbox-layout" style={{ padding: 0, height: 'calc(100vh - 72px)', display: 'flex' }}>
      {/* Sidebar List */}
      <div
        style={{
          width: '380px',
          borderRight: '1px solid var(--border-default)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Header & Sync */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
              Unified Inbox
            </h1>
            <button
              onClick={handleSyncInbox}
              disabled={syncing}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search leads, subjects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-neutral-muted)',
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'unread', 'meeting', 'interested'] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: activeFilter === tab ? 'var(--honey-100)' : 'transparent',
                  color: activeFilter === tab ? 'var(--honey-700)' : 'var(--text-muted)',
                }}
              >
                {tab === 'all' && 'All'}
                {tab === 'unread' && 'Unread'}
                {tab === 'meeting' && 'Meeting'}
                {tab === 'interested' && 'Interested'}
              </button>
            ))}
          </div>
        </div>

        {/* Thread Item List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredThreads.length === 0 ? (
            <div style={{ padding: '32px 20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>
              No messages found.
            </div>
          ) : (
            filteredThreads.map(thread => {
              const lastMsg = thread.messages[thread.messages.length - 1];
              const isSelected = selectedThread?.leadEmail === thread.leadEmail;
              return (
                <div
                  key={thread.leadEmail}
                  onClick={() => selectThread(thread)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void selectThread(thread);}}}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--bg-neutral-muted)' : 'transparent',
                    display: 'flex',
                    gap: '10px',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontWeight: thread.unread ? 700 : 600, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {thread.leadInfo?.businessName || thread.leadEmail}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(thread.lastMessageAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    {thread.leadInfo?.businessName && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {thread.leadEmail}
                      </div>
                    )}

                    <div style={{ fontSize: '12px', color: thread.unread ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lastMsg?.text?.substring(0, 75) || ''}
                    </div>

                    {/* Sentiment Pill */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                      {thread.sentiment === 'meeting_requested' && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(74, 109, 75, 0.15)', color: 'var(--success)' }}>
                          Meeting Call
                        </span>
                      )}
                      {thread.sentiment === 'interested' && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--honey-100)', color: 'var(--honey-700)' }}>
                          Interested
                        </span>
                      )}
                      {thread.leadInfo?.platform && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-neutral-muted)', color: 'var(--text-muted)' }}>
                          {thread.leadInfo.platform}
                        </span>
                      )}
                    </div>
                  </div>

                  {thread.unread && (
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--honey-600)', marginTop: '6px', flexShrink: 0 }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Conversation & Proposal Pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
        {selectedThread ? (
          <>
            {/* Thread Header with Business Intelligence */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {selectedThread.leadInfo?.businessName || selectedThread.leadEmail}
                  </h2>
                  {selectedThread.leadInfo?.platform && (
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'var(--honey-100)', color: 'var(--honey-700)', fontWeight: 600 }}>
                      {selectedThread.leadInfo.platform}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={12} /> {selectedThread.leadEmail}
                  </span>
                  {selectedThread.leadInfo?.city && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} /> {selectedThread.leadInfo.city}, {selectedThread.leadInfo.state}
                    </span>
                  )}
                  {selectedThread.leadInfo?.website && (
                    <a
                      href={selectedThread.leadInfo.website.startsWith('http') ? selectedThread.leadInfo.website : `https://${selectedThread.leadInfo.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--honey-600)', textDecoration: 'none' }}
                    >
                      <ExternalLink size={12} /> Visit Site
                    </a>
                  )}
                  <span>Via Account #{selectedThread.accountId}</span>
                </div>
              </div>
            </div>

            {/* Messages Stream */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedThread.messages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '75%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: msg.direction === 'outbound' ? 'var(--obsidian)' : 'var(--bg-surface)',
                      color: msg.direction === 'outbound' ? 'white' : 'var(--text-primary)',
                      border: msg.direction === 'outbound' ? 'none' : '1px solid var(--border-default)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: msg.direction === 'outbound' ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', marginBottom: '4px' }}>
                      {new Date(msg.receivedAt).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* 1-Click Proposal & Intelligence Insertion Bar */}
            <div style={{ padding: '10px 20px', background: 'var(--bg-neutral-muted)', borderTop: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={12} className="text-[var(--honey-600)]" /> 1-Click Proposals:
              </span>

              {selectedThread.proposals?.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => insertProposalDraft(p.draftText)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title={p.deliverables.join(', ')}
                >
                  <FileText size={11} /> {p.title}
                </button>
              ))}

              {selectedThread.portfolioMatch && (
                <button
                  type="button"
                  onClick={insertCaseStudy}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--honey-700)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Briefcase size={11} /> Append Case Study
                </button>
              )}
            </div>

            {/* Composer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <textarea
                  id="inbox-reply-textarea"
                  name="replyText"
                  aria-label="Type your reply"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply or click a proposal template above..."
                  style={{
                    flex: 1,
                    minHeight: '85px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSend();
                    }
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !replyText.trim()}
                  className="btn btn-primary"
                  style={{ height: '42px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
                >
                  <Send size={15} />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'right' }}>
                Press ⌘ + Enter or Ctrl + Enter to send
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Mail size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <div style={{ fontSize: '16px', fontWeight: 600 }}>Select a lead conversation to view</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Replies from leads across all accounts will appear here automatically.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
