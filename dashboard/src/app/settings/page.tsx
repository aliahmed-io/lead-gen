'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, AlertCircle, ShieldAlert, Clock, Mail, CheckCircle } from 'lucide-react';
import { Settings } from '@/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    delayMinMs: 300000,
    delayMaxMs: 1200000,
    maxEmailsPerDay: 30,
    startHour: 9,
    endHour: 17,
    bounceThreshold: 5,
    followUpDays: 3,
    footerText: 'If you no longer wish to receive emails from us, please reply with "unsubscribe".',
    physicalAddress: '123 Business St, Suite 100, Austin, TX 78701',
    webhookUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch settings');
        return res.json();
      })
      .then((data) => {
        setSettings((prev) => ({
          ...prev,
          ...data,
        }));
      })
      .catch((err) => setError(err.message));
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving configurations.');
    } finally {
      setSaving(false);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: i === 0 ? '12:00 AM (Midnight)' : i === 12 ? '12:00 PM (Noon)' : i > 12 ? `${i - 12}:00 PM` : `${i}:00 AM`,
  }));

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Configuration Panel</h1>
          <p className="text-gray-400 text-sm mt-1">Configure schedule filters, bounce safety parameters, and CAN-SPAM regulatory details.</p>
        </div>
      </div>

      {error && (
        <div className="glass-panel border-rose-500/20 bg-rose-500/5 p-4 rounded-xl flex items-center gap-3 text-rose-400 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saved && (
        <div className="glass-panel border-emerald-500/20 bg-emerald-500/5 p-4 rounded-xl flex items-center gap-3 text-emerald-400 text-sm">
          <CheckCircle size={18} className="shrink-0" />
          <span>Configuration saved successfully! All updates are live.</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Section 1: Scheduler Schedule */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 rounded-2xl space-y-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock size={16} className="text-blue-400" /> Campaign Sending Schedule
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Start Sending Hour</label>
              <select
                className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                value={settings.startHour}
                onChange={(e) => setSettings({ ...settings, startHour: parseInt(e.target.value, 10) })}
              >
                {hours.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">End Sending Hour</label>
              <select
                className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                value={settings.endHour}
                onChange={(e) => setSettings({ ...settings, endHour: parseInt(e.target.value, 10) })}
              >
                {hours.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Emails will only send within these business hours in the target timezone (Central Time (CT)).</p>
        </motion.div>

        {/* Section 2: Limits & Delays */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-6 rounded-2xl space-y-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Mail size={16} className="text-purple-400" /> Mailbox Sending Speed
          </h3>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Max Outreach Emails Per Day (Per Account)</label>
            <input
              type="number"
              className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500"
              value={settings.maxEmailsPerDay}
              onChange={(e) => setSettings({ ...settings, maxEmailsPerDay: parseInt(e.target.value) || 0 })}
            />
            <p className="text-xs text-gray-500 mt-2">Enforces daily limits. Keeps sending thresholds low to prevent mailbox flags.</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Min Send Delay (ms)</label>
              <input
                type="number"
                className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500"
                value={settings.delayMinMs}
                onChange={(e) => setSettings({ ...settings, delayMinMs: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Max Send Delay (ms)</label>
              <input
                type="number"
                className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500"
                value={settings.delayMaxMs}
                onChange={(e) => setSettings({ ...settings, delayMaxMs: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
        </motion.div>

        {/* Section 3: Safety Controls */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-6 rounded-2xl space-y-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-400" /> Account Safety Controls
          </h3>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex justify-between">
              <span>Bounce Auto-Pause Threshold</span>
              <span className="text-white font-mono">{settings.bounceThreshold}%</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
              value={settings.bounceThreshold}
              onChange={(e) => setSettings({ ...settings, bounceThreshold: parseInt(e.target.value) || 5 })}
            />
            <p className="text-xs text-gray-500 mt-2">Automatically suspends a mailbox's campaign sends if the bounce rate crosses this ratio.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Follow-up Sequence Interval (Days)</label>
            <input
              type="number"
              className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500"
              value={settings.followUpDays}
              onChange={(e) => setSettings({ ...settings, followUpDays: parseInt(e.target.value) || 3 })}
            />
            <p className="text-xs text-gray-500 mt-2">Amount of time the system waits between sending outreach stages to unanswered leads.</p>
          </div>
        </motion.div>

        {/* Section 4: CAN-SPAM Footer */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel p-6 rounded-2xl space-y-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            Footer regulatory info (CAN-SPAM compliance)
          </h3>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Unsubscribe / Opt-out Text</label>
            <textarea
              className="w-full h-20 bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
              value={settings.footerText}
              onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Physical Office Address</label>
            <input
              type="text"
              className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500"
              value={settings.physicalAddress}
              onChange={(e) => setSettings({ ...settings, physicalAddress: e.target.value })}
            />
          </div>
        </motion.div>

        {/* Section 5: Webhooks */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-6 rounded-2xl space-y-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            Webhook Integrations
          </h3>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Webhook URL (Slack/Discord/Zapier)</label>
            <input
              type="url"
              className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500"
              value={(settings as any).webhookUrl || ''}
              onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
              placeholder="https://hooks.slack.com/services/..."
            />
            <p className="text-xs text-gray-500 mt-2">Get notified when a new lead is found or an email bounces.</p>
          </div>
        </motion.div>

        {/* Save Bar */}
        <div className="flex items-center justify-end gap-4 pt-4">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-blue-600/20"
          >
            <Save size={18} /> {saving ? 'Applying Settings...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
