'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Mail, Settings, Activity, Terminal, Shield } from 'lucide-react';
import { CampaignState } from '@/types';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [campaignState, setCampaignState] = useState<CampaignState | null>(null);

  useEffect(() => {
    const fetchStatus = () => {
      fetch('/api/campaign')
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error();
        })
        .then((data: CampaignState) => setCampaignState(data))
        .catch(() => {});
    };

    fetchStatus();
    // Poll status every 5 seconds to keep sidebar status dot in sync
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'Lead Generation', href: '/leadgen', icon: Activity },
    { name: 'Leads Database', href: '/leads', icon: Users },
    { name: 'Email Templates', href: '/templates', icon: Mail },
    { name: 'Accounts', href: '/accounts', icon: Shield },
    { name: 'Audit Logs', href: '/logs', icon: Terminal },
    { name: 'Configuration', href: '/settings', icon: Settings },
  ];

  const status = campaignState?.status || 'running';
  const dotColor =
    status === 'running'
      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse'
      : status === 'paused'
      ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
      : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';

  return (
    <html lang="en" className="dark">
      <head>
        <title>LeadGen.IO Dashboard</title>
        <meta name="description" content="Premium Cold Email Outreach Control Center" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="flex h-screen overflow-hidden antialiased text-gray-100 bg-[#09090b]">
        {/* Sidebar */}
        <nav className="w-66 glass-panel border-r border-white/5 flex flex-col h-full shrink-0">
          {/* Sidebar Header */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              LeadGen.IO
            </h1>
            <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span className="text-[10px] font-semibold text-gray-400 capitalize tracking-wider">
                {status}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 px-4 space-y-1.5 mt-6 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 border-l-2 ${
                    isActive
                      ? 'border-blue-500 bg-blue-500/10 text-white font-medium shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                      : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <item.icon size={18} className={isActive ? 'text-blue-400' : 'text-gray-400'} />
                  <span className="text-sm">{item.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-white/5 text-center">
            <p className="text-[11px] text-gray-500 font-mono">v1.1.0 • Stable</p>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/10 via-[#09090b] to-[#09090b]">
          {children}
        </main>
      </body>
    </html>
  );
}
