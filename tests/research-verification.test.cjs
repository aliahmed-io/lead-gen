'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { parseCsv, normalizeStatus, reconcile } = require('../runtime/research-verification');
const fixture = { ownerCandidates: [{ email: 'jane@oakstudio.test', evidenceTier: 'published-owner-email-candidate', ownerBinding: { name: 'Jane Smith' }, freeMailRoutingCheck: { status: 'mail-routing-found' } }] };
const now = Date.parse('2026-10-28T12:00:00Z');
const options = { provider: 'Fixture verifier', verifiedAt: '2026-10-28T10:00:00Z', now };
test('CSV parser preserves commas, escaped quotes and multiline evidence', () => {
  assert.deepEqual(parseCsv('email,status,note\r\n"a@b.test",valid,"a, b\n""quoted"""'), [['email', 'status', 'note'], ['a@b.test', 'valid', 'a, b\n"quoted"']]);
});
test('paid valid results match only known emails and do not approve outreach', () => {
  const result = reconcile(fixture, 'email,status\njane@oakstudio.test,valid\noutsider@other.test,valid', options);
  assert.equal(result.counts.passedPaidVerification, 1); assert.equal(result.counts.sendApproved, 0); assert.equal(result.counts.unmatchedReportEmails, 1);
});
test('catch-all and unknown results remain held', () => {
  for (const status of ['catch-all', 'unknown', 'unrecognized']) assert.equal(reconcile(fixture, 'email,status\njane@oakstudio.test,' + status, options).counts.passedPaidVerification, 0);
  assert.equal(normalizeStatus('accept_all'), 'risky');
});
test('conflicting duplicate verification rows remain held', () => {
  const result = reconcile(fixture, 'email,status\njane@oakstudio.test,valid\njane@oakstudio.test,invalid', options);
  assert.equal(result.counts.passedPaidVerification, 0); assert.equal(result.counts.conflictingResults, 1);
});
test('stale dates and weaker owner evidence cannot become accepted', () => {
  assert.equal(reconcile(fixture, 'email,status\njane@oakstudio.test,valid', { ...options, verifiedAt: '2026-08-01' }).counts.passedPaidVerification, 0);
  assert.equal(reconcile({ ownerCandidates: [{ ...fixture.ownerCandidates[0], evidenceTier: 'owner-email-needs-review' }] }, 'email,status\njane@oakstudio.test,valid', options).counts.passedPaidVerification, 0);
});
test('future dates and malformed reports fail without changing inputs', () => {
  assert.throws(() => reconcile(fixture, 'email,status\na@b.test,valid', { ...options, verifiedAt: '2026-11-01' }));
  assert.throws(() => parseCsv('email,status\n"unterminated,valid'));
  assert.throws(() => reconcile(fixture, 'name,note\nJohn,valid', options));
});
