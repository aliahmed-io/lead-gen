export interface LeadRecord {
  email?: string;
  businessName?: string;
  platform?: string;
  status?: string;
  score?: number;
  sentiment?: string;
  openCount?: number;
  clickCount?: number;
  repliedAt?: number;
  completedAt?: number;
  followedUp2At?: number;
  followedUp1At?: number;
  sentAt?: number;
  updatedAt?: number;
  state?: string;
  city?: string;
  website?: string;
  callBooked?: boolean;
  proposalSent?: boolean;
  clientClosed?: boolean;
  dealValue?: number;
  notes?: string;
  qualityTier?: string;
  qualityScore?: number;
  auditDetails?: Record<string, unknown>;
  [key: string]: string | number | boolean | undefined | null | Record<string, unknown>;
}

export interface BusinessDbRecord {
  name?: string;
  companyName?: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emails?: string[];
  platform?: string;
  emailStatus?: string;
  updatedAt?: string;
  state?: string;
  city?: string;
  website?: string;
  qualityTier?: string;
  qualityScore?: number;
}

export interface Stats {
  total: number;
  contacted: number;
  sent: number;
  replied: number;
  bounced: number;
  completed: number;
  conversion: string | number;
}

export interface Settings {
  [key: string]: string | number | boolean | undefined;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export interface CampaignState {
  status: 'running' | 'paused' | 'stopped';
  pausedAt: number | null;
  pauseReason: string | null;
  stoppedAt: number | null;
}

export interface AccountHealth {
  id: string | number;
  email: string;
  appPassword?: string;
  totpSecret?: string;
  firstName?: string;
  lastName?: string;
  senderName?: string;
  signature?: string;
  forwardingDestination?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminSecret?: string;
  sentToday: number;
  totalSent: number;
  bounceCount: number;
  bounceRate: number;
  replyCount?: number;
  replyRate?: number;
  openRate?: number;
  clickRate?: number;
  lastActiveAt: number | null;
  healthScore: 'good' | 'warning' | 'critical';
  healthScoreNumber?: number;
  healthStatus?: 'healthy' | 'warning' | 'degraded' | 'critical' | 'paused';
  autoPaused?: boolean;
  autoPauseReason?: string;
  consecutiveErrors?: number;
  totalErrors?: number;
  lastError?: string;
  lastErrorAt?: number;
  lastErrorType?: string;
  lastSmtpStatus?: 'pass' | 'fail' | 'pending';
  lastSmtpLatencyMs?: number;
  lastImapStatus?: 'pass' | 'fail' | 'pending';
  lastImapLatencyMs?: number;
  dnsResult?: {
    overall: 'good' | 'warning' | 'fail';
    summary?: string;
    spf?: { pass: boolean; warning?: string };
    dmarc?: { pass: boolean; warning?: string };
    mx?: { pass: boolean; warning?: string };
  };
}

export interface AccountDiagnosticReport {
  accountId: string;
  email: string;
  timestamp: number;
  smtp: { status: 'pass' | 'fail' | 'pending'; latencyMs: number; error: string | null };
  imap: { status: 'pass' | 'fail' | 'pending'; latencyMs: number; error: string | null };
  dns: {
    domain?: string | null;
    overall: 'good' | 'warning' | 'fail';
    spf?: { pass: boolean; warning?: string | null };
    dmarc?: { pass: boolean; warning?: string | null };
    mx?: { pass: boolean; warning?: string | null };
    summary?: string;
  } | null;
  healthScore: number;
  healthStatus: 'healthy' | 'warning' | 'degraded' | 'critical';
  details: string[];
}

export interface SystemHealthResponse {
  overall: 'good' | 'warning' | 'critical';
  healthScore: number;
  summary: {
    totalAccounts: number;
    healthyAccounts: number;
    warningAccounts: number;
    criticalAccounts: number;
    pausedAccounts: number;
  };
  checks: Array<{
    name: string;
    category: string;
    status: 'pass' | 'warn' | 'fail';
    detail: string;
  }>;
  alerts: DeliverabilityAlert[];
  timestamp: number;
}

export interface DeliverabilityAlert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  accountId?: string;
  message: string;
  at: number;
}

export interface DailyVolume {
  date: string;
  count: number;
}

export interface PaginatedLeads {
  records: LeadRecord[];
  total: number;
  page: number;
  totalPages: number;
}

export interface EnhancedStats extends Stats {
  dailyVolume: DailyVolume[];
  followUpBreakdown: { stage1: number; stage2: number };
  accountBreakdown: { accountId: string | number; sent: number; bounced: number }[];
  recentActivity: { email: string; from: string | null; to: string; at: number }[];
  alerts?: DeliverabilityAlert[];
  variantBreakdown?: Record<string, { name: string; sent: number; opens: number; replies: number; positiveReplies: number; callsBooked: number; clientsClosed: number }>;
}

export interface SpamRule {
  rule: string;
  description: string;
  passed: boolean;
  score: number;
}

export interface SpamReport {
  score: number;
  spamAssassinRating: number;
  ratingLabel: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' | 'SPAM_RISK' | string;
  rules: SpamRule[];
  recommendations: string[];
}

