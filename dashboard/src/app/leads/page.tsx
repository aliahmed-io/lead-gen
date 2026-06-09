"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { motion } from "framer-motion";
import { LeadRecord } from "@/types";

export default function Leads() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetch('/api/leads')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch leads');
        }
        return res.json();
      })
      .then((data: { records: LeadRecord[] }) => setLeads(data.records || []))
      .catch(err => setError(err.message));
  }, []);

  const filtered = leads.filter(l => 
    l.email?.toLowerCase().includes(search.toLowerCase()) || 
    l.businessName?.toLowerCase().includes(search.toLowerCase()) ||
    l.status?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Leads Database</h1>
          <p className="text-gray-400">View and filter all contacts in your active campaign.</p>
          {error && <p className="text-rose-400 mt-2 text-sm">{error}</p>}
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search leads..." 
            className="glass-panel pl-10 pr-4 py-2 rounded-lg text-white placeholder-gray-500 w-full md:w-80 outline-none focus:border-blue-500 transition-colors"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
        className="glass-panel rounded-2xl overflow-hidden"
      >
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#09090b]/80 backdrop-blur-md z-10">
              <tr className="border-b border-white/5">
                <th className="px-6 py-4 text-sm font-medium text-gray-400">Business Name</th>
                <th className="px-6 py-4 text-sm font-medium text-gray-400">Email</th>
                <th className="px-6 py-4 text-sm font-medium text-gray-400">Platform</th>
                <th className="px-6 py-4 text-sm font-medium text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((lead, i) => (
                <tr key={lead.email || i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-gray-200 font-medium">{lead.businessName || 'Unknown'}</td>
                  <td className="px-6 py-4 text-gray-400">{lead.email}</td>
                  <td className="px-6 py-4 text-gray-400">{lead.platform || 'Other'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium 
                      ${lead.status === 'interested' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                        String(lead.status).includes('followed_up') ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                        lead.status === 'sent' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        lead.status === 'bounced' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                        'bg-gray-500/10 text-gray-400 border border-gray-500/20'}`}>
                      {lead.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-10 text-center text-gray-500">No leads found.</div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
