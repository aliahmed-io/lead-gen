'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Consistent page header used across every dashboard page.
 * Provides a serif title, secondary subtitle, an optional back link,
 * and an optional refresh button with loading spinner.
 */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  backHref?: string;
  onRefresh?: () => void;
  refreshLoading?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, subtitle, backHref, onRefresh, refreshLoading, actions, children }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
      {backHref && (
        <Link
          href={backHref}
          aria-label="Go back"
          className="nav-link"
          style={{ marginTop: '3px', padding: '7px', borderRadius: '10px', flexShrink: 0 }}
        >
          <ChevronLeft size={17} />
        </Link>
      )}
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: '26px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px', fontFamily: 'var(--font-inter)' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
      {actions}
      {children}
      {onRefresh && (
        <Button
          variant="secondary"
          onClick={onRefresh}
          loading={refreshLoading}
          aria-label="Refresh"
          style={{ padding: '8px' }}
        >
          <RefreshCw size={15} className={refreshLoading ? 'animate-spin' : ''} />
        </Button>
      )}
    </div>
  </div>
);

/**
 * A consistent loading skeleton screen that matches the warm theme.
 */
export const PageSkeleton: React.FC<{ message?: string }> = ({ message = 'Loading…' }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '14px',
    }}
  >
    <Skeleton width="100%" height="16px" borderRadius="99px" style={{ maxWidth: '720px' }} />
    <Skeleton width="88%" height="16px" borderRadius="99px" style={{ maxWidth: '620px' }} />
    <Skeleton width="60%" height="16px" borderRadius="99px" style={{ maxWidth: '420px' }} />
    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-inter)' }}>{message}</span>
  </div>
);

/**
 * Consistent error banner matching the warm theme.
 */
export const ErrorBanner: React.FC<{ message: string; onDismiss?: () => void }> = ({ message, onDismiss }) => (
  <div
    role="alert"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      padding: '12px 16px',
      background: 'var(--danger-bg)',
      border: '1px solid rgba(181, 78, 69, 0.18)',
      borderRadius: '12px',
      fontSize: '13px',
      color: 'var(--danger)',
      fontWeight: 500,
    }}
  >
    <span>{message}</span>
    {onDismiss && (
      <button
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="btn btn-secondary"
        style={{ padding: '4px 10px', fontSize: '12px', lineHeight: 1 }}
      >
        Dismiss
      </button>
    )}
  </div>
);

/**
 * Helper hook: a simple debounced no-op refresh wrapper.
 */
export const usePageRefresh = <T extends (...args: unknown[]) => Promise<unknown>>(fn: T) => {
  const [refreshing, setRefreshing] = useState(false);
  const busyRef = React.useRef(false);
  const fnRef = React.useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    try {
      await fnRef.current();
    } finally {
      busyRef.current = false;
      setRefreshing(false);
    }
  }, []);
  return { refresh, refreshing };
};
