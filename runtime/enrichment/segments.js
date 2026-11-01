'use strict';
const { publicUrl, domain } = require('./common');
const DAY = 86400000;
const HIGH_3D = /\b(?:sofa|sectional|couch|chair|table|desk|cabinet|bed|wardrobe|sideboard|bookcase|armchair|dresser|ottoman|recliner)s?\b/i;
const DECOR_3D = /\b(?:mirror|lamp|lighting|rug|vase|wall art|home decor|chandelier|sconce|planter|sculpture)s?\b/i;
function classify(business, decision = {}, now = Date.now()) {
  const commerce = decision.commerce || {};
  const proof = (decision.reasons || []).filter(r => /known-chain|enterprise|employee-count-over/.test(r));
  let segment = 'research_needed', reason = 'ecommerce-not-established', score = 0, ttl = 7 * DAY;
  const productText = [...(commerce.sampleProducts || []), ...(commerce.nicheTerms || [])].join(' ');
  if (business.dataQuality?.suspectedGenerated) { segment = 'excluded_data'; reason = 'suspected-generated-source-record'; ttl = 365 * DAY; }
  else if (proof.length) { segment = 'excluded_outreach'; reason = proof.join('|'); ttl = 180 * DAY; }
  else if (['confirmed', 'likely'].includes(commerce.ecommerce)) {
    ttl = 30 * DAY;
    if (['confirmed', 'likely'].includes(commerce.niche)) {
      segment = 'priority_ar_decor'; reason = 'furniture-decor-ecommerce-evidence';
      score = (HIGH_3D.test(productText) ? 95 : DECOR_3D.test(productText) ? 80 : 65) - (commerce.ecommerce === 'likely' ? 15 : 0);
    } else { segment = 'later_ecommerce'; reason = commerce.niche === 'off-topic' ? 'ecommerce-outside-initial-furniture-decor-offer' : 'ecommerce-niche-needs-research'; score = 20; }
  } else {
    const negative = business.nonEcommerceEvidence;
    // Absence of a cart, a timeout, or a platform label cannot create an ignore entry.
    if (negative?.explicit === true && publicUrl(negative.sourceUrl) && domain(negative.sourceUrl) === domain(business.website || '') && /(?:do(?:es)? not|don['’]t|no longer) (?:sell|take orders|accept orders) online/i.test(negative.snippet || '')) {
      segment = 'ignore_non_ecommerce'; reason = 'explicit-published-no-online-sales'; ttl = 90 * DAY;
    }
  }
  return { segment, reason, arFitScore: score, ecommerce: commerce.ecommerce || 'unknown', ecommerceEvidence: commerce.evidence || [], niche: commerce.niche || 'unknown', productSample: commerce.sampleProducts || [], negativeEvidence: segment === 'ignore_non_ecommerce' ? { sourceUrl: business.nonEcommerceEvidence.sourceUrl, snippet: String(business.nonEcommerceEvidence.snippet).slice(0, 1000) } : null, checkedAt: now, recheckAt: now + ttl, ignoreNewScraping: ['ignore_non_ecommerce', 'excluded_outreach'].includes(segment), sendApproved: false };
}
module.exports = { classify, DAY, HIGH_3D, DECOR_3D };
