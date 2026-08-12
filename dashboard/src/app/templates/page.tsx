"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Save, Plus, Trash2,
  CheckCircle, AlertTriangle, Eye, Smartphone, Monitor, HelpCircle, FileText, Info, ShieldCheck, XCircle, Activity
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { PageHeader, ErrorBanner } from '@/components/ui/page';

export default function Templates() {
  const [templates, setTemplates] = useState<Record<string, { subject: string; text: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("initial");
  const [activeVariant, setActiveVariant] = useState(""); // "" means Variant A, "B", "C", etc.
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [templateSpamReport, setTemplateSpamReport] = useState<{
    score: number;
    verdict?: string;
    summary?: string;
    rules: { name: string; rule?: string; passed: boolean; score?: number; description?: string }[];
    recommendations?: string[];
    spamAssassinRating?: string;
    ratingLabel?: string;
    [key: string]: unknown;
  } | null>(null);
  const [testingSpam, setTestingSpam] = useState(false);

  const runTemplateSpamCheck = async (subject: string, body: string) => {
    setTestingSpam(true);
    try {
      const res = await fetch('/api/spam-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      const data = await res.json();
      if (data.success) {
        setTemplateSpamReport(data.report);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTestingSpam(false);
    }
  };

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

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const confirmDeleteVariant = () => {
    if (!activeVariant) return;
    const newTemplates = { ...templates };
    delete newTemplates[`${activeTab}_${activeVariant}`];
    setTemplates(newTemplates);
    setActiveVariant("");
    setShowDeleteModal(false);
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
      '{{state}}': 'Texas',
      '{{website}}': 'aethelon.com',
      '{{email}}': 'hello@aethelon.com',
      '{{customSentence}}': 'I noticed your store is running on Shopify, which is an excellent platform.',
      '{{platform}}': 'Shopify',
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
      '{{state}}': 'Texas',
      '{{website}}': 'aethelon.com',
      '{{email}}': 'hello@aethelon.com',
      '{{customSentence}}': 'I noticed your store is running on Shopify, which is an excellent platform.',
      '{{platform}}': 'Shopify',
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
      <PageHeader
        title="Email Sequences"
        subtitle="Customize your sequence stages. Add variations for automatic A/B test rotations."
        onRefresh={saveTemplates}
        refreshLoading={saving}
      >
        <button
          onClick={saveTemplates}
          disabled={saving}
          className="btn btn-primary"
          style={{ padding: '10px 24px', fontSize: '14px', gap: '8px' }}
        >
          <Save size={16} />
          {saving ? 'Saving…' : 'Save Sequences'}
        </button>
      </PageHeader>

      {/* Notifications */}
      <AnimatePresence>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {saved && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--success-bg)', border: '1px solid rgba(74, 109, 75, 0.18)', borderRadius: '12px', fontSize: '13px', color: 'var(--success)' }}>
            <CheckCircle size={15} style={{ flexShrink: 0 }} /> Outreach sequences updated successfully!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Tabs (Sequences) */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2px', flexWrap: 'wrap' }}>
        {[
          { id: 'initial', label: 'Initial Outreach', stage: 'Stage 1' },
          { id: 'followUp1', label: 'Follow-Up 1', stage: 'Stage 2' },
          { id: 'followUp2', label: 'Follow-Up 2', stage: 'Stage 3' },
          { id: 'followUp3', label: 'Follow-Up 3', stage: 'Stage 4' },
          { id: 'breakup', label: 'Breakup Email', stage: 'Stage 5' },
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
                  onClick={() => setShowDeleteModal(true)}
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
              <button
                onClick={() => runTemplateSpamCheck(currentTemplate.subject || '', currentTemplate.text || '')}
                disabled={testingSpam}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: '1px solid var(--honey-500)',
                  background: 'var(--honey-100)',
                  color: 'var(--honey-700)',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                <ShieldCheck size={12} className={testingSpam ? "animate-spin" : ""} />
                {testingSpam ? 'Auditing Copy...' : 'Check Copy Spam Score'}
              </button>
            </div>
          </div>

          {/* Editor Container */}
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderRadius: '16px' }}>
            
            {/* Subject Line */}
            <div>
              <label htmlFor="template-subject-input" style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                Subject Line
              </label>
              <input 
                id="template-subject-input"
                name="subject"
                aria-label="Subject Line"
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
                  { name: 'Target State', tag: 'state' },
                  { name: 'Website Domain', tag: 'website' },
                  { name: 'Auto Platform Opener', tag: 'customSentence' },
                  { name: 'Email Address', tag: 'email' },
                  { name: 'Platform (Shopify etc)', tag: 'platform' },
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
                name="body"
                aria-label="Email Copy Template"
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

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={`Delete Variant ${activeVariant}`}
        confirmLabel="Delete Variant"
        confirmVariant="danger"
        onConfirm={confirmDeleteVariant}
      >
        Are you sure you want to delete Variant {activeVariant}? This action cannot be undone.
      </Modal>

      {/* Template Copy Spam Report Modal */}
      {templateSpamReport && (
        <div className="overlay flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel-raised p-6 rounded-2xl max-w-lg w-full space-y-5"
          >
            {!templateSpamReport && null}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="text-[var(--honey-600)]" size={22} />
                <div>
                  <h2 className="text-lg font-extrabold text-[var(--text-primary)] font-sans">Template Copy Spam Analysis</h2>
                  <p className="text-xs text-[var(--text-muted)] font-mono">{activeTab.toUpperCase()} {activeVariant ? `(Variant ${activeVariant})` : '(Variant A)'}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black font-mono text-[var(--success)]">{templateSpamReport.score}/100</span>
                <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Copy Quality Score</p>
              </div>
            </div>

            {/* Rating Banner */}
            <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Spam Penalty Score</span>
                <p className="text-sm font-extrabold text-[var(--text-primary)] font-mono">
                  {templateSpamReport.spamAssassinRating} / 10.0 (Lower is better)
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                templateSpamReport.ratingLabel === 'EXCELLENT' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
              }`}>
                {templateSpamReport.ratingLabel}
              </span>
            </div>

            {/* Rules Checklist */}
            <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Spam Filter Rules Checklist</h4>
              {templateSpamReport.rules.map((r, idx: number) => (
                <div key={idx} className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl flex items-start gap-3">
                  {r.passed ? (
                    <CheckCircle size={16} className="text-[var(--success)] shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={16} className="text-[var(--danger)] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">{r.rule}</span>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{r.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            {(templateSpamReport.recommendations?.length ?? 0) > 0 && (
              <div className="p-4 bg-[var(--warning-bg)] border border-[var(--warning)]/20 rounded-xl space-y-1.5">
                <h5 className="text-xs font-bold text-[var(--warning)] flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Recommended Copy Adjustments
                </h5>
                <ul className="list-disc list-inside text-xs text-[var(--text-secondary)] space-y-1 pl-1">
                  {templateSpamReport.recommendations?.map((rec, i: number) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => setTemplateSpamReport(null)} className="btn btn-primary py-2 text-xs font-bold">
                Close Report
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
