'use strict';

const { ownerEmailCandidates } = require('./emails');
const { slug } = require('../master-research');

const TIERS = {
  A: 'A_PUBLISHED_OWNER_NEEDS_VERIFICATION',
  B: 'B_NEEDS_EMAIL_VERIFICATION',
  C: 'C_OWNER_FOUND_NO_WORKING_EMAIL',
  D: 'D_QUALIFIED_NO_OWNER_FOUND',
  X: 'X_EXCLUDED',
  U: 'U_UNRESOLVED',
};
const PERSONAL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com']);
const RETRYABLE_UNRESOLVED = new Set(['timeout', 'unreachable', 'blocked', 'http-error', 'robots-unreachable', 'internal-error', 'dns-dead']);

function brandTokens(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(s => s.length >= 4 && !/^(?:furniture|store|stores|outlet|design|designs|home|homes|decor|shop|company|interiors|interior|llc|inc|gallery|collection)$/.test(s));
}

function identityOk(business, job, assess) {
  const tokens = brandTokens(business.name);
  if (!tokens.length) return assess.identityTitleMatch;
  const domain = (job.probe?.finalDomain || '').replace(/[^a-z0-9]/g, '');
  return assess.identityTitleMatch || tokens.some(t => domain.includes(t.replace(/[^a-z0-9]/g, '')));
}

function ownersOf(assess) {
  const seen = new Map();
  for (const o of assess.owners.filter(x => !x.historical)) if (!seen.has(slug(o.name))) seen.set(slug(o.name), o);
  return [...seen.values()];
}

// One decision per business. Every outcome carries the reasons and evidence behind it.
function decide({ business, job, assess, commerce, mailboxes = {}, smtpEnabled = true }) {
  const reasons = [], flags = [];
  const state = job?.state || 'pending';
  const result = { businessId: business.id, name: business.name, website: business.website, domain: job?.probe?.finalDomain || '', state, tier: '', reasons, flags, owners: [], candidates: [], bestEmail: null, fallbackContacts: [], commerce: commerce || null, nextAction: '', sendApproved: false, mailboxVerified: false, currentOwnershipConfirmed: false, independentBusinessConfirmed: false };
  if (!job || (!job.final && job.state !== 'done')) { result.tier = TIERS.U; reasons.push('research-not-finished'); result.nextAction = 'resume-pipeline'; return result; }
  if (job.needsCommerceRefresh) { result.tier = TIERS.U; reasons.push('commerce-evidence-needs-current-version-refresh'); result.nextAction = 'resume-pipeline'; return result; }
  if (assess.excludedReasons.length) { result.tier = TIERS.X; reasons.push(...assess.excludedReasons); result.nextAction = 'none'; return result; }
  if (state === 'excluded-known-chain') { result.tier = TIERS.X; reasons.push('known-chain-or-enterprise'); return result; }
  if (state === 'invalid-website') { result.tier = TIERS.X; reasons.push('no-usable-website'); return result; }
  if (state === 'dns-dead' && job.final) { result.tier = TIERS.X; reasons.push('domain-does-not-resolve'); return result; }
  if (state === 'parked') { result.tier = TIERS.X; reasons.push('parked-or-coming-soon'); return result; }
  if (state !== 'done') {
    result.tier = TIERS.U; reasons.push(state + (job.probe?.detail ? ' (' + job.probe.detail + ')' : ''));
    if (RETRYABLE_UNRESOLVED.has(state) && job.final) reasons.push('retries-exhausted');
    result.nextAction = ['robots-disallowed', 'crawl-delay-too-long', 'tls-broken', 'blocked', 'browser-or-manual-review-needed'].includes(state) ? 'manual-or-browser-review' : 'retry-later';
    return result;
  }
  const crawlStatus = job.crawl?.status;
  if (crawlStatus === 'parked-or-coming-soon') { result.tier = TIERS.X; reasons.push('parked-or-coming-soon'); return result; }
  const ecommerce = commerce?.ecommerce || 'none', niche = commerce?.niche || 'none';
  if (!['confirmed', 'likely'].includes(ecommerce)) { result.tier = TIERS.U; reasons.push(ecommerce === 'catalog-only' ? 'online-purchasing-not-established' : 'ecommerce-not-established'); result.nextAction = 'review-storefront-or-another-public-source'; return result; }
  if (!['confirmed', 'likely'].includes(niche)) { result.tier = niche === 'off-topic' ? TIERS.X : TIERS.U; reasons.push(niche === 'off-topic' ? 'catalogue-products-outside-target-niche' : 'furniture-decor-not-established'); result.nextAction = niche === 'off-topic' ? 'none' : 'review-product-categories'; return result; }
  if (job.probe?.domainChanged) flags.push('website-redirects-to-different-domain');
  const identity = identityOk(business, job, assess) && !job.probe?.domainChanged;
  if (!identity) flags.push('business-identity-needs-review');
  flags.push('current-ownership-and-independence-need-review');
  if (!assess.sizeEvidence) flags.push('business-size-not-established');
  if (commerce?.ecommerce === 'likely') flags.push('online-purchasing-needs-review');
  result.fallbackContacts = assess.contacts.filter(c => c.department && !c.unrelatedDomain).map(c => c.email).slice(0, 5);
  const owners = ownersOf(assess);
  result.owners = owners.map(o => ({ name: o.name, role: o.role || '', evidenceUrl: o.sourceUrl, evidenceKind: o.kind, snippet: String(o.snippet || '').slice(0, 300) }));
  if (!owners.length) { result.tier = TIERS.D; reasons.push('qualified-store-owner-not-published'); result.nextAction = 'manual-owner-research'; return result; }
  const candidates = ownerEmailCandidates({ owners, contacts: assess.contacts, siteDomain: job.probe.finalDomain, storedEmails: business.emails || [], personalDomains: PERSONAL })
    .map(c => ({ ...c, smtp: mailboxes[c.email] || null }));
  result.candidates = candidates;
  const status = c => c.smtp?.status || (smtpEnabled ? 'not-probed' : 'smtp-disabled');
  const usable = candidates.filter(c => status(c) !== 'rejected' && status(c) !== 'no-mx');
  const published = usable.filter(c => c.via === 'published');
  const inferred = usable.filter(c => c.via === 'inferred');
  for (const c of candidates) if (c.via === 'published' && status(c) === 'rejected') flags.push('published-email-rejected-by-mail-server:' + c.email);
  const best = published[0] || inferred[0] || usable[0] || null;
  if (best?.via === 'published' && identity) {
    result.tier = TIERS.A; result.bestEmail = { email: best.email, ownerName: best.ownerName, proof: 'published-person-email-association', smtpStatus: status(best), evidenceUrl: best.evidenceUrl, emailSourceUrl: best.emailSourceUrl, ownerSourceUrl: best.ownerSourceUrl };
    reasons.push('store-candidate', 'owner-named-on-site', 'owner-email-published', 'paid-verification-required');
    result.nextAction = 'paid-verification-and-owner-business-review';
    return result;
  }
  if (usable.length) {
    result.tier = TIERS.B; result.bestEmail = { email: (best || usable[0]).email, ownerName: (best || usable[0]).ownerName, proof: 'unverified-candidate', smtpStatus: status(best || usable[0]), evidenceUrl: (best || usable[0]).evidenceUrl };
    reasons.push('qualified-store', 'owner-named-on-site', !identity ? 'identity-needs-review' : best?.via === 'derived' ? 'address-is-a-generated-pattern' : 'owner-email-association-needs-independent-evidence');
    result.nextAction = best?.via === 'derived' ? 'email-finder-or-independent-owner-email-evidence' : 'review-inference-then-paid-verification';
    return result;
  }
  result.tier = TIERS.C; reasons.push('qualified-store', 'owner-named-on-site', 'every-candidate-address-rejected-or-no-mail-server');
  result.nextAction = 'email-finder-or-manual';
  return result;
}

module.exports = { decide, TIERS, ownersOf, identityOk, RETRYABLE_UNRESOLVED };
