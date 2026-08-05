const test = require('node:test');
const assert = require('node:assert');
const { auditWebsite } = require('../websiteAuditor');
const { evaluateLead } = require('../leadQualityEngine');
const { runPreflightAndSimulation } = require('../campaignSimulator');
const { getProposalTemplate } = require('../proposalTemplates');
const { matchLead } = require('../portfolioMatcher');

test('Tier 6 - High-ROI Freelancer Additions Unit Tests', async (t) => {
  await t.test('1. Website Auditor handles malformed or empty URLs safely', async () => {
    const res = await auditWebsite('');
    assert.strictEqual(res.score, 50, 'Empty URL should return default 50 score');
    assert.ok(res.problems.length > 0, 'Should include error problem explanation');
  });

  await t.test('2. Lead Quality Engine computes Opportunity Score and Badge', async () => {
    const lead = {
      businessName: 'Austin Decor',
      platform: 'Shopify',
      city: 'Austin',
      website: 'example.com',
      email: 'owner@example.com'
    };
    const res = await evaluateLead(lead);
    assert.ok(res.opportunityScore >= 30, 'Opportunity score should be >= baseline 30');
    assert.strictEqual(typeof res.priorityBadge, 'string', 'Badge must be a string');
  });

  await t.test('3. Campaign Simulator & Preflight calculates projected duration', () => {
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

  await t.test('4. Proposal Templates generate tailored 1-click draft', () => {
    const tmpl = getProposalTemplate('landing_page');
    const draft = tmpl.generateDraft({ name: 'Alex', company: 'Apex Decor', price: '$2,000' });
    assert.ok(draft.includes('Alex'), 'Draft should include client name');
    assert.ok(draft.includes('Apex Decor'), 'Draft should include company name');
    assert.ok(draft.includes('$2,000'), 'Draft should include custom price');
  });

  await t.test('5. Portfolio Matcher returns matching case study and snippet', () => {
    const match = matchLead({ platform: 'Shopify', businessName: 'Shopify Brand' });
    assert.strictEqual(match.platform, 'Shopify', 'Match should match platform');
    assert.ok(match.caseStudyTitle.length > 5, 'Case study title should be present');
    assert.ok(match.recommendationSnippet.includes(match.caseStudyTitle), 'Snippet should contain case study title');
  });
});
