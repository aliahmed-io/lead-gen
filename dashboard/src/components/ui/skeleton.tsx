'use client';

import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = '8px',
  style = {},
}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'var(--bg-neutral-muted)',
        opacity: 0.6,
        animation: 'pulse-glow 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
};
