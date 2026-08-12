'use strict';

const axios = require('axios');
const { errOf } = require('./utils');
const cheerio = require('cheerio');
const http = require('http');
const https = require('https');

/**
 * Deterministic Website Audit Engine
 * Inspects technical quality, OpenGraph, Schema markup, social proof, CTAs, and performance.
 */
/**
 * @param {string} websiteUrl
 */
async function auditWebsite(websiteUrl) {
  if (!websiteUrl || typeof websiteUrl !== 'string') {
    return { score: 50, problems: ['No website URL provided'], metrics: {} };
  }

  let url = websiteUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const problems = [];
  let score = 100;
  const metrics = {
    isHttps: url.startsWith('https:'),
    hasSsl: false,
    responseTimeMs: 0,
    hasFavicon: false,
    hasMetaDescription: false,
    hasViewport: false,
    hasCtaAboveFold: false,
    hasContactForm: false,
    hasSocialLinks: false,
    hasOpenGraph: false,
    hasSchemaMarkup: false,
    hasSocialProof: false,
    cms: 'Unknown',
    copyrightYear: /** @type {number|null} */ (null),
  };

  if (!metrics.isHttps) {
    score -= 20;
    problems.push('No HTTPS encryption (HTTP only)');
  }

  const startTime = Date.now();
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      },
      httpAgent: new http.Agent({ keepAlive: false }),
      httpsAgent: new https.Agent({ keepAlive: false, rejectUnauthorized: false })
    });
    const resp = /** @type {{ data?: unknown; request?: { res?: { socket?: { encrypted?: boolean } } } }} */ (/** @type {unknown} */ (response));

        metrics.responseTimeMs = Date.now() - startTime;
    if (metrics.responseTimeMs > 3000) {
      score -= 15;
      problems.push(`Slow page load speed (${(metrics.responseTimeMs / 1000).toFixed(1)}s)`);
    }
    metrics.hasSsl = (resp.request && resp.request.res && resp.request.res.socket && resp.request.res.socket.encrypted) || false;
    const html = String(resp.data || '');
    const $ = cheerio.load(html);
    // 1. Favicon Check
    metrics.hasFavicon = /** @type {number} */ ($('link[rel*="icon"]').length) > 0;
    if (!metrics.hasFavicon) {
      score -= 10;
      problems.push('Missing website favicon');
    }

    // 2. Meta Description & OpenGraph
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    metrics.hasMetaDescription = metaDesc.length > 10;
    if (!metrics.hasMetaDescription) {
      score -= 10;
      problems.push('Missing SEO meta description tag');
    }

    metrics.hasOpenGraph = $('meta[property^="og:"]').length > 0;
    if (!metrics.hasOpenGraph) {
      score -= 10;
      problems.push('Missing OpenGraph social sharing meta tags');
    }

    // 3. Schema Markup
    metrics.hasSchemaMarkup = /** @type {number} */ ($('script[type="application/ld+json"]').length) > 0;
    if (!metrics.hasSchemaMarkup) {
      score -= 10;
      problems.push('Missing Schema.org structured data markup');
    }

    // 4. Mobile Viewport
    metrics.hasViewport = /** @type {number} */ ($('meta[name="viewport"]').length) > 0;
    if (!metrics.hasViewport) {
      score -= 15;
      problems.push('No mobile viewport tag (poor mobile experience)');
    }

    // 5. CTA & Social Proof Check
    const ctaButtons = $('a.btn, button, input[type="submit"], a[href*="contact"], a[href*="shop"], a[href*="book"]');
    metrics.hasCtaAboveFold = /** @type {number} */ (ctaButtons.length) > 0;
    if (!metrics.hasCtaAboveFold) {
      score -= 15;
      problems.push('No prominent Call to Action (CTA) button above fold');
    }

    const htmlText = String($.text()).toLowerCase();
    metrics.hasSocialProof = htmlText.includes('review') || htmlText.includes('testimonial') || htmlText.includes('rating') || htmlText.includes('client');
    if (!metrics.hasSocialProof) {
      score -= 10;
      problems.push('Missing client testimonials or social proof');
    }

    // 6. Contact Form / Phone
    metrics.hasContactForm = $('form').length > 0 || html.includes('mailto:') || html.includes('tel:');
    if (!metrics.hasContactForm) {
      score -= 15;
      problems.push('No direct contact form or phone link found');
    }

    // 7. Social Links
    metrics.hasSocialLinks = /** @type {number} */ ($('a[href*="facebook"], a[href*="instagram"], a[href*="twitter"], a[href*="linkedin"]').length) > 0;

    // 8. CMS Detection
    if (html.includes('Shopify.shop') || html.includes('cdn.shopify.com')) metrics.cms = 'Shopify';
    else if (html.includes('wp-content') || html.includes('wp-includes')) metrics.cms = 'WordPress';
    else if (html.includes('woocommerce')) metrics.cms = 'WooCommerce';
    else if (html.includes('magento')) metrics.cms = 'Magento';
    else if (html.includes('wix.com')) metrics.cms = 'Wix';
    else if (html.includes('squarespace')) metrics.cms = 'Squarespace';

    // 9. Stale Copyright Year
    const copyMatch = html.match(/©\s*(\d{4})|copyright\s*(\d{4})/i);
    if (copyMatch) {
      metrics.copyrightYear = /** @type {number} */ (parseInt(copyMatch[1] || copyMatch[2], 10));
      const currentYear = new Date().getFullYear();
      if ((metrics.copyrightYear || 0) < currentYear - 2) {
        score -= 15;
        problems.push(`Outdated copyright year (${metrics.copyrightYear}) — site appears unmaintained`);
      }
    }

  } catch (err) {
    score -= 40;
    problems.push(`Website failed to connect: ${errOf(err).message}`);
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: finalScore,
    problems,
    metrics,
    auditedAt: Date.now()
  };
}

module.exports = { auditWebsite };
