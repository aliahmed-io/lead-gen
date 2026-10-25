import {backend} from './backend';
export interface PreflightSimulationResult {
  validation: {
    valid: boolean;
    warnings: string[];
    errors: string[];
    checks: {
      smtpConfig: boolean;
      templatesExist: boolean;
      suppression: boolean;
      dnsStatus: boolean;
    };
  };
  simulation: {
    totalLeads: number;
    mailableLeads: number;
    suppressedLeads: number;
    activeMailboxesCount: number;
    dailyCapacity: number;
    initialSends: number;
    projectedFollowups: number;
    totalProjectedSends: number;
    daysToCompleteInitial: number;
    totalDaysToComplete: number;
    estimatedCompletionDate: string;
    projectedSchedule: Array<{ day: number; date: string; sends: number }>;
  };
  timestamp: number;
}

export interface PostMortemResult {
  campaignId: string;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  healthScore: number;
  metrics: {
    totalLeads: number;
    sentCount: number;
    deliveredCount: number;
    replyCount: number;
    positiveReplyCount: number;
    bounceCount: number;
    replyRate: number;
    bounceRate: number;
    meetingsBooked: number;
    proposalsSent: number;
    dealsWon: number;
    totalRevenue: number;
  };
  bottlenecks: string[];
  recommendations: string[];
}

export async function runPreflightSimulation(params?:Record<string,unknown>){return backend.call('campaign/simulate','POST',{action:'simulate',...params});}
export async function runPostMortemAnalysis(){return backend.call('campaign/simulate','POST',{action:'post_mortem'});}
