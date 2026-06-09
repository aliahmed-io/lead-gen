"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Save } from "lucide-react";

export default function Settings() {
  const [settings, setSettings] = useState({ delayMinMs: 300000, delayMaxMs: 1200000, maxEmailsPerDay: 30 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch settings');
        return res.json();
      })
      .then(data => setSettings(data))
      .catch(err => console.error(err));
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        throw new Error('Failed to save settings');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Configuration</h1>
        <p className="text-gray-400">Manage your daily limits and sending delays to protect your accounts.</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 rounded-2xl space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Max Emails Per Day (Per Account)</label>
          <input 
            type="number" 
            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
            value={settings.maxEmailsPerDay}
            onChange={e => setSettings({...settings, maxEmailsPerDay: parseInt(e.target.value) || 0})}
          />
          <p className="text-xs text-gray-500 mt-2">To prevent spam detection, keep this under 40.</p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Minimum Delay (ms)</label>
            <input 
              type="number" 
              className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
              value={settings.delayMinMs}
              onChange={e => setSettings({...settings, delayMinMs: parseInt(e.target.value) || 0})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Maximum Delay (ms)</label>
            <input 
              type="number" 
              className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
              value={settings.delayMaxMs}
              onChange={e => setSettings({...settings, delayMaxMs: parseInt(e.target.value) || 0})}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <button 
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Save size={18} /> {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
