/**
 * Design Tokens & Type System
 * Adheres strictly to the LeadGen warm alabaster / golden honey design language (Rule 5 & Rule 13).
 * 8pt Grid default spacing.
 */

export const colors = {
  surfaces: {
    base: '#FAF8F5',
    surface: '#FFFFFF',
    elevated: '#FDFCFB',
    neutralMuted: '#F3EEE3',
  },
  borders: {
    subtle: 'rgba(42, 34, 24, 0.05)',
    default: 'rgba(42, 34, 24, 0.09)',
    strong: 'rgba(42, 34, 24, 0.16)',
  },
  brand: {
    honey50: '#FDFBF7',
    honey100: '#F8F2E2',
    honey200: '#EFE4C4',
    honey500: '#C2872E',
    honey600: '#A8711E',
    honeyGlow: 'rgba(194, 135, 46, 0.18)',
  },
  text: {
    primary: '#2C2219',
    secondary: '#6E6153',
    muted: '#9C8F80',
    disabled: '#C2B7A9',
  },
  semantic: {
    success: '#4A6D4B',
    successBg: '#EBF2EC',
    warning: '#C6782B',
    warningBg: '#FAF3EA',
    danger: '#B54E45',
    dangerBg: '#FAF1F0',
  },
} as const;

export type Colors = typeof colors;

/**
 * 8pt Grid spacing multiples
 */
export const spacing = {
  0: '0px',
  0.5: '4px',   // Half-step (documented exception for tight inline badges)
  1: '8px',     // 1 unit = 8px
  1.5: '12px',  // Intermediate micro-step
  2: '16px',    // 2 units = 16px
  3: '24px',    // 3 units = 24px
  4: '32px',    // 4 units = 32px
  5: '40px',    // 5 units = 40px
  6: '48px',    // 6 units = 48px
  8: '64px',    // 8 units = 64px
  10: '80px',   // 10 units = 80px
  12: '96px',   // 12 units = 96px
} as const;

export type Spacing = typeof spacing;

export const radii = {
  none: '0px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  full: '9999px',
} as const;

export type Radii = typeof radii;

export const motionDurations = {
  instant: '50ms',
  fast: '120ms',
  base: '200ms',
  slow: '350ms',
  deliberate: '500ms',
} as const;

export type MotionDurations = typeof motionDurations;

export const typeScales = {
  xs: {
    fontSize: '0.75rem',    // 12px
    lineHeight: '1rem',      // 16px
    letterSpacing: '0.01em',
  },
  sm: {
    fontSize: '0.875rem',   // 14px
    lineHeight: '1.25rem',  // 20px
    letterSpacing: '-0.01em',
  },
  base: {
    fontSize: '1rem',       // 16px
    lineHeight: '1.5rem',   // 24px
    letterSpacing: '-0.01em',
  },
  lg: {
    fontSize: '1.125rem',   // 18px
    lineHeight: '1.75rem',  // 28px
    letterSpacing: '-0.015em',
  },
  xl: {
    fontSize: '1.25rem',    // 20px
    lineHeight: '1.75rem',  // 28px
    letterSpacing: '-0.02em',
  },
  '2xl': {
    fontSize: '1.5rem',     // 24px
    lineHeight: '2rem',      // 32px
    letterSpacing: '-0.025em',
  },
  '3xl': {
    fontSize: '1.875rem',   // 30px
    lineHeight: '2.25rem',  // 36px
    letterSpacing: '-0.03em',
  },
} as const;

export type TypeScales = typeof typeScales;

export const tokens = {
  colors,
  spacing,
  radii,
  motionDurations,
  typeScales,
} as const;

export default tokens;
