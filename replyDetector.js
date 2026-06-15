require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const campaignDb = require('./campaignDb');
const fs = require('fs');
const path = require('path');

const OVERALL_TIMEOUT_MS = 30000;
const MATCHABLE_STATUSES = ['sent', 'followed_up_1', 'followed_up_2'];

function getSettings() {
  const settingsPath = path.join(__dirname, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing settings.json. Using defaults.');
    }
  }
  return {};
}

/**
 * Scans a single IMAP account's INBOX for unread replies from campaign leads.
 * When a lead's reply is detected, the record is marked as 'interested'.
 * Bounce/system emails are silently skipped.
 *
 * @param {CampaignDatabase} campaignDb
 * @param {number} id
 * @param {string} user
 * @param {string} pass
 * @param {string} host
 * @param {number|string} port
 * @returns {Promise<number>} Number of new replies detected.
 */
async function checkAccount(campaignDb, id, user, pass, host, port, activeClients) {
  const client = new ImapFlow({
    host: host,
    port: parseInt(String(port), 10),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  if (activeClients) activeClients.push(client);

  let newReplies = 0;

  try {
    console.log(`⏳ Connecting to IMAP Account ${id} (${user})...`);
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      console.log(`✅ Connected. Scanning UNSEEN messages in Account ${id}...`);

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const messages = client.fetch('1:*', { source: true, flags: true }, { search: { unseen: true, since: fourteenDaysAgo } });

      for await (const message of messages) {
        const parsed = await simpleParser(message.source);

        if (!parsed.from || !parsed.from.value || parsed.from.value.length === 0) {
          continue;
        }

        const fromAddress = parsed.from.value[0].address.toLowerCase();
        const subject = (parsed.subject || '').toLowerCase();

        const isBounce =
          fromAddress.includes('mailer-daemon') ||
          fromAddress.includes('postmaster') ||
          fromAddress.includes('bounce') ||
          subject.includes('undeliverable') ||
          subject.includes('delivery status notification');

        if (isBounce) {
          console.log(`   ⚠️ Bounce notification ignored from ${fromAddress}`);
          await client.messageFlagsAdd(message.seq, ['\\Seen']);
          continue;
        }

        const leadRecord = campaignDb.getRecord(fromAddress);
        if (leadRecord && MATCHABLE_STATUSES.includes(leadRecord.status)) {
          console.log(`   🎉 Reply detected from ${fromAddress}!`);

          campaignDb.addOrUpdateRecord(fromAddress, {
            status: 'interested',
            repliedAt: Date.now(),
          });

          newReplies++;
          await client.messageFlagsAdd(message.seq, ['\\Seen']);
        }
      }

      console.log(`   Processed Account ${id}: Found ${newReplies} new replies.`);
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.warn(`⚠️ Error checking IMAP Account ${id}: ${err.message}`);
  } finally {
    if (activeClients) {
      const idx = activeClients.indexOf(client);
      if (idx !== -1) activeClients.splice(idx, 1);
    }
  }

  return newReplies;
}

/**
 * Checks all configured IMAP accounts for replies from campaign leads.
 * Enforces a 30-second overall timeout for the entire check cycle.
 * Gracefully handles connection failures per account without crashing.
 *
 * @returns {Promise<{ totalReplies: number, accountsChecked: number }>}
 */
async function checkReplies() {
  console.log('🔍 Starting reply detection scan...\n');

  let totalReplies = 0;
  let accountsChecked = 0;
  const activeClients = [];

  let accounts = [];
  const settings = getSettings();

  if (settings.accounts && settings.accounts.length > 0) {
    accounts = settings.accounts.map(acc => ({
      id: acc.id,
      user: acc.user || acc.email,
      pass: acc.pass || acc.password,
      host: acc.imapHost || acc.host || 'imap.gmail.com',
      port: acc.imapPort || acc.port || 993,
    }));
  } else {
    for (let i = 1; i <= 6; i++) {
      const user = process.env[`EMAIL_${i}_USER`];
      const pass = process.env[`EMAIL_${i}_PASS`];
      const host = process.env[`EMAIL_${i}_IMAP_HOST`] || 'imap.gmail.com';
      const port = process.env[`EMAIL_${i}_IMAP_PORT`] || 993;

      if (user && pass) {
        accounts.push({ id: i, user, pass, host, port });
      }
    }
  }

  if (accounts.length === 0) {
    console.log('❌ No IMAP accounts configured in .env. Skipping reply detection.');
    return { totalReplies: 0, accountsChecked: 0 };
  }

  const scanWork = (async () => {
    for (const acct of accounts) {
      const replies = await checkAccount(campaignDb, acct.id, acct.user, acct.pass, acct.host, acct.port, activeClients);
      totalReplies += replies;
      accountsChecked++;
    }
  })();

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Reply detection timed out after 30 seconds')), OVERALL_TIMEOUT_MS);
  });

  try {
    await Promise.race([scanWork, timeout]);
  } catch (err) {
    console.warn(`⚠️ ${err.message}. Returning partial results.`);
    for (const client of activeClients) {
      try { await client.logout(); } catch (e) {}
    }
  }

  campaignDb.forceSave();

  console.log(`\n✅ Reply detection complete: ${totalReplies} new replies across ${accountsChecked} accounts.`);
  return { totalReplies, accountsChecked };
}

module.exports = { checkReplies };
