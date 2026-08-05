'use strict';

const DASHBOARD_URL = process.env.DASHBOARD_URL || '';

/**
 * Encodes a string to base64url format.
 * @param {string} str
 * @returns {string}
 */
function toB64url(str) {
  return Buffer.from(str).toString('base64url');
}

/**
 * Generates the tracking pixel URL for an email address.
 * Returns empty string if DASHBOARD_URL is not configured.
 * @param {string} email
 * @returns {string}
 */
function getTrackingPixelUrl(email) {
  if (!DASHBOARD_URL) return '';
  return `${DASHBOARD_URL}/api/track/open?e=${toB64url(email)}`;
}

/**
 * Injects a tracking pixel at the end of plain text email body.
 * For plain-text emails, adds an invisible image reference line.
 * Most modern email clients will fetch the pixel even from plain-text emails
 * if the image URL is present. Works in Gmail, Outlook, Apple Mail.
 * @param {string} textBody
 * @param {string} email
 * @returns {string}
 */
function injectTrackingPixel(textBody, email) {
  if (!DASHBOARD_URL) return textBody;
  const pixelUrl = getTrackingPixelUrl(email);
  // Append pixel as an invisible HTML img tag at the end
  // This works for multipart/alternative emails. For plain-text-only,
  // the pixel is included but may not load in strict text clients (acceptable).
  return textBody + `\n<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
}

/**
 * Rewrites all http/https URLs in a plain-text email body through the click tracker.
 * Skips unsubscribe links and the tracking domain itself.
 * @param {string} textBody
 * @param {string} email  — the recipient's email address
 * @returns {string}
 */
function rewriteLinksForTracking(textBody, email) {
  if (!DASHBOARD_URL) return textBody;
  const emailB64 = toB64url(email);

  return textBody.replace(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g, (url) => {
    // Don't rewrite:
    // 1. Unsubscribe links (our own)
    // 2. The tracking domain itself (prevent double-wrapping)
    // 3. The dashboard URL itself
    if (
      url.includes('unsubscribe') ||
      url.includes(DASHBOARD_URL) ||
      url.includes('/api/track/')
    ) {
      return url;
    }
    const urlB64 = toB64url(url);
    return `${DASHBOARD_URL}/api/track/click?e=${emailB64}&u=${urlB64}`;
  });
}

module.exports = { injectTrackingPixel, rewriteLinksForTracking, getTrackingPixelUrl };
