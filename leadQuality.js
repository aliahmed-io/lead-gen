// @ts-check
/**
 * @module leadQuality
 * @description Pre-send quality scoring for scraped business leads.
 *
 * Runs immediately after a business is scraped and enriched (has website /
 * email data available) and before the lead ever enters an outreach
 * sequence. Combines Google Maps signals, website professionalism signals,
 * email-type safety checks, and (when a verifier result is available) MX
 * deliverability into a 0-100 score plus a letter grade and human-readable
 * reasons so low-quality leads can be filtered or deprioritized up front.
 *
 * Usage:
 *   const { scoreLead } = require('./leadQuality');
 *   const verdict = scoreLead(lead, { verified: true/false, roleBased: true/false, disposable: true/false });
 *   lead.qualityScore = verdict.score;      // 0-100
 *   lead.qualityGrade = verdict.grade;      // A|B|C|D|F
 *   lead.qualityTier  = verdict.tier;       // 'A'|'B'|'C'|'D' (dashboard badge)
 *   lead.qualityReasons = verdict.reasons;  // string[]
 *
 * The verifier (verifier.js) remains the SMTP-level gate; this module is the
 * pre-send business-quality gate. `verifyWithScoring()` wraps both in one
 * pipeline for use from the scraper enrichment path.
 */
const { errOf } = require('./utils');
const { verifyEmail } = require('./verifier');

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Email addresses that hit an actual person are far safer than shared mailboxes */
const ROLE_BASED_PREFIXES = [
  'info', 'contact', 'sales', 'support', 'help', 'admin', 'office',
  'mail', 'hello', 'team', 'marketing', 'service', 'billing', 'jobs',
  'hr', 'reception', 'accounts', 'no-reply', 'noreply', 'webmaster',
];

/** Minimum review count to be considered an established business */
const MIN_REVIEWS_ESTABLISHED = 5;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} QualityVerdict
 * @property {number} score - 0-100
 * @property {'A'|'B'|'C'|'D'|'F'} grade
 * @property {'A'|'B'|'C'|'D'} tier - dashboard badge tier
 * @property {string[]} reasons - human-readable scoring reasons
 * @property {boolean} shouldOutreach - true when score >= 50
 * @property {Object} verification - SMTP verification summary (when run)
 */

/**
 * @typedef {Object} ScraperLead
 * @property {string} [name]
 * @property {string} [website]
 * @property {string} [email]
 * @property {string[]} [emails]
 * @property {string} [phone]
 * @property {string} [address]
 * @property {string} [city]
 * @property {string} [state]
 * @property {number|null} [rating]
 * @property {number|null} [reviews]
 * @property {number} [ratingCount]
 * @property {string} [openStatus]
 * @property {string} [category]
 * @property {string} [priceLevel]
 * @property {string} [description]
 * @property {Record<string, string>} [socialLinks]
 * @property {string} [emailStatus]
 * @property {string} [platform]
 * @property {number} [qualityScore]
 * @property {string} [qualityGrade]
 * @property {string} [qualityTier]
 * @property {string[]} [qualityReasons]
 */

/**
 * @typedef {Object} VerificationResult
 * @property {boolean} valid
 * @property {boolean} [roleBased]
 * @property {boolean} [disposable]
 * @property {boolean} [mxValid]
 * @property {string} [reason]
 */

/* ------------------------------------------------------------------ */
/*  Core scoring                                                      */
/* ------------------------------------------------------------------ */

/**
 * Score a scraped business lead for pre-send quality.
 * @param {ScraperLead} lead
 * @param {{ verification?: VerificationResult }} [options]
 * @returns {QualityVerdict}
 */
function scoreLead(lead, options) {
  let score = 0;
  /** @type {string[]} */
  const reasons = [];

  const email = (lead.email || (lead.emails && lead.emails[0]) || '').trim().toLowerCase();
  const hasEmail = email.length > 0;

  /* ── Establishment signals (Google Maps data) ─────────────────── */
  const rating = typeof lead.rating === 'number' ? lead.rating : null;
  const reviews = typeof lead.reviews === 'number' ? lead.reviews : (typeof lead.ratingCount === 'number' ? lead.ratingCount : null);

  if (reviews !== null && reviews >= MIN_REVIEWS_ESTABLISHED) {
    score += 15;
    reasons.push(`Established business (${reviews} reviews)`);
  } else if (reviews !== null && reviews > 0) {
    score += 8;
    reasons.push(`Newer business (${reviews} reviews)`);
  } else if (rating === null) {
    reasons.push('No review data (fresh or hidden listing)');
  }

  if (rating !== null && rating >= 4.5) {
    score += 8;
    reasons.push(`Highly rated (${rating})`);
  } else if (rating !== null && rating >= 4.0) {
    score += 4;
    reasons.push(`Well rated (${rating})`);
  } else if (rating !== null && rating < 3.0) {
    score -= 5;
    reasons.push(`Low rating (${rating})`);
  }

  if (lead.openStatus && lead.openStatus.toLowerCase().includes('open')) {
    score += 5;
    reasons.push('Currently open (active business)');
  } else if (lead.openStatus && /closed|permanently/i.test(lead.openStatus)) {
    score -= 15;
    reasons.push(`Business closed (${lead.openStatus})`);
  }

  if (lead.phone && lead.phone.replace(/\D/g, '').length >= 7) {
    score += 5;
    reasons.push('Verified phone number');
  }

  if (lead.category && lead.category.trim().length > 0) {
    score += 3;
  }

  /* ── Website & email extraction quality ───────────────────────── */
  const hasWebsite = !!(lead.website && lead.website.trim().length > 0);
  if (hasWebsite) {
    score += 10;
    reasons.push('Has business website');
  } else {
    reasons.push('No website (no warm-up path available)');
  }

  /* Platform detection means the website rendered and was identifiable */
  if (lead.platform && lead.platform !== 'Unknown' && lead.platform !== 'Other') {
    score += 5;
    reasons.push(`Website platform detected (${lead.platform})`);
  }

  /* Social presence — businesses with socials are more reachable */
  const socials = lead.socialLinks || {};
  const socialCount = Object.keys(socials).filter(k => socials[k] && String(socials[k]).length > 0).length;
  if (socialCount >= 2) {
    score += 5;
    reasons.push(`Active on ${socialCount}+ social platforms`);
  } else if (socialCount === 1) {
    score += 2;
    reasons.push('Social media presence');
  }

  /* ── Email safety signals ─────────────────────────────────────── */
  if (!hasEmail) {
    score -= 20;
    reasons.push('No email found — cannot outreach yet');
  } else {
    const [local] = email.split('@');
    if (local && ROLE_BASED_PREFIXES.includes(local)) {
      score -= 15;
      reasons.push('Shared/role mailbox (lower reply rate)');
    } else {
      score += 10;
      reasons.push('Non-role email (likely owner/staff)');
    }
  }

  /* ── SMTP verification (optional, via options.verification) ───── */
  const v = options && options.verification;
  if (v) {
    if (v.valid && !v.disposable) {
      score += 15;
      reasons.push('Email verified (syntax + MX + SMTP)');
    } else if (v.valid === false && v.disposable) {
      score -= 25;
      reasons.push(v.reason || 'Disposable email domain');
    } else if (v.valid === false && v.roleBased) {
      /* Role-based is already penalized above; verify confirms it */
      reasons.push('Shared mailbox confirmed');
    } else if (v.valid === false) {
      score -= 25;
      reasons.push(v.reason || 'Email failed verification');
    }
  }

  /* ── Final clamp + grade ──────────────────────────────────────── */
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';
  const tier = grade === 'A' || grade === 'B' ? 'A' : grade === 'C' ? 'B' : grade === 'D' ? 'C' : 'D';

  return {
    score,
    grade,
    tier,
    reasons,
    shouldOutreach: score >= 50 && hasEmail,
    verification: v || { valid: false },
  };
}

/**
 * Full pipeline: SMTP-verify the lead's email, then score it.
 * Falls back to a syntax-only check when the verifier is unreachable.
 * @param {ScraperLead} lead
 * @returns {Promise<QualityVerdict>}
 */
async function verifyWithScoring(lead) {
  const email = (lead.email || (lead.emails && lead.emails[0]) || '').trim();
  /** @type {VerificationResult} */
  let verification;
  if (email) {
    try {
      const result = await verifyEmail(email);
      const reasonStr = result && result.reason ? String(result.reason) : '';
      verification = {
        valid: Boolean(result && result.valid),
        roleBased: /role-based/i.test(reasonStr),
        disposable: /disposable/i.test(reasonStr),
        mxValid: Boolean(result && result.valid) || /active MX record/i.test(reasonStr),
        reason: reasonStr || undefined,
      };
    } catch (err) {
      console.warn(`\u26A0\uFE0F  Lead quality: SMTP verify skipped for ${email} (${errOf(err).message})`);
      verification = {
        valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        roleBased: ROLE_BASED_PREFIXES.includes(email.split('@')[0] || ''),
        disposable: false,
        mxValid: false,
        reason: 'Verification unavailable (syntax-only check)',
      };
    }
  } else {
    verification = { valid: false, roleBased: false, disposable: false, mxValid: false, reason: 'No email' };
  }

  const verdict = scoreLead(lead, { verification });

  lead.qualityScore = verdict.score;
  lead.qualityGrade = verdict.grade;
  lead.qualityTier = verdict.tier;
  lead.qualityReasons = verdict.reasons;

  return verdict;
}

module.exports = { scoreLead, verifyWithScoring };
