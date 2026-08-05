'use strict';

/**
 * Calculates a 0-100 engagement score for a lead based on their activity.
 * @param {object} record - Campaign lead record
 * @returns {number} Score from 0 to 100
 */
function calculateLeadScore(record) {
  if (!record) return 0;

  // Disqualified statuses get 0
  if (['bounced', 'unsubscribed', 'failed'].includes(record.status)) {
    return 0;
  }

  let score = 0;

  // Opens (max 30 pts)
  const openCount = record.openCount || (record.openedAt ? 1 : 0);
  if (openCount >= 1) {
    score += 10 + Math.min(20, (openCount - 1) * 5);
  }

  // Clicks (max 50 pts)
  const clickCount = record.clickCount || (record.clickedAt ? 1 : 0);
  if (clickCount >= 1) {
    score += 25 + Math.min(25, (clickCount - 1) * 10);
  }

  // Reply / Sentiment (max 75 pts, min -30 pts)
  if (record.repliedAt || record.status === 'interested') {
    if (record.sentiment === 'positive' || record.intent === 'meeting_requested') {
      score += 75;
    } else if (record.sentiment === 'negative' || record.status === 'completed_no_interest') {
      score -= 30;
    } else {
      score += 40; // Default reply without explicit negative sentiment
    }
  }

  // Penalties
  const softBounces = record.softBounceCount || 0;
  score -= softBounces * 15;

  // Clamp score between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { calculateLeadScore };
