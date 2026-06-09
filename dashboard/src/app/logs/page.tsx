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
    <div className="p-10 max-w-7xl mx-auto flex flex-col h-full">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Audit Logs</h1>
          <p className="text-gray-400">Live feed from the background Master Scheduler.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setErrorsOnly(!errorsOnly)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              errorsOnly 
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' 
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
            }`}
          >
            <AlertCircle className="w-4 h-4 inline-block mr-2 -mt-0.5" />
            Errors Only
          </button>
          
          <button 
            onClick={fetchLogs}
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search logs..." 
              className="glass-panel pl-10 pr-4 py-2 rounded-lg text-white placeholder-gray-500 w-full md:w-64 outline-none focus:border-blue-500 transition-colors"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
        className="glass-panel rounded-2xl flex-1 flex flex-col min-h-0 bg-black/40 border border-white/10 overflow-hidden"
      >
        <div className="overflow-y-auto flex-1 p-6 font-mono text-sm leading-relaxed space-y-1">
          {loading && logs.length === 0 && (
            <div className="text-center text-gray-500 mt-10">Loading logs...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-gray-500 mt-10">No logs found matching your criteria.</div>
          )}
          {filtered.map((log) => (
            <div key={log.id} className="flex gap-4 border-b border-white/5 pb-1">
              <span className="text-gray-500 shrink-0 whitespace-nowrap">
                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
              </span>
              <span className={`shrink-0 font-bold ${log.level === 'ERROR' ? 'text-rose-400' : 'text-blue-400'}`}>
                [{log.level}]
              </span>
              <span className={log.level === 'ERROR' ? 'text-rose-200' : 'text-gray-300'}>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
