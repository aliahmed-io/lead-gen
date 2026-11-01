'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Registry } = require('../runtime/enrichment/registry');
const { discover } = require('../runtime/enrichment/discovery');
const { findEmails, importFinder, importVerification } = require('../runtime/enrichment/providers');
const { app, sha } = require('../runtime/enrichment/common');
const localKeys = path.join(path.dirname(app.resolve('./package.json')), '.env.enrichment');
if (fs.existsSync(localKeys)) {
  const parsed = app('dotenv').parse(fs.readFileSync(localKeys));
  for (const key of ['HUNTER_API_KEY', 'BRAVE_SEARCH_API_KEY']) if (!process.env[key] && parsed[key]) process.env[key] = parsed[key];
}
const command = process.argv[2] || 'status';
const arg = (name, fallback) => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3) ?? fallback;
const number = (name, fallback, max = 10000) => { const value = Number(arg(name, fallback)); if (!Number.isInteger(value) || value < 0 || value > max) throw new Error('Invalid --' + name); return value; };
const required = name => { const value = arg(name); if (!value) throw new Error('--' + name + ' is required'); return path.resolve(value); };
async function main() {
  if (!['intake', 'discover', 'find', 'import-finder', 'import-verification', 'qualify', 'export', 'screen', 'status'].includes(command)) throw new Error('Unknown enrichment command');
  const folder = path.resolve(arg('registry', path.join(__dirname, '../enrichment-working')));
  const registry = new Registry(folder);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const result = await registry.exclusive(async () => {
      if (command === 'intake') return registry.intake(required('master'), arg('qualification') && path.resolve(arg('qualification')));
      if (command === 'discover') return discover(registry, { limit: number('limit', 20), concurrency: number('concurrency', 3, 6), maxSearchCalls: number('max-search-calls', 0), signal: controller.signal, segment: arg('segment', 'priority_ar_decor') });
      if (command === 'find') return findEmails(registry, { maxCalls: number('max-provider-calls', 0), runId: crypto.randomUUID(), signal: controller.signal, segment: arg('segment', 'priority_ar_decor') });
      if (command === 'import-finder') return importFinder(registry, required('report'), { provider: arg('provider'), verifiedAt: arg('verified-at') });
      if (command === 'import-verification') return importVerification(registry, required('report'), { provider: arg('provider'), verifiedAt: arg('verified-at') });
      if (command === 'export') return registry.export({ segment: arg('segment', 'priority_ar_decor') });
      if (command === 'screen') {
        const source = registry.snapshot(required('input')), rows = JSON.parse(source.data);
        if (!Array.isArray(rows)) throw new Error('Screen input must be a JSON array of websites or business objects');
        const results = rows.map(b => ({ website: typeof b === 'string' ? b : b.website, ...registry.screen(typeof b === 'string' ? b : b.website, { mode: arg('mode', 'discover') }) }));
        const out = path.join(folder, 'screen-' + Date.now() + '.json'); fs.writeFileSync(out, JSON.stringify(results, null, 2), { flag: 'wx' }); return { output: out, allowed: results.filter(r => !r.skip).length, skipped: results.filter(r => r.skip).length };
      }
      if (command === 'qualify') {
        // A separate working copy allows every niche and businesses with no email.
        const { run, exportAll } = app('./runtime/pipeline/runner');
        const sample = number('sample', 0);
        const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
        const sourceKey = sha(fs.readFileSync(required('master'))).slice(0, 12);
        const checkpoint = arg('checkpoint') ? path.resolve(arg('checkpoint')) : path.join(folder, 'all-niche-qualification-' + sourceKey + '-' + day + (sample ? '-sample-' + sample : ''));
        const session = await run({ input: required('master'), workdir: checkpoint, concurrency: number('concurrency', 6, 16), sample, smtp: false, maxWaitMs: 0, filter: b => !b.dataQuality?.suspectedGenerated && Boolean(b.website), deps: { fetchPage: app('./runtime/pipeline/http').fetchPage, cheerio: app('cheerio'), network: app('./runtime/network'), verification: app('./runtime/verification'), chainDomains: app('./runtime/chain-domains') }, log: console.log });
        try { const result = exportAll(session); registry.intake(required('master'), path.join(result.output, 'evidence.json')); return result; } finally { session.db.close(); }
      }
      return registry.stats();
    });
    console.log(JSON.stringify(result, null, 2));
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); registry.close(); }
}
main().catch(() => { console.error('Enrichment command failed. Check the command inputs, provider configuration and writer lock. Original lead files were not changed.'); process.exitCode = 1; });
