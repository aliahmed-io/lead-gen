'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export type BadgeVariant = 'healthy' | 'good' | 'watch' | 'warning' | 'paused' | 'critical' | 'danger' | 'recovering' | 'neutral';

interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ variant, label, showIcon = true }) => {
  let bg = 'var(--bg-neutral-muted)';
  let color = 'var(--text-secondary)';
  let border = 'var(--border-subtle)';
  let Icon = Clock;
  let text = label;

  switch (variant) {
    case 'healthy':
    case 'good':
      bg = 'var(--success-bg)';
      color = 'var(--success)';
      border = 'rgba(74, 109, 75, 0.2)';
      Icon = ShieldCheck;
      text = text || 'Healthy';
      break;
    case 'watch':
    case 'warning':
      bg = 'var(--warning-bg)';
      color = 'var(--warning)';
      border = 'rgba(198, 120, 43, 0.2)';
      Icon = AlertTriangle;
      text = text || 'Watch';
      break;
    case 'paused':
    case 'critical':
    case 'danger':
      bg = 'var(--danger-bg)';
      color = 'var(--danger)';
      border = 'rgba(181, 78, 69, 0.2)';
      Icon = ShieldAlert;
      text = text || 'Paused';
      break;
    case 'recovering':
      bg = 'var(--honey-100)';
      color = 'var(--honey-700)';
      border = 'var(--honey-glow)';
      Icon = CheckCircle;
      text = text || 'Recovering';
      break;
    default:
      text = text || 'Neutral';
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '99px',
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: bg,
        color: color,
        border: `1px solid ${border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {showIcon && <Icon size={10} />}
      {text}
    </span>
  );
};
