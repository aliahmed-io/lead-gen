"use client";

import { useEffect, useState } from "react";
import { Search, AlertCircle, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

type LogEntry = {
  id: number;
  level: string;
  timestamp: string;
  message: string;
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); // Auto-refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const filtered = logs.filter(l => {
    if (errorsOnly && l.level !== 'ERROR') return false;
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-10 max-w-7xl mx-auto flex flex-col h-full font-sans">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2 font-serif">Audit Logs</h1>
          <p className="text-[var(--text-secondary)] text-sm">Live feed from the background Master Scheduler.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setErrorsOnly(!errorsOnly)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors border cursor-pointer ${
              errorsOnly 
                ? 'bg-[var(--danger-bg)] text-[var(--danger)] border-red-500/15' 
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--honey-50)]'
            }`}
          >
            <AlertCircle className="w-4 h-4 inline-block mr-2 -mt-0.5" />
            Errors Only
          </button>
          
          <button 
            onClick={fetchLogs}
            className="btn btn-secondary py-2"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search logs..." 
              className="input pl-10 pr-4 py-2 w-full md:w-64 outline-none focus:border-[var(--honey-500)]"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
        className="card rounded-2xl flex-1 flex flex-col min-h-0 bg-[var(--bg-neutral-muted)] border border-[var(--border-default)] overflow-hidden shadow-sm"
      >
        <div className="overflow-y-auto flex-1 p-6 font-mono text-xs leading-relaxed space-y-1.5">
          {loading && logs.length === 0 && (
            <div className="text-center text-[var(--text-muted)] mt-10">Loading logs...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-[var(--text-muted)] mt-10">No logs found matching your criteria.</div>
          )}
          {filtered.map((log) => (
            <div key={log.id} className="flex gap-4 border-b border-[var(--border-subtle)] pb-1.5">
              <span className="text-[var(--text-muted)] shrink-0 whitespace-nowrap font-bold">
                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
              </span>
              <span className={`shrink-0 font-bold ${log.level === 'ERROR' ? 'text-[var(--danger)]' : 'text-[var(--honey-600)]'}`}>
                [{log.level}]
              </span>
              <span className={log.level === 'ERROR' ? 'text-[var(--danger)] font-medium' : 'text-[var(--text-primary)]'}>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
