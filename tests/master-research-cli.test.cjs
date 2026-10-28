'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { execFileSync } = require('node:child_process'); const { DatabaseSync } = require('node:sqlite');
const { sha } = require('../runtime/master-research');

test('export-only resume preserves source bytes, deduplicates candidates, and never overwrites older exports', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'leadgen-owner-research-test-'));
  const input = path.join(folder, 'fixture-source.copy.json'); const output = path.join(folder, 'working-copy'); fs.mkdirSync(output);
  const business = id => ({ id, name: 'Oak Studio', website: 'https://oakstudio.test', names: [], categories: ['furniture'], platforms: [], emails: ['jane@oakstudio.test'], dataQuality: {} });
  const raw = JSON.stringify({ businesses: { a: business('fixture-a'), b: business('fixture-b') } }); fs.writeFileSync(input, raw, { flag: 'wx' });
  const db = new DatabaseSync(path.join(output, 'research-working.sqlite'));
  db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE sites(domain TEXT PRIMARY KEY,result TEXT NOT NULL,completed_at TEXT NOT NULL);CREATE TABLE businesses(id TEXT PRIMARY KEY,result TEXT NOT NULL)');
  db.prepare('INSERT INTO meta VALUES(?,?)').run('version', 'owner-research-v1'); db.prepare('INSERT INTO meta VALUES(?,?)').run('sourceSha256', sha(raw));
  const owner = { name: 'Jane Smith', role: 'Owner', sourceUrl: 'https://oakstudio.test/about', snippet: 'Jane Smith, Owner of Oak Studio', kind: 'same-person-block', historical: false };
  const site = { website: 'https://oakstudio.test', domain: 'oakstudio.test', status: 'researched', checkedAt: new Date().toISOString(), pages: [{ title: 'Oak Studio Furniture', blocked: false, parked: false }], errors: [], owners: [owner], contacts: [{ email: 'jane@oakstudio.test', sourceUrl: owner.sourceUrl, snippet: owner.snippet, kind: 'mailto', ownerBinding: owner, department: false }], sizeFacts: [], commerce: [{ kind: 'purchase-control' }], niche: [{ terms: ['furniture', 'sofas'] }], platforms: [] };
  db.prepare('INSERT INTO sites VALUES(?,?,?)').run('oakstudio.test', JSON.stringify(site), new Date().toISOString()); db.close();
  const command = [path.join(__dirname, '../scripts/research-master.cjs'), '--app-root=D:/leadgen', '--input=' + input, '--output=' + output, '--export-only', '--limit=2'];
  const execute = () => execFileSync(process.execPath, command, { timeout: 30000, encoding: 'utf8' });
  execute();
  const first = fs.readdirSync(output).find(name => name.startsWith('exports-'));
  const resultsPath = path.join(output, first, '05-research-results.json'); const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8')); const originalExport = sha(fs.readFileSync(resultsPath));
  assert.equal(results.businesses.length, 2); assert.equal(results.ownerCandidates.length, 1); assert.equal(results.ownerCandidates[0].businessIds.length, 2);
  execute();
  assert.equal(fs.readdirSync(output).filter(name => name.startsWith('exports-')).length, 2);
  assert.equal(sha(fs.readFileSync(resultsPath)), originalExport); assert.equal(fs.readFileSync(input, 'utf8'), raw);
  assert.equal(fs.readFileSync(path.join(output, 'source-master.copy.json'), 'utf8'), raw);
  // Retain the test fixture rather than recursively deleting a file containing leads.
});
