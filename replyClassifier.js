'use strict';

/**
 * Deterministic Rule-Based Reply Classifier
 * Zero-cost, high-speed regex intent classification for cold outreach replies.
 */

const POSITIVE_PATTERNS = [
  /\b(call|zoom|demo|meeting|discuss|talk|schedule|calendar)\b/i,
  /\b(interested|sounds good|send details|pricing|cost|quote|more info)\b/i,
  /\b(yes|sure|absolutely|definitely|let's do it|let us do it)\b/i,
  /\b(available|free next week|what time|when are you free)\b/i,
];

const NEGATIVE_PATTERNS = [
  /\b(not interested|no thanks|pass|stop emailing|remove me|opt out)\b/i,
  /\b(don't email|do not contact|unsubscribe|already have|we use|not looking)\b/i,
  /\b(spam|take me off|never email|busy|bad time)\b/i,
];

class RuleBasedReplyClassifier {
  /**
   * Classifies email reply intent into positive, negative, or neutral.
   *
   * @param {string} textBody - Inbound reply body
   * @param {string} [subject] - Inbound email subject
   * @returns {{ sentiment: 'positive' | 'negative' | 'neutral', intent: string, confidence: number }}
   */
  classify(textBody = '', subject = '') {
    const text = `${subject} ${textBody}`.toLowerCase().trim();

    let posHits = 0;
    let negHits = 0;

    for (const pattern of POSITIVE_PATTERNS) {
      if (pattern.test(text)) posHits++;
    }

    for (const pattern of NEGATIVE_PATTERNS) {
      if (pattern.test(text)) negHits++;
    }

    if (posHits > 0 && negHits === 0) {
      const isMeeting = /\b(call|zoom|demo|meeting|schedule|calendar|available)\b/i.test(text);
      return {
        sentiment: 'positive',
        intent: isMeeting ? 'meeting_requested' : 'info_requested',
        confidence: Math.min(0.95, 0.7 + posHits * 0.1),
      };
    }

    if (negHits > 0 && posHits === 0) {
      return {
        sentiment: 'negative',
        intent: 'not_interested',
        confidence: Math.min(0.95, 0.7 + negHits * 0.1),
      };
    }

    return {
      sentiment: 'neutral',
      intent: 'general_query',
      confidence: 0.60,
    };
  }
}

const defaultClassifier = new RuleBasedReplyClassifier();

module.exports = {
  RuleBasedReplyClassifier,
  classifySentiment: (textBody, subject) => defaultClassifier.classify(textBody, subject),
};
