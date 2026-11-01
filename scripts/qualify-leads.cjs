'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.join(__dirname, '..');
const appRequire = createRequire(path.join(root, 'package.json'));
const { run, exportAll } = require('../runtime/pipeline/runner');
const { fetchPage } = require('../runtime/pipeline/http');
const { broadLead } = require('../runtime/master-research');
const { createSmtpProber } = require('../runtime/pipeline/smtp');

const command = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'run';
const arg = (name, fallback) => { const v = process.argv.find(s => s.startsWith('--' + name + '=')); return v ? v.slice(name.length + 3) : fallback; };
const flag = name => process.argv.includes('--' + name);
const workdir = path.resolve(arg('workdir', path.join(root, 'research-working', 'qualify-v3')));
const num = (name, fallback, min, max) => { const n = Number(arg(name, fallback)); if (!Number.isFinite(n) || n < min || n > max) throw new Error('--' + name + ' must be ' + min + '–' + max); return n; };

async function main() {
  if (!['run', 'export', 'status'].includes(command)) throw new Error('Usage: qualify-leads.cjs [run|export|status] --workdir=… [--input=MASTER.json] [--sample=N] [--no-smtp] [--no-converge]');
  const abort = new AbortController();
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { console.log('Stopping after in-flight work; progress is saved and resumable.'); abort.abort(); });
  const smtpOn = flag('smtp') && !flag('no-smtp');
  if (smtpOn && !arg('helo')) throw new Error('Optional SMTP probing requires --helo=your-public-hostname; default operation uses no SMTP');
  const scope = arg('scope', 'default');
  if (!['default', 'broad'].includes(scope)) throw new Error('--scope must be default or broad');
  const session = await run({
    ...(scope === 'broad' ? { filter: broadLead } : {}),
    input: arg('input') && path.resolve(arg('input')), workdir, migrateFrom: arg('upgrade-from') && path.resolve(arg('upgrade-from')), seedResearch: arg('seed-research') && path.resolve(arg('seed-research')),
    concurrency: num('concurrency', 10, 1, 16), smtpConcurrency: num('smtp-concurrency', 4, 1, 8), smtp: smtpOn,
    maxAttempts: num('max-attempts', 3, 1, 10), backoffScale: num('backoff-scale', 1, 0.001, 10), converge: !flag('no-converge'),
    maxWaitMs: num('max-wait-hours', 6, 0, 48) * 3600 * 1000, sample: num('sample', 0, 0, 100000), work: command === 'run',
    deps: { fetchPage, cheerio: appRequire('cheerio'), network: appRequire('./runtime/network'), verification: appRequire('./runtime/verification'), chainDomains: appRequire('./runtime/chain-domains'), smtp: smtpOn ? createSmtpProber({ helo: arg('helo') || undefined }) : null },
    log: line => console.log(line), signal: abort.signal,
  });
  try {
    if (command === 'status') console.log(JSON.stringify(session.final, null, 2));
    else if (command === 'export' || command === 'run') console.log(JSON.stringify(exportAll(session), null, 2));
  } finally { session.db.close(); }
}
main().catch(e => { console.error(String(e.stack || e.message)); process.exitCode = 1; });
