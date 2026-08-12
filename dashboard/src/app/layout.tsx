'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { LayoutDashboard, Users, Mail, Settings, Activity, Terminal, Shield, UserMinus, Zap, ShieldCheck, Menu, X } from 'lucide-react';
import { CampaignState } from '@/types';
import { ToastProvider } from '@/components/ui/toast';
// Self-hosted fonts (previously next/font/google — build-time Google fetch was
// unreliable, so the subset files are checked into public/fonts/).
import localFont from 'next/font/local';

const inter = localFont({
  src: '../../public/fonts/inter-latin.woff2',
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});

const jetbrainsMono = localFont({
  src: [
    { path: '../../public/fonts/jetbrains-mono-regular.ttf', weight: '400' },
    { path: '../../public/fonts/jetbrains-mono-bold.ttf', weight: '700' },
  ],
  variable: '--font-mono',
  display: 'swap',
  preload: true,
});

const playfair = localFont({
  src: [
    { path: '../../public/fonts/playfair-regular.ttf', weight: '400' },
    { path: '../../public/fonts/playfair-bold.ttf', weight: '700' },
  ],
  variable: '--font-serif',
  display: 'swap',
  preload: true,
});

const DESKTOP_BREAK = 1024;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [campaignState, setCampaignState] = useState<CampaignState | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = () => {
      const desktop = window.innerWidth >= DESKTOP_BREAK;
      setIsDesktop(desktop);
      if (desktop) setSidebarOpen(false);
    };
    mq();
    window.addEventListener('resize', mq);
    return () => window.removeEventListener('resize', mq);
  }, []);

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
  const statusColor = status === 'running' ? 'var(--success)' : status === 'paused' ? 'var(--warning)' : 'var(--danger)';

  /* ── shared sidebar content (renders the same nav on desktop and mobile) ── */
  const renderNav = useCallback((onNavigate?: () => void) => (
    <>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '2px',
        background: 'linear-gradient(90deg, var(--honey-100), var(--honey-500), var(--honey-100))',
        pointerEvents: 'none',
      }} />

      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
              background: 'var(--honey-500)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--honey-glow)',
            }}>
              <Zap size={15} color="white" fill="white" />
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
                LeadGen.IO
              </span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--honey-600)', textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: '6px', padding: '1px 5px', borderRadius: '4px', background: 'var(--honey-100)' }}>
                PRO
              </span>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={onNavigate}
              aria-label="Close menu"
              style={{ padding: '8px', borderRadius: '10px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
            background: statusColor,
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
              onClick={onNavigate}
              className={`nav-link ${isActive ? 'active' : ''}`}
              style={onNavigate ? { minHeight: '44px', fontSize: '14px' } : undefined}
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
    </>
  ), [pathname, status, statusColor, navItems]);

  /* ── mobile top bar ─────────────────────────────────────────────── */
  const mobileTopBar = (
    <div
      className="mobile-topbar"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
        height: '56px',
        background: 'var(--bg-neutral-muted)',
        borderBottom: '1px solid var(--border-subtle)',
        display: isDesktop ? 'none' : 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '10px',
      }}
    >
      <button
        onClick={() => setSidebarOpen(v => !v)}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        style={{ padding: '8px', borderRadius: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-subtle)' }}
      >
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '7px', flexShrink: 0,
          background: 'var(--honey-500)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={13} color="white" fill="white" />
        </div>
        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', whiteSpace: 'nowrap' }}>
          LeadGen.IO
        </span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: statusColor,
          animation: status === 'running' ? 'pulse-glow 2s ease-in-out infinite' : undefined,
        }} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        {unreadCount > 0 && (
          <span className="badge badge-amber">{unreadCount}</span>
        )}
      </div>
    </div>
  );

  return (
    <html lang="en" className={`light ${inter.variable} ${jetbrainsMono.variable} ${playfair.variable}`}>
      <head>
        <title>LeadGen.IO — Cold Outreach Platform</title>
        <meta name="description" content="Premium Cold Email Outreach Control Center" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#FAF8F5" />
      </head>
      <body style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)', fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}>
        <ToastProvider>
          {mobileTopBar}

          {/* ── Sidebar (desktop: always visible, mobile: slide-in drawer) ── */}
          <aside
            className="sidebar"
            aria-hidden={isDesktop ? undefined : !sidebarOpen}
            style={{
              position: isDesktop ? 'relative' : 'fixed',
              top: isDesktop ? 0 : 0,
              left: 0,
              bottom: 0,
              zIndex: isDesktop ? undefined : 60,
              width: 'var(--sidebar-w)',
              background: 'var(--bg-neutral-muted)',
              borderRight: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              flexShrink: 0,
              transform: isDesktop ? 'none' : (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'),
              transition: 'transform 0.25s ease',
              overflow: 'hidden',
            }}
          >
            {renderNav(isDesktop ? undefined : () => setSidebarOpen(false))}
          </aside>

          {/* ── mobile backdrop ──────────────────────────────────── */}
          {!isDesktop && sidebarOpen && (
            <div
              className="overlay"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* ── Main ─────────────────────────────────────────────── */}
          <main style={{
            flex: 1,
            height: '100%',
            overflowY: 'auto',
            background: 'var(--bg-base)',
            position: 'relative',
            paddingTop: isDesktop ? 0 : '56px',
            minWidth: 0,
          }}>
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
