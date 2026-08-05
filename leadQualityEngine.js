'use strict';

const { auditWebsite } = require('./websiteAuditor');

/**
 * Lead Quality & Freelance Sales Opportunity Engine
 * Evaluates prospect websites and metadata to compute a 0-100 Opportunity Score
 * representing the likelihood that the business needs a web developer / redesign.
 */
class LeadQualityEngine {
  /**
   * Calculates Opportunity Score based on website audit and lead metadata.
   * Higher score = higher probability of hiring a web developer.
   *
   * @param {object} lead - Lead record
   * @param {object} [auditData] - Optional pre-fetched audit result from websiteAuditor
   * @returns {Promise<{ opportunityScore: number, priorityBadge: string, reasons: string[] }>}
   */
  async evaluateLead(lead = {}, auditData = null) {
    let audit = auditData;
    if (!audit && lead.website) {
      audit = await auditWebsite(lead.website);
    }

    let opportunityScore = 30; // Baseline
    const reasons = [];

    if (audit) {
      const { metrics, problems } = audit;

      if (!metrics.isHttps) {
        opportunityScore += 25;
        reasons.push('No HTTPS (+25)');
      }

      if (!metrics.hasCtaAboveFold) {
        opportunityScore += 20;
        reasons.push('Missing main Call to Action (+20)');
      }

      if (!metrics.hasViewport) {
        opportunityScore += 20;
        reasons.push('No mobile optimization (+20)');
      }

      if (metrics.responseTimeMs > 3000) {
        opportunityScore += 15;
        reasons.push('Slow site load speed (+15)');
      }

      if (!metrics.hasContactForm) {
        opportunityScore += 15;
        reasons.push('No contact form or phone link (+15)');
      }

      if (metrics.copyrightYear && metrics.copyrightYear < new Date().getFullYear() - 2) {
        opportunityScore += 20;
        reasons.push(`Stale website copyright (${metrics.copyrightYear}) (+20)`);
      }

      if (metrics.cms === 'WordPress' || metrics.cms === 'WooCommerce') {
        opportunityScore += 15;
        reasons.push('Legacy CMS setup ripe for modernization (+15)');
      }
    }

    // Platform & City Boosts
    if (lead.platform === 'Shopify' || lead.platform === 'WooCommerce') {
      opportunityScore += 10;
      reasons.push('E-commerce business with revenue (+10)');
    }

    if (lead.email) {
      opportunityScore += 10;
      reasons.push('Verified direct email contact (+10)');
    }

    const finalScore = Math.min(100, Math.max(0, opportunityScore));

    let priorityBadge = 'Standard Lead';
    if (finalScore >= 80) priorityBadge = '🔥 High Priority Prospect';
    else if (finalScore >= 60) priorityBadge = '⚡ Medium Opportunity';

    return {
      opportunityScore: finalScore,
      priorityBadge,
      reasons,
      auditResult: audit
    };
  }
}

const defaultEngine = new LeadQualityEngine();

module.exports = {
  LeadQualityEngine,
  evaluateLead: (lead, auditData) => defaultEngine.evaluateLead(lead, auditData),
};
