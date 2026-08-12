const test = require('node:test');
const assert = require('node:assert');
const { auditWebsite } = require('../websiteAuditor');
const { runPreflightAndSimulation } = require('../campaignSimulator');
const CONFIG = require('../config');

test('Tier 6 - High-ROI Freelancer Additions Unit Tests', async (t) => {
  await t.test('1. Website Auditor handles malformed or empty URLs safely', async () => {
    const res = await auditWebsite('');
    assert.strictEqual(res.score, 50, 'Empty URL should return default 50 score');
    assert.ok(res.problems.length > 0, 'Should include error problem explanation');
  });

  await t.test('2. Campaign Simulator & Preflight calculates projected duration', () => {
    const leads = [
      { email: 'test1@example.com', businessName: 'A', city: 'Austin' },
      { email: 'test2@example.com', businessName: 'B', city: 'Dallas' }
    ];
    const accounts = [{ id: 1, email: 'sender@domain.com', healthScore: 'good', bounceRate: 0.01 }];
    const res = runPreflightAndSimulation({ leads, accounts, dailyLimit: 30 });
    assert.strictEqual(res.validation.valid, true, 'Preflight validation should pass');
    assert.ok(res.simulation.totalProjectedSends > 0, 'Simulation should project total sends');
    assert.strictEqual(typeof res.simulation.estimatedCompletionDate, 'string', 'Should return formatted completion date');
  });
});
