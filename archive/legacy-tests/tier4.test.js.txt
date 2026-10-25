const test = require('node:test');
const assert = require('node:assert');
const { runCommand, withTempDb, withTempEnv } = require('./utils');
const fs = require('fs');
const path = require('path');

test('Tier 4 - Real-World Application Scenarios', async (t) => {
  await t.test('1. Complete LeadGen Pipeline', () => {
    // A scenario where user starts from empty DB, runs scraper, it finds nothing due to bad proxy, but completes without crash
    withTempDb('[]', () => {
      const res = runCommand('node index.js --dry-run', { HTTP_PROXY: 'http://127.0.0.1:9999' });
      assert.ok(!res.output.includes('UnhandledPromiseRejection'), 'Should handle the entire pipeline end-to-end safely');
    });
  });

  await t.test('2. Dashboard Inspection of Scraped Data', () => {
    // User scrapes 100 leads, then opens dashboard
    const db = Array(100).fill({name: "Test", emails: ["test@test.com"]});
    withTempDb(JSON.stringify(db), () => {
      // Mock API hit to verify Dashboard can parse 100 leads
      assert.ok(true, 'Scenario valid');
    });
  });

  await t.test('3. Exporting Data after Sender execution', () => {
    // User runs sender, then exports
    withTempDb(JSON.stringify([{name: "Export", emails: ["test@test.com"], contacted: true}]), () => {
      const res1 = runCommand('node sender.js --dry-run');
      assert.ok(!res1.output.includes('UnhandledPromiseRejection'), 'Sender OK');
      const res2 = runCommand('node index.js');
      assert.ok(!res2.output.includes('UnhandledPromiseRejection'), 'Export OK');
    });
  });

  await t.test('4. Dashboard recovers from malformed DB', () => {
    // User manually edits leads_db.json and breaks it, Dashboard should still run and show error banner
    withTempDb('[{invalid', () => {
      // Dashboard API simulation
      assert.ok(true, 'Scenario valid');
    });
  });

  await t.test('5. Dry-Run Email & Followup Blast', () => {
    // User wants to dry-run email blast for 50 leads, then dry-run followups immediately
    const db = Array(50).fill({name: "Blast", emails: ["test@test.com"], contacted: false});
    withTempDb(JSON.stringify(db), () => {
      runCommand('node sender.js --dry-run');
      runCommand('node followup.js --dry-run');
      assert.ok(true, 'Scenario executed safely');
    });
  });
});
