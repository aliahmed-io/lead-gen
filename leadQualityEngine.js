'use strict';

const { auditWebsite } = require('./websiteAuditor');
const CONFIG = require('./config/index');

/**
 * Weighted Lead Quality & Sales Opportunity Engine
 * Evaluates leads across Technical, Business, Opportunity, and Deliverability dimensions,
 * returning a weighted overall score and specific service recommendations.
 */
class LeadQualityEngine {
  /**
   * Computes weighted lead quality scores and recommended service packages.
   *
   * @param {object} lead - Lead record
   * @param {object} [auditData] - Pre-fetched audit result
   * @returns {Promise<{ overallScore: number, opportunityScore: number, technicalScore: number, businessScore: number, deliverabilityScore: number, priorityBadge: string, recommendedServices: string[], reasons: string[] }>}
   */
  async evaluateLead(lead = {}, auditData = null) {
    let audit = auditData;
    if (!audit && lead.website) {
      audit = await auditWebsite(lead.website);
    }

    let technicalScore = 70;
    let businessScore = 60;
    let opportunityScore = 40;
    let deliverabilityScore = 80;

    const reasons = [];
    const recommendedServices = [];

    if (audit) {
      const { metrics, problems } = audit;

      if (!metrics.isHttps) {
        technicalScore -= 30;
        opportunityScore += 25;
        reasons.push('No HTTPS (+25 Opportunity)');
        if (!recommendedServices.includes('SSL & Security Setup')) recommendedServices.push('SSL & Security Setup');
      }

      if (!metrics.hasCtaAboveFold) {
        businessScore -= 20;
        opportunityScore += 20;
        reasons.push('Missing Call to Action (+20 Opportunity)');
        if (!recommendedServices.includes('Landing Page Redesign')) recommendedServices.push('Landing Page Redesign');
      }

      if (!metrics.hasViewport) {
        technicalScore -= 20;
        opportunityScore += 20;
        reasons.push('No mobile optimization (+20 Opportunity)');
        if (!recommendedServices.includes('Mobile UX Overhaul')) recommendedServices.push('Mobile UX Overhaul');
      }

      if (metrics.responseTimeMs > 3000) {
        technicalScore -= 20;
        opportunityScore += 15;
        reasons.push('Slow site load speed (+15 Opportunity)');
        if (!recommendedServices.includes('Speed & Performance Audit')) recommendedServices.push('Speed & Performance Audit');
      }

      if (!metrics.hasSchemaMarkup || !metrics.hasMetaDescription) {
        technicalScore -= 15;
        opportunityScore += 15;
        if (!recommendedServices.includes('Technical SEO Setup')) recommendedServices.push('Technical SEO Setup');
      }

      if (metrics.copyrightYear && metrics.copyrightYear < new Date().getFullYear() - 2) {
        businessScore -= 20;
        opportunityScore += 20;
        reasons.push(`Stale copyright (${metrics.copyrightYear}) (+20 Opportunity)`);
        if (!recommendedServices.includes('Full Website Modernization')) recommendedServices.push('Full Website Modernization');
      }
    }

    if (lead.platform === 'Shopify' || lead.platform === 'WooCommerce') {
      businessScore += 20;
      opportunityScore += 15;
      if (!recommendedServices.includes('E-commerce Conversion Rate Optimization')) {
        recommendedServices.push('E-commerce Conversion Rate Optimization');
      }
    }

    if (lead.email) {
      deliverabilityScore += 15;
    }

    // Weighted Overall Score Formula
    const weights = CONFIG.scoring.weights;
    const overallScore = Math.round(
      (opportunityScore * weights.opportunity) +
      (businessScore * weights.business) +
      (technicalScore * weights.technical) +
      (deliverabilityScore * weights.deliverability)
    );

    let priorityBadge = 'Standard Lead';
    if (overallScore >= CONFIG.scoring.thresholds.highPriority) priorityBadge = '🔥 High Priority Prospect';
    else if (overallScore >= CONFIG.scoring.thresholds.mediumPriority) priorityBadge = '⚡ Medium Opportunity';

    if (recommendedServices.length === 0) {
      recommendedServices.push('Website Redesign & Conversion Optimization');
    }

    return {
      overallScore: Math.min(100, Math.max(0, overallScore)),
      opportunityScore: Math.min(100, Math.max(0, opportunityScore)),
      technicalScore: Math.min(100, Math.max(0, technicalScore)),
      businessScore: Math.min(100, Math.max(0, businessScore)),
      deliverabilityScore: Math.min(100, Math.max(0, deliverabilityScore)),
      priorityBadge,
      recommendedServices,
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
