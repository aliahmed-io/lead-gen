'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Mail, Settings, Activity, Terminal, Shield, UserMinus, Zap, ShieldCheck } from 'lucide-react';
import { CampaignState } from '@/types';
import { ToastProvider } from '@/components/ui/toast';
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
  const [unreadCount, setUnreadCount] = useState<number>(0);

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
    { name: 'Deliverability',  href: '/deliverability', icon: ShieldCheck },
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
        <ToastProvider>
          {/* ── Sidebar ─────────────────────────────────────────────── */}
          <aside className="sidebar" style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, var(--honey-100), var(--honey-500), var(--honey-100))',
              pointerEvents: 'none',
            }} />

            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'var(--honey-500)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'var(--honey-glow)',
                  }}>
                    <Zap size={15} color="white" fill="white" />
                  </div>
                  <div>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
                      LeadGen.IO
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--honey-600)', textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: '6px', padding: '1px 5px', borderRadius: '4px', background: 'var(--honey-100)' }}>
                      PRO
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: status === 'running' ? 'var(--success)' : status === 'paused' ? 'var(--warning)' : 'var(--danger)',
                  animation: status === 'running' ? 'pulse-glow 2s ease-in-out infinite' : undefined,
                }} />
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  System: {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              </div>
            </div>

            <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
              <div className="section-label" style={{ padding: '4px 10px 8px', fontSize: '10px' }}>Navigation</div>
              {navItems.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={16} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{item.name}</span>
                    {item.badge && (
                      <span className="badge badge-amber">{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </nav>

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
        </ToastProvider>
      </body>
    </html>
  );
}
