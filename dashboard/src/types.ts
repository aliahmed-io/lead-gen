export interface LeadRecord {
  email?: string;
  businessName?: string;
  platform?: string;
  status?: string;
  repliedAt?: number;
  completedAt?: number;
  followedUp2At?: number;
  followedUp1At?: number;
  sentAt?: number;
  updatedAt?: number;
  state?: string;
  city?: string;
  website?: string;
  [key: string]: string | number | boolean | undefined | null;
}

export interface BusinessDbRecord {
  name?: string;
  email?: string;
  platform?: string;
  emailStatus?: string;
  updatedAt?: string;
  state?: string;
  city?: string;
  website?: string;
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
  sentToday: number;
  totalSent: number;
  bounceCount: number;
  bounceRate: number;
  lastActiveAt: number | null;
  healthScore: 'good' | 'warning' | 'critical';
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
}
