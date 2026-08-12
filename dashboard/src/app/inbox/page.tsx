'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Mail, Send, Inbox as InboxIcon, RefreshCw, Trash2, CheckCheck, Archive } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  subject: string;
  text: string;
  html: string;
  receivedAt: number;
}

interface Thread {
  leadEmail: string;
  accountId: number;
  messages: Message[];
  lastMessageAt: number;
  unread: boolean;
}

export default function InboxPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Bulk selection states
  const [selectedThreads, setSelectedThreads] = useState<string[]>([]);
  const [bulkWorking, setBulkWorking] = useState(false);

  const fetchThreads = async () => {
    try {
      const res = await fetch('/api/inbox');
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchThreads();
    });
    const iv = setInterval(fetchThreads, 15000);
    return () => clearInterval(iv);
  }, []);

  const unreadCount = threads.filter(t => t.unread).length;

  const clearSelection = () => setSelectedThreads([]);
  const toggleThreadSelection = (leadEmail: string) => {
    setSelectedThreads(prev => prev.includes(leadEmail) ? prev.filter(e => e !== leadEmail) : [...prev, leadEmail]);
  };

  const bulkMarkRead = async () => {
    if (!selectedThreads.length) return;
    setBulkWorking(true);
    try {
      const res = await fetch('/api/inbox/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', leadEmails: selectedThreads }),
      });
      if (!res.ok) throw new Error('Bulk mark read failed');
      setThreads(prev => prev.map(t => selectedThreads.includes(t.leadEmail) ? { ...t, unread: false } : t));
      showToast(`Marked ${selectedThreads.length} thread${selectedThreads.length === 1 ? '' : 's'} as read.`, 'success');
      clearSelection();
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setBulkWorking(false);
    }
  };

  const bulkDelete = async () => {
    if (!selectedThreads.length) return;
    setBulkWorking(true);
    try {
      const res = await fetch('/api/inbox/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', leadEmails: selectedThreads }),
      });
      if (!res.ok) throw new Error('Bulk delete failed');
      setThreads(prev => prev.filter(t => !selectedThreads.includes(t.leadEmail)));
      if (selectedThread && selectedThreads.includes(selectedThread.leadEmail)) {
        setSelectedThread(null);
      }
      showToast(`Deleted ${selectedThreads.length} thread${selectedThreads.length === 1 ? '' : 's'}.`, 'success');
      clearSelection();
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setBulkWorking(false);
    }
  };

  const selectThread = async (thread: Thread) => {
    setSelectedThread(thread);
    if (thread.unread) {
      // Optimistic UI update
      setThreads(prev => prev.map(t => t.leadEmail === thread.leadEmail ? { ...t, unread: false } : t));
      try {
        await fetch('/api/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadEmail: thread.leadEmail })
        });
      } catch (e) {
        console.error('Failed to mark read', e);
      }
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedThread?.messages]);

  const handleSend = async () => {
    if (!selectedThread || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadEmail: selectedThread.leadEmail,
          replyText,
          subject: selectedThread.messages[0]?.subject,
        }),
      });
      if (res.ok) {
        setReplyText('');
        await fetchThreads();
        
        // Update selected thread to show new message
        const latestThread = threads.find(t => t.leadEmail === selectedThread.leadEmail);
        if (latestThread) setSelectedThread(latestThread);
      } else {
        const data = await res.json();
        showToast(`Failed to send: ${data.error ?? 'unknown error'}`, 'error');
      }
    } catch (e: unknown) {
      showToast(`Error: ${(e as Error).message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-container" style={{ padding: 0, height: '100%', display: 'flex' }}>
      
      {/* Sidebar */}
      <div style={{ width: '350px', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <InboxIcon size={17} style={{ color: 'var(--honey-500)' }} /> Inbox
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {unreadCount > 0 && <span className="badge badge-amber">{unreadCount} new</span>}
            <button
              onClick={fetchThreads}
              className="btn btn-secondary"
              style={{ padding: '6px' }}
              aria-label="Refresh inbox"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedThreads.length > 0 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--honey-50)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="badge badge-amber">{selectedThreads.length}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>selected</span>
            <button
              onClick={bulkMarkRead}
              disabled={bulkWorking}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '11px', gap: '5px', display: 'inline-flex', alignItems: 'center' }}
            >
              <CheckCheck size={12} /> Mark All Read
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkWorking}
              className="btn"
              style={{ padding: '6px 12px', fontSize: '11px', gap: '5px', background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(181, 78, 69, 0.15)', display: 'inline-flex', alignItems: 'center' }}
            >
              <Trash2 size={12} /> Delete
            </button>
                        <button
              onClick={clearSelection}
              disabled={bulkWorking}
              style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px', fontWeight: 600 }}
            >
              Cancel
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {threads.length === 0 ? (
            <div style={{ padding: '40px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>
              <Trash2 size={24} style={{ opacity: 0.25, marginBottom: '10px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>No messages found</div>
              <div style={{ fontSize: '11px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>Replies appear here after leads respond.</div>
            </div>
          ) : (
            threads.map(thread => {
              const lastMsg = thread.messages[thread.messages.length - 1];
              const isSelectedThread = selectedThreads.includes(thread.leadEmail);
              return (
                <div
                  key={thread.leadEmail}
                  onClick={() => selectThread(thread)}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: isSelectedThread ? 'var(--honey-50)' : (selectedThread?.leadEmail === thread.leadEmail ? 'var(--bg-active)' : 'transparent'),
                    display: 'flex',
                    gap: '12px'
                  }}
                >
                  {/* Thread checkbox for bulk actions */}
                  <div
                    onClick={e => { e.stopPropagation(); toggleThreadSelection(thread.leadEmail); }}
                    style={{ display: 'flex', alignItems: 'center', paddingTop: '2px' }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelectedThread}
                      onChange={() => {}}
                      style={{ cursor: 'pointer', accentColor: 'var(--honey-500)', width: '14px', height: '14px' }}
                      aria-label={`Select thread from ${thread.leadEmail}`}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontWeight: thread.unread ? 600 : 500, fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {thread.leadEmail}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(thread.lastMessageAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: thread.unread ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lastMsg?.text?.substring(0, 80) || ''}
                    </div>
                  </div>
                  {/* Mark single thread as read */}
                  {!thread.unread ? null : (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setThreads(prev => prev.map(t => t.leadEmail === thread.leadEmail ? { ...t, unread: false } : t));
                        fetch('/api/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadEmail: thread.leadEmail }) }).catch(() => {});
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                      title="Mark as read"
                      aria-label="Mark thread as read"
                    >
                      <Archive size={13} />
                    </button>
                  )}
                  {thread.unread && (
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--honey-500)', marginTop: '6px', boxShadow: '0 0 6px var(--honey-glow)' }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="inbox-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
        {selectedThread ? (
          <>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedThread.leadEmail}</h2>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  Via Account #{selectedThread.accountId} · {selectedThread.messages.length} message{selectedThread.messages.length === 1 ? '' : 's'}
                </div>
              </div>
              <Link href={`/leads?search=${encodeURIComponent(selectedThread.leadEmail)}`} style={{ fontSize: '11px', color: 'var(--honey-600)', textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}>
                Open in Leads →
              </Link>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedThread.messages.map(msg => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: msg.direction === 'outbound' ? 'var(--obsidian)' : 'var(--bg-card)',
                    color: msg.direction === 'outbound' ? 'white' : 'var(--text-primary)',
                    border: msg.direction === 'outbound' ? 'none' : '1px solid var(--border-subtle)',
                    boxShadow: msg.direction === 'inbound' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                  }}>
                    <div style={{ fontSize: '11px', color: msg.direction === 'outbound' ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', marginBottom: '4px' }}>
                      {new Date(msg.receivedAt).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            
            <div style={{ padding: '20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <textarea 
                  id="inbox-reply-textarea"
                  name="replyText"
                  aria-label="Type your email reply"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  style={{
                    flex: 1,
                    minHeight: '80px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    resize: 'none',
                    fontFamily: 'inherit'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSend();
                    }
                  }}
                />
                <button 
                  onClick={handleSend}
                  disabled={sending || !replyText.trim()}
                  className="btn-primary"
                  style={{ height: '40px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Send size={16} />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right' }}>
                Press ⌘ + Enter to send
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Mail size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <div style={{ fontSize: '16px', fontWeight: 500 }}>Select a thread to view</div>
          </div>
        )}
      </div>

    </div>
  );
}
