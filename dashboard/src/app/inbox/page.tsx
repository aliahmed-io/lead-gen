'use client';

import { useState, useEffect, useRef } from 'react';
import { Mail, Send } from 'lucide-react';

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
        alert('Failed to send: ' + data.error);
      }
    } catch (e: unknown) {
      alert('Error: ' + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-container" style={{ padding: 0, height: '100%', display: 'flex' }}>
      
      {/* Sidebar */}
      <div style={{ width: '350px', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h1 className="text-xl font-bold font-serif">Inbox</h1>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {threads.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>
              No messages found.
            </div>
          ) : (
            threads.map(thread => {
              const lastMsg = thread.messages[thread.messages.length - 1];
              return (
                <div 
                  key={thread.leadEmail}
                  onClick={() => selectThread(thread)}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: selectedThread?.leadEmail === thread.leadEmail ? 'var(--bg-active)' : 'transparent',
                    display: 'flex',
                    gap: '12px'
                  }}
                >
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
                  {thread.unread && (
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--honey-500)', marginTop: '6px' }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
        {selectedThread ? (
          <>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedThread.leadEmail}</h2>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Via Account #{selectedThread.accountId}
                </div>
              </div>
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
