'use strict';

const MIN_SAMPLE_PER_VARIANT = 30; // Minimum 30 sends per variant required
const Z_SCORE_THRESHOLD = 1.96;     // 95% confidence level (p < 0.05)

/**
 * Calculates two-proportion Z-score.
 * Z = (p1 - p2) / sqrt( p * (1 - p) * (1/n1 + 1/n2) )
 * where p = (x1 + x2) / (n1 + n2)
 *
 * @param {number} x1 - Successes in variant 1 (e.g. replies)
 * @param {number} n1 - Total trials in variant 1 (e.g. sends)
 * @param {number} x2 - Successes in variant 2
 * @param {number} n2 - Total trials in variant 2
 * @returns {number} Calculated Z-score
 */
function calculateZScore(x1, n1, x2, n2) {
  if (n1 <= 0 || n2 <= 0) return 0;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);

  if (p === 0 || p === 1) return 0;

  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;

  return (p1 - p2) / se;
}

/**
 * Approximate p-value from Z-score using error function approximation.
 * @param {number} z
 * @returns {number} p-value (two-tailed)
 */
function calculatePValue(z) {
  const absZ = Math.abs(z);
  // Approximation of standard normal CDF
  const t = 1 / (1 + 0.2316419 * absZ);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ) * poly;
  return 2 * (1 - cdf);
}

/**
 * Checks if a variant pair has reached statistical significance.
 * @param {number} x1 - Successes in variant 1
 * @param {number} n1 - Sends in variant 1
 * @param {number} x2 - Successes in variant 2
 * @param {number} n2 - Sends in variant 2
 * @returns {{ isSignificant: boolean, zScore: number, pValue: number }}
 */
function checkStatisticalSignificance(x1, n1, x2, n2) {
  if (n1 < MIN_SAMPLE_PER_VARIANT || n2 < MIN_SAMPLE_PER_VARIANT) {
    return { isSignificant: false, zScore: 0, pValue: 1.0 };
  }

  const zScore = calculateZScore(x1, n1, x2, n2);
  const pValue = calculatePValue(zScore);
  const isSignificant = Math.abs(zScore) >= Z_SCORE_THRESHOLD;

  return { isSignificant, zScore, pValue };
}

/**
 * Selects an A/B test variant for sending.
 * If a winner has already been promoted, returns the winning variant.
 * Otherwise, balances traffic evenly among non-promoted variants.
 *
 * @param {object} campaignDb
 * @param {string} testId
 * @param {string[]} variants - e.g. ["A", "B"]
 * @returns {string} Selected variant name
 */
function selectVariant(campaignDb, testId, variants = ['A', 'B']) {
  if (!variants || variants.length === 0) return 'A';
  if (variants.length === 1) return variants[0];

  const test = campaignDb.getAbTest(testId);
  if (test && test.promotedWinner && variants.includes(test.promotedWinner)) {
    return test.promotedWinner;
  }

  const counts = (test && test.variants) || {};
  let minSent = Infinity;
  let selected = variants[0];

  for (const v of variants) {
    const sent = counts[v]?.sent || 0;
    if (sent < minSent) {
      minSent = sent;
      selected = v;
    }
  }

  return selected;
}

/**
 * Evaluates an A/B test using Two-Proportion Z-Test and automatically promotes
 * a winning variant ONLY when statistical significance (p < 0.05, Z >= 1.96, N >= 30) is reached.
 *
 * @param {object} campaignDb
 * @param {string} testId
 * @returns {string|null} Winning variant if newly promoted, else null
 */
function evaluateAndPromoteWinner(campaignDb, testId) {
  const test = campaignDb.getAbTest(testId);
  if (!test || test.promotedWinner || !test.variants) return null;

  const variants = Object.keys(test.variants);
  if (variants.length < 2) return null;

  // Verify all variants reached minimum sample size of 30
  for (const v of variants) {
    if ((test.variants[v].sent || 0) < MIN_SAMPLE_PER_VARIANT) {
      return null;
    }
  }

  // Rank variants by reply rate
  const stats = variants.map(v => {
    const sent = test.variants[v].sent || 0;
    const replies = test.variants[v].replies || 0;
    const rate = sent > 0 ? replies / sent : 0;
    return { variant: v, sent, replies, rate };
  }).sort((a, b) => b.rate - a.rate);

  const best = stats[0];
  const second = stats[1];

  const { isSignificant, zScore, pValue } = checkStatisticalSignificance(
    best.replies, best.sent,
    second.replies, second.sent
  );

  if (isSignificant && zScore > 0) {
    console.log(
      `🏆 Statistical A/B Winner Promoted for "${testId}": Variant "${best.variant}" ` +
      `(Z = ${zScore.toFixed(2)}, p = ${pValue.toFixed(4)} < 0.05, N = ${best.sent}+${second.sent})! ` +
      `Reply rate: ${(best.rate * 100).toFixed(1)}% vs ${(second.rate * 100).toFixed(1)}%.`
    );

    if (!campaignDb.data.abTests) campaignDb.data.abTests = {};
    if (!campaignDb.data.abTests[testId]) campaignDb.data.abTests[testId] = { variants: {} };
    campaignDb.data.abTests[testId].promotedWinner = best.variant;
    campaignDb.data.abTests[testId].promotedAt = Date.now();
    campaignDb.data.abTests[testId].zScore = zScore;
    campaignDb.data.abTests[testId].pValue = pValue;

    // Log structured event
    if (typeof campaignDb._logActivity === 'function') {
      campaignDb._logActivity('ab_test_promoted', testId, best.variant);
    }

    campaignDb._maybeSave();
    return best.variant;
  }

  return null;
}

module.exports = {
  calculateZScore,
  calculatePValue,
  checkStatisticalSignificance,
  selectVariant,
  evaluateAndPromoteWinner,
};
