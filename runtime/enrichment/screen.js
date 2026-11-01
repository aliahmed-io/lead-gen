'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { domain } = require('./common');
function screenNewBusiness(business, { folder = process.env.LEADGEN_ENRICHMENT_REGISTRY || path.resolve(__dirname, '../../enrichment-working'), now = Date.now(), mode = 'discover' } = {}) {
  const host = domain(business.website || '');
  if (!host) return { skip: false, reason: 'no-canonical-domain-to-screen' };
  const file = path.join(folder, 'enrichment.sqlite');
  if (!fs.existsSync(file)) return { skip: false, reason: 'registry-not-initialized' };
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const rows = db.prepare('SELECT classification FROM businesses WHERE domain=?').all(host).map(r => JSON.parse(r.classification));
    const hasCommerce = rows.some(r => ['priority_ar_decor', 'later_ecommerce'].includes(r.segment));
    const blocked = rows.find(r => r.ignoreNewScraping && r.recheckAt > now && (!hasCommerce || r.segment !== 'ignore_non_ecommerce'));
    if (blocked) return { skip: true, reason: blocked.reason, recheckAt: blocked.recheckAt };
    // Generated-only fixtures must never block discovering a real business later.
    const real = rows.some(r => r.segment !== 'excluded_data');
    return { skip: mode === 'discover' && real, reason: real ? 'already-known-use-enrichment-queue' : 'new-domain' };
  } catch { return { skip: false, reason: 'registry-unavailable-do-not-discard-lead' }; }
  finally { db?.close(); }
}
module.exports = { screenNewBusiness };
