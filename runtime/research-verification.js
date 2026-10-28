'use strict';
const { csv, sha } = require('./master-research');

function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  const source = String(text).replace(/^\uFEFF/, '');
  if (source.length > 30 * 1024 * 1024) throw new Error('Verification report exceeds 30 MB');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"' && quoted && source[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"' && (quoted || cell === '')) quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && source[i + 1] === '\n') i++; row.push(cell); if (row.some(c => c.trim())) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  if (cell || row.length) { row.push(cell); if (row.some(c => c.trim())) rows.push(row); }
  return rows;
}
function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase().replace(/[ _]/g, '-');
  if (['valid', 'deliverable', 'verified', 'ok'].includes(status)) return 'valid';
  if (['invalid', 'undeliverable', 'do-not-mail', 'spamtrap', 'abuse', 'disposable'].includes(status)) return 'invalid';
  if (['catch-all', 'catchall', 'accept-all', 'risky', 'risky-email'].includes(status)) return 'risky';
  return 'unknown';
}
function reconcile(results, reportText, { provider, verifiedAt, now = Date.now() }) {
  if (!provider || typeof provider !== 'string' || provider.length > 100) throw new Error('Supply the actual verification-provider name');
  const stamp = Date.parse(verifiedAt);
  if (!Number.isFinite(stamp) || stamp > now + 300000) throw new Error('Supply the actual verification date; future dates are not accepted');
  const fresh = now - stamp <= 30 * 86400000;
  const rows = parseCsv(reportText); if (rows.length < 2) throw new Error('Verification report must contain a header and results');
  const key = s => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const headers = rows.shift().map(key);
  const emailIndex = headers.findIndex(h => ['email', 'emailaddress', 'emailid'].includes(h));
  const statusIndex = headers.findIndex(h => ['status', 'result', 'verificationstatus', 'emailstatus', 'zerobouncestatus', 'verificationresult'].includes(h));
  if (emailIndex < 0 || statusIndex < 0) throw new Error('CSV needs email and status/result columns');
  const original = new Map((results.ownerCandidates || []).map(c => [c.email.toLowerCase(), c]));
  const reports = new Map(), unmatchedEmails = [];
  for (const row of rows) {
    const email = String(row[emailIndex] || '').trim().toLowerCase(); if (!email) continue;
    if (!original.has(email)) { unmatchedEmails.push(email); continue; }
    if (!reports.has(email)) reports.set(email, []);
    reports.get(email).push({ normalized: normalizeStatus(row[statusIndex]), original: String(row[statusIndex] || '').slice(0, 150) });
  }
  const contacts = [...original.values()].map(c => {
    const records = reports.get(c.email) || [];
    const states = [...new Set(records.map(r => r.normalized))];
    const conflict = states.length > 1;
    const externalStatus = states.length === 1 ? states[0] : 'unknown';
    const accepted = Boolean(records.length && fresh && !conflict && externalStatus === 'valid' && c.evidenceTier === 'published-owner-email-candidate' && c.freeMailRoutingCheck?.status === 'mail-routing-found');
    return { ...c, externalVerification: { provider, verifiedAt: new Date(stamp).toISOString(), status: externalStatus, fresh, conflict, originalResults: records.map(r => r.original), reportSha256: sha(reportText), suppliedReport: true }, passedPaidVerification: accepted, sendApproved: false, remainingRequirements: ['Confirm the exact person is the current owner', 'Confirm independent small/medium business size', 'Complete application launch and mailbox checks'] };
  });
  return { provider, verifiedAt: new Date(stamp).toISOString(), reportSha256: sha(reportText), contacts, unmatchedEmails: [...new Set(unmatchedEmails)], counts: { knownCandidates: contacts.length, reportMatches: reports.size, unmatchedReportEmails: new Set(unmatchedEmails).size, passedPaidVerification: contacts.filter(c => c.passedPaidVerification).length, conflictingResults: contacts.filter(c => c.externalVerification.conflict).length, sendApproved: 0 } };
}
function verifiedCsv(output) {
  return csv(['email', 'owner_name', 'businesses', 'business_ids', 'email_source_url', 'owner_source_url', 'verification_provider', 'verified_at', 'verification_status', 'send_approved'], output.contacts.filter(c => c.passedPaidVerification).map(c => [c.email, c.ownerBinding.name, c.businesses, c.businessIds, c.sourceUrl, c.ownerBinding.sourceUrl, output.provider, output.verifiedAt, c.externalVerification.status, 'no']));
}
module.exports = { parseCsv, normalizeStatus, reconcile, verifiedCsv };
