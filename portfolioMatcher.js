'use strict';

/**
 * Portfolio Matching Engine
 * Recommends relevant past projects, case studies, and services
 * based on lead platform, industry, and opportunity signals.
 */

const PORTFOLIO_PROJECTS = {
  Shopify: {
    caseStudyTitle: 'E-commerce Brand 2.4x Conversion Increase',
    summary: 'Redesigned mobile checkout and product layout for a Shopify store, reducing page load from 4.2s to 1.1s and boosting conversion rate by 140%.',
    techStack: 'Shopify, Liquid, Tailwind CSS, Klaviyo',
    demoUrl: 'https://aethelonlabs.com/portfolio/ecommerce-case-study',
  },
  WooCommerce: {
    caseStudyTitle: 'High-Volume WooCommerce Speed & UX Overhaul',
    summary: 'Optimized database queries, asset loading, and cart flow for a WooCommerce store scaling past 10,000 monthly orders.',
    techStack: 'WordPress, WooCommerce, PHP, Redis, Tailwind',
    demoUrl: 'https://aethelonlabs.com/portfolio/woocommerce-case-study',
  },
  WordPress: {
    caseStudyTitle: 'Custom Modern Web App & Redesign on Next.js',
    summary: 'Migrated legacy WordPress blog/site into headless Next.js, achieving 99 Lighthouse performance score and 3x lead conversions.',
    techStack: 'Next.js 16, Headless CMS, Vercel, Tailwind',
    demoUrl: 'https://aethelonlabs.com/portfolio/nextjs-migration',
  },
  General: {
    caseStudyTitle: 'Custom B2B SaaS Dashboard & Landing Page',
    summary: 'Built high-converting marketing landing page and interactive client portal for a B2B service agency.',
    techStack: 'React, Next.js, TypeScript, Tailwind, Node.js',
    demoUrl: 'https://aethelonlabs.com/portfolio/b2b-saas',
  }
};

class PortfolioMatcher {
  /**
   * Returns matching portfolio project and recommendation snippet for a lead.
   *
   * @param {object} lead - Lead record (platform, industry, businessName)
   * @returns {object} Portfolio match result
   */
  matchLead(lead = {}) {
    const platform = lead.platform || 'General';
    const match = PORTFOLIO_PROJECTS[platform] || PORTFOLIO_PROJECTS.General;

    return {
      platform,
      caseStudyTitle: match.caseStudyTitle,
      summary: match.summary,
      techStack: match.techStack,
      demoUrl: match.demoUrl,
      recommendationSnippet: `Here is a quick case study of a similar project we completed recently: "${match.caseStudyTitle}" — ${match.summary} (View live at ${match.demoUrl})`,
    };
  }
}

const defaultMatcher = new PortfolioMatcher();

module.exports = {
  PortfolioMatcher,
  matchLead: (lead) => defaultMatcher.matchLead(lead),
};
