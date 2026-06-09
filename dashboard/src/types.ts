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
  [key: string]: string | number | boolean | undefined | null;
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

export interface BusinessDbRecord {
  name?: string;
  email?: string;
  platform?: string;
  emailStatus?: string;
  updatedAt?: string;
}
