'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page';

interface SequenceStep {
  step: number;
  templateKey: string;
  delayDays: number;
}

export default function SequencesPage() {
  const [sequence, setSequence] = useState<SequenceStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, unknown>) => {
        if (data.sequence && Array.isArray(data.sequence)) {
          setSequence(data.sequence as SequenceStep[]);
        } else {
          // Default sequence fallback
          setSequence([
            { step: 0, templateKey: 'initial', delayDays: 0 }
          ]);
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Re-index steps to ensure they are sequential
      const reindexed = sequence.map((s, i) => ({ ...s, step: i }));
      
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: reindexed })
      });
      if (res.ok) {
        setSequence(reindexed);
        showToast('Sequence saved successfully!', 'success');
      } else {
        showToast('Failed to save sequence', 'error');
      }
    } catch (e: unknown) {
      showToast(`Error saving sequence: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    setSequence([...sequence, { step: sequence.length, templateKey: 'followup1', delayDays: 3 }]);
  };

  const removeStep = (index: number) => {
    if (index === 0) return; // Cannot remove step 0
    const newSeq = [...sequence];
    newSeq.splice(index, 1);
    setSequence(newSeq);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (index === 0) return; // Cannot move step 0
    if (direction === 'up' && index === 1) return; // Cannot move step 1 to step 0
    if (direction === 'down' && index === sequence.length - 1) return;
    
    const newSeq = [...sequence];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    const temp = newSeq[index];
    newSeq[index] = newSeq[targetIndex];
    newSeq[targetIndex] = temp;
    
    setSequence(newSeq);
  };

  const updateStep = (index: number, field: keyof SequenceStep, value: string | number) => {
    const newSeq = [...sequence];
    newSeq[index] = { ...newSeq[index], [field]: value };
    setSequence(newSeq);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '16px' }}>
        <motion.div
          animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--honey-500)' }}
        />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-inter)' }}>Loading sequence…</span>
      </div>
    );
  }

  // Calculate cumulative timeline days
  const timelineNodes = sequence.map((s, i) => {
    if (i === 0) {
      return { step: i, day: 0, label: s.templateKey };
    }
    const day = sequence.slice(1, i + 1).reduce((sum, step) => sum + step.delayDays, 0);
    return { step: i, day, label: s.templateKey };
  });

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <PageHeader
          title="Campaign Sequence Builder"
          subtitle="Design your multi-step email sequences. Delays are relative to the previous step."
          onRefresh={() => fetch('/api/settings').then(r => r.ok ? r.json() : {}).then((d: Record<string, unknown>) => { if (d.sequence) setSequence(d.sequence as SequenceStep[]); })}
        >
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Sequence'}
          </button>
        </PageHeader>
      </div>

      {/* Editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '48px' }}>
        {sequence.map((step, index) => (
          <div key={index} className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '20px' }}>
            
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: index === 0 ? 'var(--honey-500)' : 'var(--bg-active)',
              color: index === 0 ? 'white' : 'var(--text-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 'bold'
            }}>
              {index}
            </div>

            <div style={{ flex: 1, display: 'flex', gap: '24px' }}>
              <div style={{ flex: 1 }}>
                <label className="text-sm font-medium mb-1 block">Template</label>
                <select 
                  id={`sequence-template-select-${index}`}
                  name="templateKey"
                  aria-label="Sequence Step Template"
                  className="input-field" 
                  value={step.templateKey}
                  onChange={(e) => updateStep(index, 'templateKey', e.target.value)}
                >
                  <option value="initial">Initial Outreach</option>
                  <option value="followup1">Follow Up 1</option>
                  <option value="followup2">Follow Up 2</option>
                  <option value="followup3">Follow Up 3</option>
                  <option value="breakup">Breakup Email</option>
                </select>
              </div>

              <div style={{ width: '150px' }}>
                <label className="text-sm font-medium mb-1 block">Delay (Days)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={step.delayDays}
                  onChange={(e) => updateStep(index, 'delayDays', parseInt(e.target.value) || 0)}
                  disabled={index === 0}
                  min="0"
                />
                {index === 0 && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sent immediately</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={() => moveStep(index, 'up')}
                disabled={index <= 1}
                style={{ padding: '8px', color: index <= 1 ? 'var(--text-disabled)' : 'var(--text-primary)', background: 'transparent', border: 'none', cursor: index <= 1 ? 'default' : 'pointer' }}
              >
                <ArrowUp size={18} />
              </button>
              <button 
                onClick={() => moveStep(index, 'down')}
                disabled={index === 0 || index === sequence.length - 1}
                style={{ padding: '8px', color: index === 0 || index === sequence.length - 1 ? 'var(--text-disabled)' : 'var(--text-primary)', background: 'transparent', border: 'none', cursor: index === 0 || index === sequence.length - 1 ? 'default' : 'pointer' }}
              >
                <ArrowDown size={18} />
              </button>
              <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)', margin: '0 8px' }} />
              <button 
                onClick={() => removeStep(index)}
                disabled={index === 0}
                style={{ padding: '8px', color: index === 0 ? 'var(--text-disabled)' : 'var(--danger)', background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer' }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
        
        <button 
          onClick={addStep}
          style={{
            padding: '16px', border: '1px dashed var(--border-subtle)', borderRadius: '12px',
            background: 'transparent', color: 'var(--text-primary)', fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            cursor: 'pointer', transition: 'all 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--bg-active)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          <Plus size={18} />
          Add Sequence Step
        </button>
      </div>

      {/* Timeline */}
      <h2 className="text-xl font-bold font-serif mb-4 text-primary">Sequence Timeline</h2>
      <div className="card" style={{ padding: '40px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 'min-content' }}>
          {timelineNodes.map((node, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px' }}>
                <div style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: i === 0 ? 'var(--honey-500)' : 'white',
                  border: i === 0 ? '4px solid var(--honey-100)' : '4px solid var(--border-subtle)',
                  marginBottom: '12px', zIndex: 1
                }} />
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Day {node.day}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
                  {node.label}
                </div>
              </div>
              {i < timelineNodes.length - 1 && (
                <div style={{ flex: 1, height: '2px', background: 'var(--border-subtle)', margin: '0 -40px', zIndex: 0, marginTop: '-36px', minWidth: '100px' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
