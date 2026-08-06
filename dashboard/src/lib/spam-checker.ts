/**
 * Deliverability & SpamAssassin Rule Inspector.
 * Analyzes email subject, body content, and domain DNS health to calculate a Spam Score.
 */

export interface SpamCheckRequest {
  email?: string;
  domain?: string;
  subject?: string;
  body?: string;
}

export interface SpamCheckRuleResult {
  rule: string;
  score: number; // positive = spam penalty, negative = good bonus
  description: string;
  passed: boolean;
}

export interface SpamCheckReport {
  score: number; // 0 to 100 deliverability health score (100 = perfect)
  spamAssassinRating: number; // 0.0 to 10.0 (lower is better, >5.0 is spam)
  ratingLabel: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' | 'SPAM_RISK';
  rules: SpamCheckRuleResult[];
  recommendations: string[];
}

const SPAM_TRIGGER_WORDS = [
  'free', 'guaranteed', '100%', 'click here', 'buy now', 'risk free', 'make money',
  'act now', 'urgent', 'no obligation', 'winner', 'cash', 'earn $', 'credit card',
  'congratulations', 'no cost', 'order now', 'unlimited', 'special promotion',
  'pure profit', 'double your', 'save big', 'exclusive deal', 'investment'
];

export function analyzeSpamScore(input: SpamCheckRequest, dnsStatus?: { spf: boolean; dkim: boolean; dmarc: boolean }): SpamCheckReport {
  const rules: SpamCheckRuleResult[] = [];
  const recommendations: string[] = [];

  const subject = input.subject || '';
  const body = input.body || '';
  const fullText = `${subject} ${body}`.toLowerCase();

  // 1. Trigger Words Check
  const foundWords = SPAM_TRIGGER_WORDS.filter(w => fullText.includes(w));
  if (foundWords.length > 0) {
    const penalty = Math.min(3.5, foundWords.length * 0.8);
    rules.push({
      rule: 'SPAM_TRIGGER_WORDS',
      score: penalty,
      description: `Contains ${foundWords.length} spam trigger word(s): "${foundWords.slice(0, 3).join(', ')}"`,
      passed: false
    });
    recommendations.push(`Remove spam trigger words like "${foundWords.slice(0, 2).join('", "')}" from your copy.`);
  } else {
    rules.push({
      rule: 'SPAM_TRIGGER_WORDS',
      score: 0,
      description: 'No common spam trigger words detected in copy',
      passed: true
    });
  }

  // 2. All CAPS Subject Line
  if (subject && subject === subject.toUpperCase() && subject.replace(/[^A-Z]/g, '').length > 5) {
    rules.push({
      rule: 'ALL_CAPS_SUBJECT',
      score: 1.5,
      description: 'Subject line is in ALL CAPS',
      passed: false
    });
    recommendations.push('Avoid using ALL CAPS in the subject line.');
  } else {
    rules.push({
      rule: 'ALL_CAPS_SUBJECT',
      score: 0,
      description: 'Subject line uses normal casing',
      passed: true
    });
  }

  // 3. Excessive Exclamation / Question Marks
  const puncCount = (subject.match(/[!]{2,}/g) || []).length + (body.match(/[!]{2,}/g) || []).length;
  if (puncCount > 0) {
    rules.push({
      rule: 'EXCESSIVE_PUNCTUATION',
      score: 1.2,
      description: 'Contains repeated exclamation marks (!!)',
      passed: false
    });
    recommendations.push('Use single exclamation marks instead of multiple (!!).');
  } else {
    rules.push({
      rule: 'EXCESSIVE_PUNCTUATION',
      score: 0,
      description: 'Punctuation usage is clean',
      passed: true
    });
  }

  // 4. CAN-SPAM Unsubscribe Link / Opt-out Option
  const hasUnsub = fullText.includes('unsubscribe') || fullText.includes('opt out') || fullText.includes('opt-out') || fullText.includes('stop emails');
  if (!hasUnsub && body.length > 50) {
    rules.push({
      rule: 'NO_UNSUBSCRIBE_LINK',
      score: 2.0,
      description: 'No explicit unsubscribe or opt-out mechanism detected',
      passed: false
    });
    recommendations.push('Include a clear unsubscribe link or opt-out line to comply with CAN-SPAM.');
  } else {
    rules.push({
      rule: 'NO_UNSUBSCRIBE_LINK',
      score: 0,
      description: 'Opt-out mechanism / unsubscribe link present',
      passed: true
    });
  }

  // 5. Short URLs Check
  if (fullText.includes('bit.ly') || fullText.includes('tinyurl.com') || fullText.includes('ow.ly')) {
    rules.push({
      rule: 'DANGEROUS_SHORT_URL',
      score: 2.5,
      description: 'Contains short URL shortener domain (bit.ly / tinyurl)',
      passed: false
    });
    recommendations.push('Avoid link shorteners like bit.ly as they trigger spam filters.');
  } else {
    rules.push({
      rule: 'DANGEROUS_SHORT_URL',
      score: 0,
      description: 'No link shorteners detected',
      passed: true
    });
  }

  // 6. DNS Records Checks (SPF, DKIM, DMARC)
  if (dnsStatus) {
    if (!dnsStatus.spf) {
      rules.push({ rule: 'SPF_RECORD_CHECK', score: 2.5, description: 'SPF record missing or failing', passed: false });
      recommendations.push('Publish a valid SPF record in your domain DNS.');
    } else {
      rules.push({ rule: 'SPF_RECORD_CHECK', score: 0, description: 'SPF record published & valid', passed: true });
    }

    if (!dnsStatus.dkim) {
      rules.push({ rule: 'DKIM_RECORD_CHECK', score: 2.0, description: 'DKIM signature record missing or failing', passed: false });
      recommendations.push('Publish a valid DKIM record (google._domainkey) in your domain DNS.');
    } else {
      rules.push({ rule: 'DKIM_RECORD_CHECK', score: 0, description: 'DKIM signature record published & valid', passed: true });
    }

    if (!dnsStatus.dmarc) {
      rules.push({ rule: 'DMARC_RECORD_CHECK', score: 1.5, description: 'DMARC record missing', passed: false });
      recommendations.push('Publish a valid DMARC record in your domain DNS.');
    } else {
      rules.push({ rule: 'DMARC_RECORD_CHECK', score: 0, description: 'DMARC policy active & valid', passed: true });
    }
  }

  // Calculate total SpamAssassin Rating (0.0 to 10.0)
  const totalPenalty = rules.reduce((sum, r) => sum + r.score, 0);
  const spamAssassinRating = Math.min(10.0, Math.max(0.0, parseFloat(totalPenalty.toFixed(1))));

  // Overall Health Score (0 to 100)
  const score = Math.max(0, Math.min(100, Math.round(100 - spamAssassinRating * 10)));

  let ratingLabel: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' | 'SPAM_RISK' = 'EXCELLENT';
  if (spamAssassinRating > 5.0) ratingLabel = 'SPAM_RISK';
  else if (spamAssassinRating > 3.0) ratingLabel = 'POOR';
  else if (spamAssassinRating > 1.5) ratingLabel = 'MODERATE';
  else if (spamAssassinRating > 0.5) ratingLabel = 'GOOD';

  return {
    score,
    spamAssassinRating,
    ratingLabel,
    rules,
    recommendations
  };
}
