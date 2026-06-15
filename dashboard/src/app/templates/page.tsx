"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Save, Plus } from "lucide-react";

export default function Templates() {
  const [templates, setTemplates] = useState<Record<string, { subject: string, text: string }>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("initial");
  const [activeVariant, setActiveVariant] = useState(""); // "" means base (e.g. "initial"), "B" means "initial_B"
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/templates')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch templates');
        }
        return res.json();
      })
      .then(data => setTemplates(data))
      .catch(err => setError(err.message));
  }, []);

  const saveTemplates = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templates)
      });
      if (!res.ok) {
        throw new Error('Failed to save templates');
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    }
    setSaving(false);
  };

  const currentTemplateKey = activeVariant ? `${activeTab}_${activeVariant}` : activeTab;
  const currentTemplate = templates[currentTemplateKey] || { subject: '', text: '' };

  const updateField = (field: 'subject' | 'text', value: string) => {
    setTemplates({
      ...templates,
      [currentTemplateKey]: {
        ...currentTemplate,
        [field]: value
      }
    });
  };

  // Find variants for the active tab
  const getVariantsForTab = (tab: string) => {
    const keys = Object.keys(templates).filter(k => k === tab || k.startsWith(`${tab}_`));
    const variants = keys.map(k => {
      if (k === tab) return { key: "", label: "Variant A" };
      const v = k.split('_')[1];
      return { key: v, label: `Variant ${v}` };
    });
    // Always ensure at least base variant is available to select
    if (variants.length === 0) variants.push({ key: "", label: "Variant A" });
    return variants.sort((a, b) => a.key.localeCompare(b.key));
  };

  const variants = getVariantsForTab(activeTab);

  const addVariant = () => {
    const nextChar = String.fromCharCode(65 + variants.length); // B, C, D...
    setTemplates({
      ...templates,
      [`${activeTab}_${nextChar}`]: { subject: '', text: '' }
    });
    setActiveVariant(nextChar);
  };

  return (
    <div className="p-10 max-w-5xl mx-auto flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Email Templates</h1>
        <p className="text-gray-400">Edit the outreach sequences. Use {"{{companyName}}"} or {"{{city}}"} to inject data dynamically.</p>
        {error && <p className="text-rose-400 mt-2 text-sm">{error}</p>}
      </div>

      <div className="flex gap-4 mb-6 border-b border-white/10 pb-2">
        {['initial', 'followUp1', 'followUp2'].map(tab => (
          <button 
            key={tab}
            onClick={() => { setActiveTab(tab); setActiveVariant(""); }}
            className={`px-4 py-2 font-medium transition-colors ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {tab === 'initial' ? 'Initial Outreach' : tab === 'followUp1' ? 'Follow-Up 1' : 'Follow-Up 2'}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {variants.map(v => (
          <button
            key={v.key}
            onClick={() => setActiveVariant(v.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeVariant === v.key ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            {v.label}
          </button>
        ))}
        <button
          onClick={addVariant}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-colors flex items-center gap-1"
        >
          <Plus size={14} /> Add Variant
        </button>
      </div>

      <motion.div 
        key={currentTemplateKey}
        initial={{ opacity: 0, x: -10 }} 
        animate={{ opacity: 1, x: 0 }} 
        className="glass-panel p-6 rounded-2xl flex-1 flex flex-col min-h-[500px] space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Subject Line</label>
          <input 
            type="text" 
            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 font-medium"
            value={currentTemplate.subject}
            onChange={e => updateField('subject', e.target.value)}
          />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <label className="block text-sm font-medium text-gray-300 mb-2">Email Body</label>
          <textarea 
            className="w-full flex-1 bg-black/20 border border-white/10 rounded-lg p-4 text-white focus:outline-none focus:border-blue-500 resize-none font-mono text-sm leading-relaxed"
            value={currentTemplate.text}
            onChange={e => updateField('text', e.target.value)}
          />
        </div>
        <div className="pt-4 border-t border-white/10 flex justify-end">
          <button 
            onClick={saveTemplates}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Save size={18} /> {saving ? "Saving..." : "Save Templates"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
