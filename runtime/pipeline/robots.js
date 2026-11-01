'use strict';

const { robotsRules, robotsAllows } = require('../master-research');

const AGENT = 'leadgenresearch/3.0';

// RFC 9309: 2xx = parse; other 4xx = no restrictions; 5xx/429/unreachable = must not crawl yet (retry later).
async function loadRobots(origin, { fetchPage, signal }) {
  const url = new URL('/robots.txt', origin).href;
  let response;
  try { response = await fetchPage(url, { signal, maxBytes: 512 * 1024, timeoutMs: 15000 }); } catch (error) {
    return { status: 'unreachable', rules: [], delay: 800, sitemaps: [], detail: error.kind || 'error', message: String(error.message).slice(0, 200), retryable: error.retryable !== false };
  }
  if (response.status >= 200 && response.status < 300) {
    if (/html/i.test(response.contentType || '') && /<html|<!doctype/i.test(response.text.slice(0, 500))) return { status: 'not-published', rules: [], delay: 800, sitemaps: [], sourceUrl: url };
    const parsed = robotsRules(response.text, AGENT);
    const sitemaps = [...response.text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map(m => m[1]).slice(0, 5);
    return { status: 'loaded', rules: parsed.rules, delay: parsed.delay, sitemaps, sourceUrl: url };
  }
  if (response.status === 429 || response.status >= 500) return { status: 'unreachable', rules: [], delay: 800, sitemaps: [], detail: 'http-' + response.status, retryable: true };
  return { status: 'not-published', rules: [], delay: 800, sitemaps: [], sourceUrl: url };
}

function allowed(robots, url) { return robotsAllows({ rules: robots.rules || [] }, url); }

module.exports = { loadRobots, allowed, AGENT };
