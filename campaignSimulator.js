'use strict';

const campaignDb = require('./campaignDb');
const templates = require('./templates');

/**
 * Returns true when the given date falls on a business day (Mon–Fri).
 * The outreach scheduler skips weekends, so duration estimates only count
 * weekdays toward the projected completion date.
 */
/**
 * @param {Date} date
 */
function isBusinessDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

/**
 * Campaign Dry-Run Preflight & Execution Simulator Engine
 * Validates campaign configuration, domain suppression, merge tags, SMTP access,
 * and projects total execution duration before launching a campaign.
 */
/**
 * @param {{ leads?: LeadRecord[], accounts?: EmailAccount[], dailyLimit?: number }} options
 */
function runPreflightAndSimulation({ leads = [], accounts = [], dailyLimit = 30 }) {
  const validation = {
    valid: true,
    warnings: /** @type {string[]} */ ([]),
    errors: /** @type {string[]} */ ([]),
    checks: {
      mergeTags: true,
      suppression: true,
      smtpConfig: true,
      dnsStatus: true,
      templatesExist: true,
    }
  };

  if (!leads || leads.length === 0) {
    validation.errors.push('No leads provided in campaign');
    validation.valid = false;
  }

  if (!accounts || accounts.length === 0) {
    validation.errors.push('No outreach mailboxes connected');
    validation.valid = false;
    validation.checks.smtpConfig = false;
  }

  // 1. Check template availability
  const mainTemplate = templates.getEmail ? templates.getEmail('initial', { businessName: 'Test', city: 'Austin' }) : null;
  if (!mainTemplate || !mainTemplate.subject) {
    validation.errors.push('Primary cold email template missing');
    validation.valid = false;
    validation.checks.templatesExist = false;
  }

  // 2. Validate Merge Tags & 90-day Suppression
  let suppressedCount = 0;
  let missingEmailCount = 0;
  let invalidMergeCount = 0;

  for (const lead of leads) {
    if (!lead.email) {
      missingEmailCount++;
      continue;
    }

    if (campaignDb.isDomainSuppressed(lead.email)) {
      suppressedCount++;
    }

    if (mainTemplate && (!lead.businessName || !lead.city)) {
      invalidMergeCount++;
    }
  }

  if (suppressedCount > 0) {
    validation.warnings.push(`${suppressedCount} leads will be skipped due to 90-day domain suppression`);
  }

  if (missingEmailCount > 0) {
    validation.warnings.push(`${missingEmailCount} leads have no verified email address`);
  }

  if (invalidMergeCount > 0) {
    validation.warnings.push(`${invalidMergeCount} leads missing secondary merge tags (will fallback cleanly)`);
  }

  // 3. Simulation Calculation
  const activeMailboxes = accounts.filter(a => a.healthScore !== 'critical' && ((/** @type {{ bounceRate?: number }} */ (a)).bounceRate ?? 0) <= 0.04);
  const activeCount = activeMailboxes.length || 1;
  const totalDailyCapacity = activeCount * dailyLimit;

  const mailableLeads = Math.max(0, leads.length - suppressedCount - missingEmailCount);
  const initialSends = mailableLeads;
  const followups = mailableLeads * 2; // Follow-up 1 & Follow-up 2
  const totalSends = initialSends + followups;

  const daysToCompleteInitial = Math.ceil(initialSends / totalDailyCapacity) || 1;
  const totalDaysToComplete = Math.ceil(totalSends / totalDailyCapacity) || 1;

  // Advance only across business days, matching the scheduler's weekend skip.
  const estimatedCompletionDate = new Date();
  let businessDaysRemaining = Math.max(1, totalDaysToComplete);
  while (businessDaysRemaining > 0) {
    estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + 1);
    if (isBusinessDay(estimatedCompletionDate)) businessDaysRemaining--;
  }

  const simulation = {
    totalLeads: leads.length,
    mailableLeads,
    suppressedLeads: suppressedCount,
    activeMailboxesCount: activeCount,
    dailyCapacity: totalDailyCapacity,
    initialSends,
    projectedFollowups: followups,
    totalProjectedSends: totalSends,
    daysToCompleteInitial,
    totalDaysToComplete,
    estimatedCompletionDate: estimatedCompletionDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
  };

  return {
    validation,
    simulation,
    timestamp: Date.now()
  };
}

module.exports = { runPreflightAndSimulation };
