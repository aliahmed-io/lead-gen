'use strict';

const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');

// Common business address shapes for a named owner, most frequent first.
function namePatterns(fullName) {
  const parts = String(fullName || '').split(/\s+/).map(fold).filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0], last = parts[parts.length - 1];
  if (first.length < 2 || last.length < 2) return [];
  const list = [first, first + '.' + last, first + last, first[0] + last, first[0] + '.' + last, first + '_' + last, first + last[0], last, last + first[0]];
  return [...new Set(list)].filter(local => /^[a-z][a-z._]{1,40}$/.test(local));
}

const MAIL_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

// Owner address candidates: published (bound to a named owner on the page) and pattern-derived.
// Generic mailboxes are never candidates for an owner.
function ownerEmailCandidates({ owners, contacts, siteDomain, storedEmails = [], personalDomains = new Set() }) {
  const out = new Map();
  const add = candidate => {
    const prior = out.get(candidate.email);
    const rank = { published: 3, inferred: 2, derived: 1 };
    if (!prior || rank[candidate.via] > rank[prior.via]) out.set(candidate.email, { ...candidate, mailboxVerification: 'not-performed', sendApproved: false });
  };
  for (const c of contacts) {
    if (c.department || !c.ownerBinding || c.ownerBinding.historical || c.unrelatedDomain) continue;
    const published = c.bindingEvidence === 'published-person-email' && c.kind !== 'stored-email-only' && /^https?:\/\//i.test(c.sourceUrl || '');
    add({ email: c.email, ownerName: c.ownerBinding.name, via: published ? 'published' : 'inferred', evidenceUrl: published ? c.sourceUrl : c.ownerBinding.sourceUrl || '', emailSourceUrl: c.sourceUrl || '', ownerSourceUrl: c.ownerBinding.sourceUrl || '', snippet: c.snippet || '', ownerEvidence: c.ownerBinding.snippet || '', evidenceKind: c.ownerBinding.kind || c.kind, historical: false });
  }
  const domains = new Set([siteDomain]);
  for (const email of storedEmails) {
    const domain = String(email).split('@')[1];
    if (domain && MAIL_DOMAIN.test(domain) && !personalDomains.has(domain) && (domain === siteDomain || domain.endsWith('.' + siteDomain))) domains.add(domain);
  }
  for (const owner of owners) for (const local of namePatterns(owner.name).slice(0, 6)) for (const domain of domains) if (MAIL_DOMAIN.test(domain)) add({ email: local + '@' + domain, ownerName: owner.name, via: 'derived', evidenceUrl: owner.sourceUrl, evidenceKind: 'name-pattern' });
  return [...out.values()];
}

module.exports = { namePatterns, ownerEmailCandidates, fold };
