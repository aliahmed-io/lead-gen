'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Mail, Settings, Activity, Terminal, Shield, UserMinus } from 'lucide-react';
import { CampaignState } from '@/types';
import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [campaignState, setCampaignState] = useState<CampaignState | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchStatus = () => {
      fetch('/api/campaign')
        .then((r) => { if (r.ok) return r.json(); throw new Error(); })
        .then((d: CampaignState) => setCampaignState(d))
        .catch(() => {});
    };
    const fetchInbox = () => {
      fetch('/api/inbox')
        .then(r => { if (r.ok) return r.json(); throw new Error(); })
        .then(d => setUnreadCount(d.unreadCount || 0))
        .catch(() => {});
    };
    fetchStatus();
    fetchInbox();
    const iv = setInterval(fetchStatus, 5000);
    const iv2 = setInterval(fetchInbox, 15000);
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, []);

  const navItems = [
    { name: 'Overview',        href: '/',          icon: LayoutDashboard },
    { name: 'Inbox',           href: '/inbox',     icon: Mail, badge: unreadCount > 0 ? unreadCount : null },
    { name: 'Campaigns',       href: '/sequences', icon: Activity },
    { name: 'Lead Generation', href: '/leadgen',   icon: Activity },
    { name: 'Leads Database',  href: '/leads',     icon: Users },
    { name: 'Unsubscribes',    href: '/unsubscribes', icon: UserMinus },
    { name: 'Email Templates', href: '/templates', icon: Mail },
    { name: 'Accounts',        href: '/accounts',  icon: Shield },
    { name: 'Health Center',   href: '/health',    icon: Activity },
    { name: 'Audit Logs',      href: '/logs',      icon: Terminal },
    { name: 'Configuration',   href: '/settings',  icon: Settings },
  ];

  const status = campaignState?.status || 'running';

  return (
    <html lang="en" className={`light ${inter.variable} ${jetbrainsMono.variable} ${playfair.variable}`}>
      <head>
        <title>LeadGen.IO — Cold Outreach Platform</title>
        <meta name="description" content="Premium Cold Email Outreach Control Center" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)', fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}>

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside className="sidebar" style={{ position: 'relative' }}>
          {/* Ambient top gold line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, var(--honey-100), var(--honey-500), var(--honey-100))',
            pointerEvents: 'none',
          }} />

          {/* Brand */}
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--honey-500), var(--honey-600))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px var(--honey-glow)',
                  flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L22 7.7v8.6L12 22L2 16.3V7.7L12 2z" />
                    <path d="M12 22V12" />
                    <path d="M12 12L2 7.7" />
                    <path d="M12 12L22 7.7" />
                    <path d="M2 7.7L12 12L22 7.7" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'var(--font-serif)' }}>LeadGen.IO</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.02em', marginTop: '2px' }}>Cold Outreach Platform</div>
                </div>
              </div>

              {/* Live status pill */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '3px 8px', borderRadius: '99px',
                background: status === 'running' ? 'var(--success-bg)' : status === 'paused' ? 'var(--warning-bg)' : 'var(--danger-bg)',
                border: `1px solid ${status === 'running' ? 'rgba(74, 109, 75, 0.15)' : status === 'paused' ? 'rgba(198, 120, 43, 0.15)' : 'rgba(179, 78, 70, 0.15)'}`,
              }}>
                <span
                  className="status-dot"
                  style={{
                    background: status === 'running' ? 'var(--success)' : status === 'paused' ? 'var(--warning)' : 'var(--danger)',
                    animation: status === 'running' ? 'pulse-glow 2s ease-in-out infinite' : undefined,
                  }}
                />
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em', color: status === 'running' ? 'var(--success)' : status === 'paused' ? 'var(--warning)' : 'var(--danger)' }}>
                  {status}
                </span>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
            <div className="section-label" style={{ padding: '12px 12px 6px' }}>Navigation</div>
            {navItems.map((item) => {
              const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <item.icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.5 }} />
                    <span>{item.name}</span>
                  </div>
                  {item.badge ? (
                    <span style={{
                      background: 'var(--honey-500)',
                      color: 'white',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '99px',
                      lineHeight: 1
                    }}>
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>v1.2.0</span>
              <span style={{ fontSize: '10px', color: 'var(--text-disabled)', letterSpacing: '-0.01em', marginLeft: 'auto' }}>Aethelon Labs</span>
            </div>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────────────── */}
        <main style={{
          flex: 1,
          height: '100%',
          overflowY: 'auto',
          background: 'var(--bg-base)',
          position: 'relative',
        }}>
          {children}
        </main>
      </body>
    </html>
  );
}
