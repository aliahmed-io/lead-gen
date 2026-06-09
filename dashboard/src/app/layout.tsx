import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { LayoutDashboard, Users, Mail, Settings, Activity, Terminal } from 'lucide-react';

export const metadata: Metadata = {
  title: 'LeadGen Dashboard',
  description: 'Premium Lead Generation Control Center',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="flex h-screen overflow-hidden antialiased text-gray-100 bg-[#09090b]">
        {/* Sidebar */}
        <nav className="w-64 glass-panel border-r border-white/5 flex flex-col h-full shrink-0">
          <div className="p-6">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              LeadGen.IO
            </h1>
          </div>
          <div className="flex-1 px-4 space-y-2 mt-4">
            <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-gray-300 hover:text-white">
              <LayoutDashboard size={18} /> Overview
            </Link>
            <Link href="/leadgen" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-gray-300 hover:text-white">
              <Activity size={18} /> Lead Generation
            </Link>
            <Link href="/leads" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-gray-300 hover:text-white">
              <Users size={18} /> Leads Database
            </Link>
            <Link href="/templates" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-gray-300 hover:text-white">
              <Mail size={18} /> Email Templates
            </Link>
            <Link href="/logs" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-gray-300 hover:text-white">
              <Terminal size={18} /> Audit Logs
            </Link>
            <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-gray-300 hover:text-white">
              <Settings size={18} /> Configuration
            </Link>
          </div>
        </nav>
        
        {/* Main Content */}
        <main className="flex-1 h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-[#09090b] to-[#09090b]">
          {children}
        </main>
      </body>
    </html>
  );
}
