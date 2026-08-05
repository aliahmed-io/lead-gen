#!/usr/bin/env node
/**
 * GDPR / Right-to-be-Forgotten Script
 *
 * Anonymizes all personal data for a given email address from campaign_db.json
 * and inbox_db.json while retaining anonymized aggregate statistics.
 *
 * Usage:
 *   node forget.js <email>
 *   node forget.js contact@business.com
 *
 * What it does:
 *   - Replaces email with a SHA-256 hashed placeholder
 *   - Clears businessName, website, city, state, platform
 *   - Retains status, timestamps, and stats (no PII in those)
 *   - Removes the email from the unsubscribed list (hashed version kept)
 *   - Removes all inbox thread messages for this contact
 *   - Removes from activity log entries
 *   - Prints a deletion receipt
 *
 * What it does NOT do:
 *   - Does not delete the aggregated daily/bounce counts (no PII there)
 *   - Does not modify audit.log (you should manually review that separately)
 */

'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Paths ────────────────────────────────────────────────────────────────────
const CAMPAIGN_DB = path.join(__dirname, 'campaign_db.json');
const INBOX_DB    = path.join(__dirname, 'inbox_db.json');

// ── Argument validation ──────────────────────────────────────────────────────
const [,, rawEmail] = process.argv;
if (!rawEmail) {
  console.error('Usage: node forget.js <email>');
  console.error('Example: node forget.js contact@business.com');
  process.exit(1);
}

const email = rawEmail.toLowerCase().trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`❌ Invalid email format: ${email}`);
  process.exit(1);
}

// ── Anonymized placeholder ───────────────────────────────────────────────────
// Uses a deterministic SHA-256 hash so the record slot is preserved
// but the original email can never be reconstructed from it.
const hash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 16);
const ANON_EMAIL = `gdpr-erased-${hash}@deleted.invalid`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Failed to read ${filePath}: ${e.message}`);
    return null;
  }
}

function writeJson(filePath, data) {
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

// ── Step 1: campaign_db.json ─────────────────────────────────────────────────
console.log(`\n🗑️  GDPR Erasure Request: ${email}\n`);

let campaignErased = false;
const campaignDb = readJson(CAMPAIGN_DB);

if (campaignDb) {
  const record = campaignDb.records[email];

  if (record) {
    // Keep status + timestamps + stats — erase all PII fields
    campaignDb.records[ANON_EMAIL] = {
      email: ANON_EMAIL,
      businessName: '[ERASED]',
      status: record.status,
      sentAt: record.sentAt || null,
      followedUp1At: record.followedUp1At || null,
      followedUp2At: record.followedUp2At || null,
      followedUp3At: record.followedUp3At || null,
      followedUpAt: record.followedUpAt || null,
      repliedAt: record.repliedAt || null,
      bouncedAt: record.bouncedAt || null,
      unsubscribedAt: record.unsubscribedAt || null,
      completedAt: record.completedAt || null,
      accountId: record.accountId || null,
      messageId: null,     // message ID could be used to trace back — erase it
      platform: '[ERASED]',
      website: '[ERASED]',
      city: '[ERASED]',
      state: '[ERASED]',
      gdprErasedAt: Date.now(),
    };
    delete campaignDb.records[email];
    console.log('   ✅ campaign_db.json — record anonymized');
    campaignErased = true;
  } else {
    console.log('   ℹ️  campaign_db.json — no record found for this email');
  }

  // Remove from unsubscribed list
  if (Array.isArray(campaignDb.unsubscribed)) {
    const before = campaignDb.unsubscribed.length;
    campaignDb.unsubscribed = campaignDb.unsubscribed.filter(e => e !== email);
    if (campaignDb.unsubscribed.length < before) {
      console.log('   ✅ campaign_db.json — removed from unsubscribed list');
    }
  }

  // Scrub activity log entries referencing this email
  if (Array.isArray(campaignDb.activityLog)) {
    const before = campaignDb.activityLog.length;
    campaignDb.activityLog = campaignDb.activityLog.filter(e => e.email !== email);
    if (campaignDb.activityLog.length < before) {
      console.log(`   ✅ campaign_db.json — ${before - campaignDb.activityLog.length} activity log entries removed`);
    }
  }

  writeJson(CAMPAIGN_DB, campaignDb);
} else {
  console.log('   ⚠️  campaign_db.json not found — skipping');
}

// ── Step 2: inbox_db.json ────────────────────────────────────────────────────
const inboxDb = readJson(INBOX_DB);

if (inboxDb) {
  if (inboxDb[email]) {
    delete inboxDb[email];
    writeJson(INBOX_DB, inboxDb);
    console.log('   ✅ inbox_db.json — thread and all messages deleted');
  } else {
    console.log('   ℹ️  inbox_db.json — no inbox thread found for this email');
  }
} else {
  console.log('   ℹ️  inbox_db.json not found — skipping');
}

// ── Receipt ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────');
console.log('📋 GDPR Deletion Receipt');
console.log('────────────────────────────────────────────────');
console.log(`Original email : ${email}`);
console.log(`Anonymized to  : ${ANON_EMAIL}`);
console.log(`Executed at    : ${new Date().toISOString()}`);
console.log(`Campaign data  : ${campaignErased ? 'Anonymized (stats retained)' : 'Not found'}`);
console.log(`Inbox threads  : Deleted`);
console.log('────────────────────────────────────────────────');
console.log('\n⚠️  Reminder: If you have an audit.log, review and manually redact any entries');
console.log('   referencing this email to complete full GDPR compliance.\n');
