/**
 * Restores leads_db.json from the staged halal_leads_db.json dataset.
 * Only writes when leads_db.json is missing or empty — never overwrites existing data.
 * Run once: node scripts/restore_leads_db.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const leadsPath = path.join(ROOT, 'leads_db.json');
const stagingPath = path.join(ROOT, 'halal_leads_db.json');

if (!fs.existsSync(stagingPath)) {
  console.error('Staging dataset halal_leads_db.json not found.');
  process.exit(1);
}

let exists = false;
try {
  const existing = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
  exists = existing && (Object.keys(existing.businesses || {}).length > 0);
} catch {}

if (exists) {
  console.log('leads_db.json already has data — nothing to restore.');
  process.exit(0);
}

const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
const businesses = staging.businesses || {};
const count = Object.keys(businesses).length;
fs.writeFileSync(leadsPath, JSON.stringify({ businesses, completedQueries: staging.completedQueries || [], metadata: staging.metadata || {} }, null, 2));
console.log(`Restored leads_db.json with ${count} businesses from halal_leads_db.json.`);
