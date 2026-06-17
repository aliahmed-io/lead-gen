"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save, Plus, Activity, Mail, Eye, Info, AlertTriangle,
  Trash2, FileText, CheckCircle, HelpCircle, Smartphone, Monitor
} from "lucide-react";

export default function Templates() {
  const [templates, setTemplates] = useState<Record<string, { subject: string; text: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("initial");
  const [activeVariant, setActiveVariant] = useState(""); // "" means Variant A, "B", "C", etc.
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

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
    setSaved(false);
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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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

  const getVariantsForTab = (tab: string) => {
    const keys = Object.keys(templates).filter(k => k === tab || k.startsWith(`${tab}_`));
    const variants = keys.map(k => {
      if (k === tab) return { key: "", label: "Variant A (Base)" };
      const v = k.split('_')[1];
      return { key: v, label: `Variant ${v}` };
    });
    if (variants.length === 0) variants.push({ key: "", label: "Variant A (Base)" });
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

  const deleteVariant = () => {
    if (!activeVariant) return; // Cannot delete base variant
    const confirmDelete = window.confirm(`Are you sure you want to delete Variant ${activeVariant}?`);
    if (!confirmDelete) return;

    const newTemplates = { ...templates };
    delete newTemplates[`${activeTab}_${activeVariant}`];
    setTemplates(newTemplates);
    setActiveVariant(""); // Reset to base
  };

  const insertVariable = (variableName: string) => {
    const textarea = document.getElementById('template-body') as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = currentTemplate.text || '';
    const before = currentText.substring(0, start);
    const after = currentText.substring(end, currentText.length);
    const newText = before + `{{${variableName}}}` + after;
    
    updateField('text', newText);

    // Focus and position cursor
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + variableName.length + 4; // length of {{variableName}}
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  // Live preview parser
  const renderPreview = (text: string) => {
    if (!text) return <span style={{ color: 'var(--text-disabled)', fontStyle: 'italic' }}>Start typing your outreach copy...</span>;
    
    const elements: React.ReactNode[] = [];
    const parts = text.split(/(\{\{[a-zA-Z0-9_]+\}\})/g);
    
    const mockVals: Record<string, string> = {
      '{{companyName}}': 'Aethelon Labs',
      '{{city}}': 'Austin',
      '{{website}}': 'aethelon.com',
      '{{email}}': 'hello@aethelon.com',
    };

    parts.forEach((part, i) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        const value = mockVals[part] || part;
        elements.push(
          <span key={i} style={{ 
            background: 'var(--honey-100)', 
            color: 'var(--honey-700)', 
            padding: '2px 6px', 
            borderRadius: '4px', 
            fontSize: '11px', 
            fontWeight: 700, 
            fontFamily: 'var(--font-mono)',
            border: '1px solid var(--border-default)',
            margin: '0 2px',
          }} title={`Merged field: ${part}`}>
            {value}
          </span>
        );
      } else {
        elements.push(<span key={i}>{part}</span>);
      }
    });

    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{elements}</div>;
  };

  const renderSubjectPreview = (text: string) => {
    if (!text) return '(No Subject)';
    const mockVals: Record<string, string> = {
      '{{companyName}}': 'Aethelon Labs',
      '{{city}}': 'Austin',
      '{{website}}': 'aethelon.com',
      '{{email}}': 'hello@aethelon.com',
    };
    return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, name) => mockVals[`{{${name}}}`] || `{{${name}}}`);
  };

  // Stats
  const charCount = currentTemplate.text?.length || 0;
  const wordCount = currentTemplate.text ? currentTemplate.text.trim().split(/\s+/).filter(Boolean).length : 0;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200)); // ~200 WPM

  // Verification tips
  const getQualityTips = () => {
    const tips: { type: 'success' | 'warning' | 'info'; text: string }[] = [];
    const text = currentTemplate.text || '';
    const subject = currentTemplate.subject || '';

    // Personalization check
    if (!text.includes('{{companyName}}') && !subject.includes('{{companyName}}')) {
      tips.push({ type: 'warning', text: 'Personalizing with {{companyName}} increases response rate by ~26%.' });
    } else {
      tips.push({ type: 'success', text: 'Lead personalization tag {{companyName}} is active.' });
    }

    // Length check
    if (wordCount > 150) {
      tips.push({ type: 'warning', text: 'Email is a bit wordy. Try keeping it under 120 words for maximum mobile readability.' });
    } else if (wordCount > 0 && wordCount < 60) {
      tips.push({ type: 'info', text: 'Sleek, short copy. Ideal for quick scanning.' });
    }

    // Spam words check
    const spamWords = ['free', 'guarantee', 'buy now', 'click here', 'urgent', 'make money', 'risk-free', 'winner'];
    const foundSpam = spamWords.filter(w => text.toLowerCase().includes(w) || subject.toLowerCase().includes(w));
    if (foundSpam.length > 0) {
      tips.push({ type: 'warning', text: `Avoid spam trigger terms: "${foundSpam.join(', ')}" to protect inbox deliverability.` });
    }

    return tips;
  };

  const tips = getQualityTips();

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-inter)' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>Email Sequences</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Customize your sequence stages. Add variations for automatic A/B test rotations.
          </p>
        </div>
        <button 
          onClick={saveTemplates} 
          disabled={saving} 
          className="btn btn-primary"
          style={{ padding: '10px 24px', fontSize: '14px', gap: '8px' }}
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save Sequences"}
        </button>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid rgba(181, 78, 69, 0.18)', borderRadius: '12px', fontSize: '13px', color: 'var(--danger)' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {error}
          </motion.div>
        )}
        {saved && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--success-bg)', border: '1px solid rgba(74, 109, 75, 0.18)', borderRadius: '12px', fontSize: '13px', color: 'var(--success)' }}>
            <CheckCircle size={15} style={{ flexShrink: 0 }} /> Outreach sequences updated successfully!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Tabs (Sequences) */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2px' }}>
        {[
          { id: 'initial', label: 'Initial Outreach', stage: 'Stage 1' },
          { id: 'followUp1', label: 'Follow-Up 1', stage: 'Stage 2' },
          { id: 'followUp2', label: 'Follow-Up 2', stage: 'Stage 3' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setActiveVariant(""); }}
            style={{
              padding: '10px 20px',
              fontWeight: 700,
              fontSize: '13px',
              transition: 'all 0.15s',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--honey-500)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--honey-600)' : 'var(--text-secondary)',
            }}
          >
            <div style={{ fontSize: '10px', color: activeTab === tab.id ? 'var(--honey-500)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 800, marginBottom: '2px' }}>
              {tab.stage}
            </div>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Two Column Layout: Editor & Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px', alignItems: 'stretch' }}>
        
        {/* Left: Template Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Variants Selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span className="section-label" style={{ fontSize: '10px', marginRight: '6px' }}>AB ROTATION</span>
              {variants.map(v => (
                <button
                  key={v.key}
                  onClick={() => setActiveVariant(v.key)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: '1px solid',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    background: activeVariant === v.key ? 'var(--honey-500)' : 'var(--bg-elevated)',
                    borderColor: activeVariant === v.key ? 'var(--honey-600)' : 'var(--border-default)',
                    color: activeVariant === v.key ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {activeVariant && (
                <button
                  onClick={deleteVariant}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: '1px solid rgba(181, 78, 69, 0.15)',
                    background: 'var(--danger-bg)',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                  title="Delete this variant"
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
              <button
                onClick={addVariant}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                <Plus size={12} /> Add Variant
              </button>
            </div>
          </div>

          {/* Editor Container */}
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderRadius: '16px' }}>
            
            {/* Subject Line */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                Subject Line
              </label>
              <input 
                type="text" 
                className="input w-full"
                style={{ padding: '12px', fontSize: '14px', fontWeight: 600 }}
                placeholder="e.g. Quick question regarding {{companyName}}"
                value={currentTemplate.subject || ''}
                onChange={e => updateField('subject', e.target.value)}
              />
            </div>

            {/* Variable Injector Bar */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span className="section-label" style={{ fontSize: '9px' }}>INJECT PERSONALIZATION TAG</span>
                <span title="Inserts personalization tag at cursor position" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <HelpCircle size={10} style={{ color: 'var(--text-disabled)' }} />
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  { name: 'Company Name', tag: 'companyName' },
                  { name: 'Target City', tag: 'city' },
                  { name: 'Website Domain', tag: 'website' },
                  { name: 'Email Address', tag: 'email' }
                ].map(item => (
                  <button
                    key={item.tag}
                    onClick={() => insertVariable(item.tag)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-neutral-muted)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--honey-300)';
                      e.currentTarget.style.color = 'var(--honey-700)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    + {item.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor Textarea */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                Email Copy
              </label>
              <textarea 
                id="template-body"
                className="input w-full"
                rows={12}
                style={{ 
                  fontFamily: 'var(--font-mono), monospace', 
                  fontSize: '13px', 
                  lineHeight: '1.6', 
                  padding: '16px',
                  resize: 'vertical'
                }}
                placeholder={`Hi {{companyName}},\n\nI came across your website ({{website}}) based in {{city}} and...`}
                value={currentTemplate.text || ''}
                onChange={e => updateField('text', e.target.value)}
              />
            </div>

            {/* Character & Word Metrics */}
            <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={12} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{wordCount}</strong> words
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{charCount}</strong> characters
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Estimated Read Time: <strong style={{ color: 'var(--text-primary)' }}>{readTimeMin} min</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Preview & Copy Analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Live Email Inbox Mock Client */}
          <div className="card" style={{ padding: '0', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header bar mimicking mail client */}
            <div style={{ background: 'var(--bg-neutral-muted)', borderBottom: '1px solid var(--border-subtle)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff5f56' }} />
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27c93f' }} />
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', background: 'var(--bg-base)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <button 
                    onClick={() => setPreviewMode("desktop")}
                    style={{ padding: '4px 8px', borderRadius: '4px', background: previewMode === "desktop" ? 'var(--bg-elevated)' : 'transparent', color: previewMode === "desktop" ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Monitor size={12} />
                  </button>
                  <button 
                    onClick={() => setPreviewMode("mobile")}
                    style={{ padding: '4px 8px', borderRadius: '4px', background: previewMode === "mobile" ? 'var(--bg-elevated)' : 'transparent', color: previewMode === "mobile" ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Smartphone size={12} />
                  </button>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Eye size={11} /> PREVIEW
                </span>
              </div>
            </div>

            {/* Email Metadata */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 700, width: '64px', color: 'var(--text-muted)' }}>From:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>sender@outreach.leadgen.io</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 700, width: '64px', color: 'var(--text-muted)' }}>To:</span>
                <span style={{ background: 'var(--honey-50)', border: '1px solid var(--border-default)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Mail size={10} style={{ color: 'var(--honey-600)' }} /> contact@aethelon.com
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span style={{ fontWeight: 700, width: '64px', color: 'var(--text-muted)' }}>Subject:</span>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                  {renderSubjectPreview(currentTemplate.subject)}
                </span>
              </div>
            </div>

            {/* Email Render Frame */}
            <div style={{ 
              padding: previewMode === 'mobile' ? '16px' : '24px', 
              minHeight: '260px', 
              background: 'white', 
              color: '#2C2C2C', 
              fontSize: previewMode === 'mobile' ? '14px' : '13px', 
              overflowY: 'auto',
              width: previewMode === 'mobile' ? '320px' : '100%',
              margin: previewMode === 'mobile' ? '0 auto' : '0',
              borderLeft: previewMode === 'mobile' ? '1px solid var(--border-subtle)' : 'none',
              borderRight: previewMode === 'mobile' ? '1px solid var(--border-subtle)' : 'none',
              boxShadow: previewMode === 'mobile' ? '0 0 20px rgba(0,0,0,0.05)' : 'none'
            }}>
              {renderPreview(currentTemplate.text)}
            </div>
          </div>

          {/* Copy Analysis Optimization Guidelines */}
          <div className="card" style={{ padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <Activity size={14} style={{ color: 'var(--honey-600)' }} />
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Copy Performance Analysis
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tips.map((tip, idx) => {
                const color = tip.type === 'success' ? 'var(--success)' : tip.type === 'warning' ? 'var(--warning)' : 'var(--honey-600)';
                const bg = tip.type === 'success' ? 'var(--success-bg)' : tip.type === 'warning' ? 'var(--warning-bg)' : 'var(--honey-50)';
                const border = tip.type === 'success' ? 'rgba(74, 109, 75, 0.15)' : tip.type === 'warning' ? 'rgba(198, 120, 43, 0.15)' : 'var(--border-default)';
                
                return (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    gap: '8px', 
                    padding: '10px 12px', 
                    borderRadius: '10px', 
                    background: bg, 
                    border: `1px solid ${border}`,
                    fontSize: '11.5px',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                  }}>
                    {tip.type === 'success' ? (
                      <CheckCircle size={13} style={{ color, flexShrink: 0, marginTop: '1px' }} />
                    ) : tip.type === 'warning' ? (
                      <AlertTriangle size={13} style={{ color, flexShrink: 0, marginTop: '1px' }} />
                    ) : (
                      <Info size={13} style={{ color, flexShrink: 0, marginTop: '1px' }} />
                    )}
                    <span>{tip.text}</span>
                  </div>
                );
              })}
              {tips.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', padding: '10px' }}>
                  Write something to run copy optimizations.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
