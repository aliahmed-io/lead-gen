const test = require('node:test');
const assert = require('node:assert');
const { calculateZScore, calculatePValue, checkStatisticalSignificance } = require('../abTesting');
const { generatePersonalizedOpener } = require('../personalizer');
const { isWithinBusinessHours, isWeekday } = require('../timeUtils');

test('Tier 5 - Instantly Operational Parity Unit Tests', async (t) => {
  await t.test('1. Two-Proportion Z-Test: Equal performance does not promote', () => {
    const res = checkStatisticalSignificance(10, 50, 10, 50);
    assert.strictEqual(res.isSignificant, false, 'Equal performance should not be significant');
  });

  await t.test('2. Two-Proportion Z-Test: Small sample size (<30) does not promote', () => {
    // 5/15 vs 1/15 might be a large difference, but sample size is 15 (<30)
    const res = checkStatisticalSignificance(5, 15, 1, 15);
    assert.strictEqual(res.isSignificant, false, 'Sample size under 30 must not promote');
  });

  await t.test('3. Two-Proportion Z-Test: Significant difference with N >= 30 promotes', () => {
    // 25/50 (50%) vs 5/50 (10%) with N=50 each -> Z = 4.47, p < 0.0001
    const res = checkStatisticalSignificance(25, 50, 5, 50);
    assert.strictEqual(res.isSignificant, true, 'High significance with N >= 30 must be marked significant');
    assert.ok(res.zScore >= 1.96, 'Z score must be >= 1.96');
    assert.ok(res.pValue < 0.05, 'p-value must be < 0.05');
  });

  await t.test('4. AI Personalizer generates non-empty personalized opener', () => {
    const lead = { businessName: 'Austin Decor', platform: 'Shopify', city: 'Austin', state: 'TX' };
    const opener = generatePersonalizedOpener(lead);
    assert.ok(opener && opener.length > 20, 'Generated opener must be non-empty string');
    assert.ok(opener.includes('Shopify') || opener.includes('Austin'), 'Opener should include platform or city context');
  });

  await t.test('5. Time Utils: Weekday and Business hours check', () => {
    const weekday = isWeekday();
    assert.strictEqual(typeof weekday, 'boolean', 'isWeekday must return boolean');

    const bizHours = isWithinBusinessHours(9, 17);
    assert.ok(typeof bizHours.valid === 'boolean', 'isWithinBusinessHours must return valid property');
  });
});
