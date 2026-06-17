'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, AlertCircle, ShieldAlert, Clock, Mail, CheckCircle,
  Zap, Link2, RefreshCw,
} from 'lucide-react';

const Section = ({
  icon, label, accent, children,
}: {
  icon: React.ReactNode; label: string; accent: string; children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
    style={{
      background: 'var(--bg-surface)', borderRadius: '16px',
      border: '1px solid var(--border-default)',
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(44, 34, 25, 0.01)',
    }}
  >
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)',
      background: `linear-gradient(90deg, ${accent}0b 0%, transparent 60%)`,
      borderTop: `2px solid ${accent}`,
    }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '8px',
        background: 'var(--bg-neutral-muted)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent,
      }}>
        {icon}
      </div>
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-inter)' }}>
        {label}
      </span>
    </div>
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {children}
    </div>
  </motion.div>
);

const Field = ({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="section-label" style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>{label}</label>
    {children}
    {hint && <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>{hint}</p>}
  </div>
);

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    delayMinMs: 240000,
    delayMaxMs: 336000,
    maxEmailsPerDay: 100,
    startHour: 9,
    endHour: 17,
    bounceThreshold: 3,
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
      .then(r => { if (!r.ok) throw new Error('Failed to load settings'); return r.json(); })
      .then(d => setSettings(prev => ({ ...prev, ...d })))
      .catch(e => setError((e as Error).message));
  }, []);

  const saveSettings = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      if (!res.ok) throw new Error('Failed to save settings');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) { setError((e as Error).message); } finally { setSaving(false); }
  };

  const hours = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: i === 0 ? '12:00 AM' : i === 12 ? '12:00 PM' : i > 12 ? `${i - 12}:00 PM` : `${i}:00 AM`,
  }));

  const msToMin = (ms: number) => Math.round(ms / 60000);
  const bounceColor = settings.bounceThreshold <= 3 ? 'var(--success)' : settings.bounceThreshold <= 6 ? 'var(--warning)' : 'var(--danger)';



  return (
    <div style={{ padding: '32px', maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '100px', fontFamily: 'var(--font-inter)' }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: '8px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>Configuration</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Schedule, safety thresholds, compliance, and integrations.
        </p>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid rgba(181, 78, 69, 0.18)', borderRadius: '12px', fontSize: '13px', color: 'var(--danger)' }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
          </motion.div>
        )}
        {saved && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--success-bg)', border: '1px solid rgba(74, 109, 75, 0.18)', borderRadius: '12px', fontSize: '13px', color: 'var(--success)' }}>
            <CheckCircle size={15} style={{ flexShrink: 0 }} /> Settings saved — all changes are live.
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Section 1: Schedule ─────────────────────────────────── */}
      <Section icon={<Clock size={14} />} label="Sending Schedule" accent="var(--honey-500)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Field label="Start Hour" hint="When sending begins (Central Time)">
            <select className="input" value={settings.startHour}
              onChange={e => setSettings({ ...settings, startHour: parseInt(e.target.value, 10) })}>
              {hours.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </Field>
          <Field label="End Hour" hint="When sending stops for the day">
            <select className="input" value={settings.endHour}
              onChange={e => setSettings({ ...settings, endHour: parseInt(e.target.value, 10) })}>
              {hours.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'var(--honey-50)', borderRadius: '10px', border: '1px solid var(--border-default)', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <Clock size={14} style={{ color: 'var(--honey-600)', flexShrink: 0 }} />
          <span>
            Emails send only Mon–Fri between{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{hours.find(h => h.value === settings.startHour)?.label}</strong> and{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{hours.find(h => h.value === settings.endHour)?.label}</strong>{' '}
            Central Time (CT). Holidays auto-pause.
          </span>
        </div>
      </Section>

      {/* ── Section 2: Sending Speed ────────────────────────────── */}
      <Section icon={<Mail size={14} />} label="Sending Speed" accent="#8B7355">
        <Field label="Max Emails Per Day (per account)"
          hint="Each SMTP account is throttled independently. Warmup mode overrides this.">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input type="number" min={1} max={500} className="input" style={{ maxWidth: '120px' }}
              value={settings.maxEmailsPerDay}
              onChange={e => setSettings({ ...settings, maxEmailsPerDay: parseInt(e.target.value) || 0 })} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>emails / account / day</span>
          </div>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Field label="Min Delay Between Sends"
            hint={`≈ ${msToMin(settings.delayMinMs)} min`}>
            <input type="number" min={0} className="input"
              value={settings.delayMinMs}
              onChange={e => setSettings({ ...settings, delayMinMs: parseInt(e.target.value) || 0 })} />
          </Field>
          <Field label="Max Delay Between Sends"
            hint={`≈ ${msToMin(settings.delayMaxMs)} min`}>
            <input type="number" min={0} className="input"
              value={settings.delayMaxMs}
              onChange={e => setSettings({ ...settings, delayMaxMs: parseInt(e.target.value) || 0 })} />
          </Field>
        </div>
      </Section>

      {/* ── Section 3: Safety ───────────────────────────────────── */}
      <Section icon={<ShieldAlert size={14} />} label="Account Safety Controls" accent="var(--danger)">
        <Field label={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Bounce Auto-Pause Threshold</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: bounceColor, fontWeight: 700 }}>
              {settings.bounceThreshold}%
            </span>
          </div>
        } hint="Mailboxes exceeding this bounce rate are automatically suspended.">
          <div style={{ position: 'relative', marginTop: '4px' }}>
            <input type="range" min={1} max={10} value={settings.bounceThreshold}
              onChange={e => setSettings({ ...settings, bounceThreshold: parseInt(e.target.value) })}
              style={{ width: '100%', height: '4px', borderRadius: '99px', appearance: 'none', cursor: 'pointer', accentColor: bounceColor, background: `linear-gradient(90deg, ${bounceColor} ${settings.bounceThreshold * 10}%, var(--border-default) ${settings.bounceThreshold * 10}%)` }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--success)', fontWeight: 600 }}>1% Safe</span>
              <span style={{ fontSize: '10px', color: 'var(--warning)', fontWeight: 600 }}>5% Warning</span>
              <span style={{ fontSize: '10px', color: 'var(--danger)', fontWeight: 600 }}>10% Critical</span>
            </div>
          </div>
        </Field>

        <Field label="Follow-up Wait Interval (Days)"
          hint="Days between initial email and first follow-up, and between follow-ups.">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input type="number" min={1} max={30} className="input" style={{ maxWidth: '100px' }}
              value={settings.followUpDays}
              onChange={e => setSettings({ ...settings, followUpDays: parseInt(e.target.value) || 3 })} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>days between stages</span>
          </div>
        </Field>
      </Section>

      {/* ── Section 4: CAN-SPAM ─────────────────────────────────── */}
      <Section icon={<RefreshCw size={14} />} label="CAN-SPAM Compliance" accent="var(--warning)">
        <Field label="Unsubscribe Footer Text"
          hint="Appended to every outbound email. Required by CAN-SPAM.">
          <textarea className="input" rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }}
            value={settings.footerText}
            onChange={e => setSettings({ ...settings, footerText: e.target.value })} />
        </Field>
        <Field label="Physical Office Address"
          hint="Required by law. Displayed in the email footer.">
          <input type="text" className="input"
            value={settings.physicalAddress}
            onChange={e => setSettings({ ...settings, physicalAddress: e.target.value })} />
        </Field>
      </Section>

      {/* ── Section 5: Webhooks ─────────────────────────────────── */}
      <Section icon={<Link2 size={14} />} label="Webhook Integrations" accent="var(--success)">
        <Field label="Webhook URL"
          hint="POST notification is sent to this URL when a lead replies with interest. Works with Slack, Discord, Zapier, n8n.">
          <input type="url" className="input" placeholder="https://hooks.slack.com/services/..."
            value={settings.webhookUrl || ''}
            onChange={e => setSettings({ ...settings, webhookUrl: e.target.value })} />
        </Field>
        {settings.webhookUrl && (
          <div style={{ padding: '10px 14px', background: 'var(--success-bg)', borderRadius: '8px', border: '1px solid rgba(74, 109, 75, 0.15)', fontSize: '12px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <Zap size={12} /> Webhook active — interested leads will trigger a notification.
          </div>
        )}
      </Section>

      {/* ── Sticky Save Bar ─────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 'var(--sidebar-w)', right: 0, zIndex: 40,
        padding: '16px 32px',
        background: 'linear-gradient(0deg, var(--bg-base) 60%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      }}>
        <button onClick={saveSettings} disabled={saving} className="btn btn-primary" style={{ padding: '10px 24px', fontSize: '14px' }}>
          <Save size={15} />
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
