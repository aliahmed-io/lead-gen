"use client";

import { motion } from "framer-motion";
import { Activity, Settings } from "lucide-react";

export default function LeadGen() {
  return (
    <div className="p-10 max-w-4xl mx-auto flex flex-col items-center justify-center h-full text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel p-10 rounded-2xl flex flex-col items-center">
        <Activity className="w-16 h-16 text-blue-400 mb-6" />
        <h1 className="text-3xl font-bold text-white mb-4">Lead Generation Engine</h1>
        <p className="text-gray-400 max-w-md mb-8">
          The scraper is currently configured via terminal. In the future, you can enter your search queries, target cities, and business types directly here to kick off the background Puppeteer scraping engine.
        </p>
        
        <div className="bg-black/20 border border-white/10 rounded-lg p-4 w-full flex items-center justify-between">
          <div className="text-left">
            <h3 className="text-white font-medium">Scraper Engine</h3>
            <p className="text-gray-500 text-sm">Status: Idle</p>
          </div>
          <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium">
            <Settings size={16} /> Configure Script
          </button>
        </div>
      </motion.div>
    </div>
  );
}
