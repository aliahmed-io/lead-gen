"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, Users, CheckCircle, XCircle, TrendingUp } from "lucide-react";
import { Stats } from "@/types";

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch stats');
        }
        return res.json();
      })
      .then((data: Stats) => setStats(data))
      .catch((err) => setError(err.message));
  }, []);

  const cards = [
    { title: "Total Leads", value: stats?.total || 0, icon: Users, color: "text-blue-400" },
    { title: "Total Sent", value: stats?.sent || 0, icon: Send, color: "text-purple-400" },
    { title: "Interested", value: stats?.replied || 0, icon: CheckCircle, color: "text-emerald-400" },
    { title: "Bounced", value: stats?.bounced || 0, icon: XCircle, color: "text-rose-400" },
    { title: "Conversion Rate", value: `${stats?.conversion || 0}%`, icon: TrendingUp, color: "text-amber-400" },
  ];

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Campaign Overview</h1>
        <p className="text-gray-400">Monitor your automated outreach metrics in real-time.</p>
        {error && <p className="text-rose-400 mt-2 text-sm">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {cards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-panel p-6 rounded-2xl flex flex-col items-center justify-center text-center hover:bg-white/[0.05] transition-colors"
          >
            <card.icon className={`w-8 h-8 mb-4 ${card.color}`} />
            <h3 className="text-gray-400 text-sm font-medium mb-1">{card.title}</h3>
            <p className="text-3xl font-bold text-white">
              {stats === null ? "-" : card.value}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
