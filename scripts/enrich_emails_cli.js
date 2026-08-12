// @ts-check
/**
 * CLI wrapper for the dashboard "Enrich Emails" feature.
 *
 * Loads the target leads out of leads_db.json, probes email name patterns at
 * each lead's domain (MX + SMTP handshake via emailPatternEnricher.js), and
 * prints a JSON result to stdout:
 *
 *   { enriched: n, found: n, results: [{ businessName, domain, email|null,
 *      method, smtpValid }] }
 *
 * Usage:
 *   node scripts/enrich_emails_cli.js all                    # enrich every lead without an email
 *   node scripts/enrich_emails_cli.js keys "key1" "key2"     # enrich specific leads_db keys
 *
 * The found emails are written back to leads_db.json in place, including
 * pre-send quality rescore (leadQuality.js) for leads that gained an email.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'leads_db.json');

const { enrichLead } = require('../emailPatternEnricher');
const { scoreLead } = require('../leadQuality');

/**
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>}
 */
function scoreEnrichedLead(record) {
  try {
    const scored = scoreLead(record, {});
    return scored ?? {};
  } catch {
    return {};
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'all';
  const keyArgs = args.slice(1);

  if (!fs.existsSync(DB_PATH)) {
    console.log(JSON.stringify({ enriched: 0, found: 0, results: [] }));
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error(JSON.stringify({ error: 'Failed to read leads database: ' + err.message }));
    process.exit(1);
  }
  if (!data.businesses) data.businesses = {};
  /** @type {Record<string, Record<string, unknown>>} */
  const businesses = data.businesses;

  const toEnrich = [];
  for (const [key, record] of Object.entries(businesses)) {
    if (record.email) continue;
    if (mode === 'all' || keyArgs.includes(key)) toEnrich.push({ key, record });
  }

  const results = [];
  let foundCount = 0;

  for (const { record } of toEnrich) {
    const website = String(record.website || '');
    /** @type {{ name?: string; businessName?: string; website?: string; key?: string; city?: string; state?: string }} */
    const lead = {
      name: String(record.name || record.businessName || record.key || ''),
      website,
      city: String(record.city || ''),
      state: String(record.state || ''),
    };
    /** @type {{ found: boolean; email?: string; method?: string; smtpValid?: boolean; tried?: string[]; confidence?: number; source?: string; ownerName?: string; stages?: string[] }} */
    const res = await enrichLead(lead);

    let domain = '';
    try {
      const url = website.startsWith('http') ? website : `https://${website}`;
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch { /* domain left empty */ }

    if (res.found && res.email) {
      foundCount++;
      record.email = res.email;
      record.emailStatus = 'pattern_found';
      record.enrichedAt = new Date().toISOString();
      /* pipeline metadata — shown in the dashboard results modal */
      record.enrichmentOwner = res.ownerName || '';
      record.enrichmentSource = String(res.source || 'none');
      record.enrichmentConfidence = typeof res.confidence === 'number' ? res.confidence : 0;
      const scored = scoreEnrichedLead(record);
      if (typeof scored.score === 'number') record.qualityScore = scored.score;
      if (scored.grade) record.qualityGrade = scored.grade;
      if (scored.grade) record.qualityTier = scored.grade === 'A' || scored.grade === 'B' ? 'top' : scored.grade === 'C' ? 'average' : 'low';
      if (Array.isArray(scored.reasons)) record.qualityReasons = scored.reasons;
      record.updatedAt = new Date().toISOString();
    }

    results.push({
      businessName: String(record.name || record.businessName || record.key),
      domain,
      email: res.email || null,
      method: String(res.method || 'none'),
      smtpValid: Boolean(res.smtpValid),
      confidence: typeof res.confidence === 'number' ? res.confidence : 0,
      source: String(res.source || 'none'),
      ownerName: res.ownerName || null,
      stages: Array.isArray(res.stages) ? res.stages : [],
    });

    await new Promise(r => setTimeout(r, 250));
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(JSON.stringify({ enriched: toEnrich.length, found: foundCount, results }));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
