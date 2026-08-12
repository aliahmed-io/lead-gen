require('dotenv').config();
const { errOf } = require('./utils');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const campaignDb = require('./campaignDb');
const inboxDb = require('./inboxDb');
const fs = require('fs');
const path = require('path');
const { decrypt, isEncrypted } = require('./cryptoUtils');
const { classifySentiment } = require('./replyClassifier');

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
 * @param {string|undefined} password
 */
function safeDecryptPassword(password) {
  if (!password) return '';
  if (isEncrypted(password)) {
    try {
      return decrypt(password);
    } catch (e) {
      console.error('Failed to decrypt password:', errOf(e).message);
      return '';
    }
  }
  console.warn('⚠️  WARNING: Plain text password detected in reply detector.');
  return password;
}

/**
 * Determines if an email is a system bounce/DSN notification.
 * Returns the bounce type: 'hard', 'soft', or null (not a bounce).
 */
/**
 * @param {string} fromAddress
 * @param {string} subject
 * @param {string} text
 */
function detectBounceType(fromAddress, subject, text) {
  const from = (fromAddress || '').toLowerCase();
  const subj = (subject || '').toLowerCase();
  const body = (text || '').toLowerCase();

  const isSystemSender =
    from.includes('mailer-daemon') ||
    from.includes('postmaster') ||
    from.includes('noreply') ||
    from.includes('no-reply') ||
    from.includes('bounce') ||
    from.includes('mail-daemon');

  const isHardBounce =
    subj.includes('undeliverable') ||
    subj.includes('delivery status notification') ||
    subj.includes('delivery failure') ||
    subj.includes('mail delivery failed') ||
    subj.includes('returned mail') ||
    body.includes('550') ||   // SMTP 550 = user does not exist
    body.includes('551') ||
    body.includes('553') ||
    body.includes('user unknown') ||
    body.includes('no such user') ||
    body.includes('account does not exist') ||
    body.includes('address rejected');

  const isSoftBounce =
    subj.includes('out of office') ||
    subj.includes('auto-reply') ||
    subj.includes('automatic reply') ||
    body.includes('mailbox full') ||
    body.includes('over quota') ||
    body.includes('temporarily unavailable');

  if (isSystemSender && isHardBounce) return 'hard';
  if (isSystemSender && isSoftBounce) return 'soft';
  if (isSystemSender) return 'hard'; // unknown system email — treat as hard to be safe
  return null;
}

/**
 * Determines if a reply is an unsubscribe request.
 *
 * @param {string|undefined} subject
 * @param {string|undefined} text
 */
function isUnsubscribeRequest(subject, text) {
  const subj = (/** @type {string|undefined} */ (subject) || '').toLowerCase();
  const body = (/** @type {string|undefined} */ (text) || '').toLowerCase();
  return (
    subj.includes('unsubscribe') ||
    body.includes('unsubscribe') ||
    body.includes('remove me') ||
    body.includes('stop emailing') ||
    body.includes('take me off') ||
    body.includes('opt out') ||
    body.includes('opt-out')
  );
}

/**
 * Scans a single IMAP account's INBOX for:
 * - Genuine replies → marks as 'interested'
 * - Hard bounces → marks as 'bounced' (FIXED from previous version)
 * - Soft bounces → marks as 'soft_bounce', retryable
 * - Unsubscribe requests → adds to unsubscribe list
 */
/**
 * @param {{ getRecord(email: string): LeadRecord|null|undefined; getRecordByMessageId(id: string): LeadRecord|null|undefined; addOrUpdateRecord(email: string, patch: object): void; addUnsubscribe(email: string): void }} campaignDb
 * @param {string|number} id
 * @param {string} user
 * @param {string} pass
 * @param {string} host
 * @param {string|number} port
 * @param {unknown[]} activeClients
 */
async function checkAccount(campaignDb, id, user, pass, host, port, activeClients) {
  const client = new ImapFlow({
    host,
    port: parseInt(String(port), 10),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  if (activeClients) activeClients.push(client);

  let newReplies = 0;
  let newBounces = 0;
  let newUnsubscribes = 0;

  try {
    console.log(`⏳ Connecting to IMAP Account ${id} (${user})...`);
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      console.log(`✅ Connected. Scanning UNSEEN messages in Account ${id}...`);

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const uids = await client.search({ unseen: true, since: fourteenDaysAgo });

      if (uids && uids.length > 0) {
        const messages = client.fetch(uids.join(','), { source: true, flags: true });

        for await (const message of /** @type {IterableIterator<{ seq: number; source: Buffer|string; flags: string[] }> & AsyncIterable<{ seq: number; source: Buffer|string; flags: string[] }>} */ (messages)) {
        const parsed = await simpleParser(message.source);

        if (!parsed.from?.value?.length) {
          await client.messageFlagsAdd(message.seq, ['\\Seen']);
          continue;
        }

        const fromAddress = parsed.from.value[0].address?.toLowerCase() || '';
        const subject = parsed.subject || '';
        const textBody = parsed.text || '';

        const inReplyTo = parsed.inReplyTo;
        const references = parsed.references;

        let leadRecord = campaignDb.getRecord(fromAddress);
        if (!leadRecord) {
          if (inReplyTo) {
            leadRecord = campaignDb.getRecordByMessageId(inReplyTo);
          }
          if (!leadRecord && references) {
            if (Array.isArray(references)) {
              for (const ref of references) {
                leadRecord = campaignDb.getRecordByMessageId(ref);
                if (leadRecord) break;
              }
            } else if (typeof references === 'string') {
              leadRecord = campaignDb.getRecordByMessageId(references);
            }
          }
        }

        // ── 1. Check if it's a bounce ──────────────────────────────
        const bounceType = detectBounceType(fromAddress, subject, textBody);

        if (bounceType === 'hard') {
          // Find which campaign lead this bounce is for by scanning the body
          // DSNs usually contain the original recipient address in the body
          const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
          const emailsInBody = textBody.match(emailRegex) || [];
          
          // Exclude the sender's own email to avoid false bounces
          const senderEmail = (user || '').toLowerCase();

          let markedBounce = false;
          for (const foundEmail of emailsInBody) {
            const normalized = foundEmail.toLowerCase();
            if (normalized === senderEmail) continue;

            const record = campaignDb.getRecord(normalized);
            if (record && record.status !== 'bounced') {
              console.log(`   💀 Hard bounce for ${normalized} — marking as bounced.`);
              campaignDb.addOrUpdateRecord(normalized, {
                status: 'bounced',
                failReason: `Hard bounce detected via DSN from ${fromAddress}`,
                bouncedAt: Date.now(),
              });
              newBounces++;
              markedBounce = true;
            }
          }

          if (!markedBounce) {
            console.log(`   ⚠️ Hard bounce from ${fromAddress} — could not match to a lead record.`);
          }

          await client.messageFlagsAdd(message.seq, ['\\Seen']);
          continue;
        }

        if (bounceType === 'soft') {
          // ── Soft bounce 3-strike rule ──────────────────────────────
          // OOO / mailbox-full are temporary — don't DNC on first hit.
          // After 3 soft bounces on the same lead, escalate to hard DNC.
          const SOFT_BOUNCE_THRESHOLD = 3;

          // Try to match the lead from body emails (same logic as hard bounce)
          const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
          const emailsInBody = textBody.match(emailRegex) || [];
          const senderEmail = (user || '').toLowerCase();

          let matchedSoftLead = null;
          for (const foundEmail of emailsInBody) {
            const normalized = foundEmail.toLowerCase();
            if (normalized === senderEmail) continue;
            const rec = campaignDb.getRecord(normalized);
            if (rec && rec.status !== 'bounced' && rec.status !== 'unsubscribed') {
              matchedSoftLead = rec;
              break;
            }
          }

          // Also try matching by fromAddress if body match failed
          if (!matchedSoftLead) {
            const byFrom = campaignDb.getRecord(fromAddress);
            if (byFrom && byFrom.status !== 'bounced' && byFrom.status !== 'unsubscribed') {
              matchedSoftLead = byFrom;
            }
          }

          if (matchedSoftLead) {
            const currentStrikes = (matchedSoftLead.softBounceCount || 0) + 1;
            if (currentStrikes >= SOFT_BOUNCE_THRESHOLD) {
              console.log(`   ⚠️ Soft bounce #${currentStrikes} for ${matchedSoftLead.email} — escalating to DNC.`);
              campaignDb.addOrUpdateRecord(matchedSoftLead.email, {
                status: 'bounced',
                softBounceCount: currentStrikes,
                failReason: `Escalated after ${currentStrikes} soft bounces`,
                bouncedAt: Date.now(),
              });
              newBounces++;
            } else {
              console.log(`   📭 Soft bounce #${currentStrikes}/${SOFT_BOUNCE_THRESHOLD} for ${matchedSoftLead.email} — logged, will retry.`);
              campaignDb.addOrUpdateRecord(matchedSoftLead.email, {
                softBounceCount: currentStrikes,
                lastSoftBounceAt: Date.now(),
              });
            }
          } else {
            console.log(`   📭 Soft bounce from ${fromAddress} — could not match to lead record. Skipping.`);
          }

          await client.messageFlagsAdd(message.seq, ['\\Seen']);
          continue;
        }

        // ── 2. Check if it's an unsubscribe request ────────────────
        if (isUnsubscribeRequest(subject, textBody)) {
          console.log(`   🚫 Unsubscribe request from ${fromAddress}`);
          campaignDb.addUnsubscribe(fromAddress);
          // Also update their record if they're in the campaign
          const record = campaignDb.getRecord(fromAddress);
          if (record) {
            campaignDb.addOrUpdateRecord(fromAddress, {
              status: 'unsubscribed',
              unsubscribedAt: Date.now(),
            });
          }
          newUnsubscribes++;
          await client.messageFlagsAdd(message.seq, ['\\Seen']);
          continue;
        }

        // ── 3. Check if it's a genuine reply from a campaign lead ──
        if (leadRecord && MATCHABLE_STATUSES.includes(/** @type {string} */ (leadRecord.status ?? ''))) {
          console.log(`   🎉 Reply detected from ${fromAddress} (matched to ${leadRecord.email})!`);

          const sentimentResult = await classifySentiment(/** @type {string} */ (textBody), /** @type {string} */ (subject));
          const newStatus = sentimentResult.sentiment === 'negative' ? 'completed_no_interest' : 'interested';

          console.log(`   🧠 Reply sentiment: ${sentimentResult.sentiment} (${sentimentResult.intent}) → status: ${newStatus}`);

          campaignDb.addOrUpdateRecord(leadRecord.email, {
            status: newStatus,
            sentiment: sentimentResult.sentiment,
            intent: sentimentResult.intent,
            repliedAt: Date.now(),
          });

          inboxDb.addMessage({
            leadEmail: leadRecord.email,
            fromAddress: fromAddress,
            subject: subject,
            textBody: textBody,
            htmlBody: parsed.html || '',
            direction: 'inbound',
            accountId: id,
          });

          newReplies++;
          await client.messageFlagsAdd(message.seq, ['\\Seen']);
        }
      }
      }

      console.log(
        `   Account ${id}: ${newReplies} replies, ${newBounces} hard bounces, ${newUnsubscribes} unsubscribes.`
      );
    } finally {
      await lock.release();
    }

    await /** @type {{ logout(): Promise<void> }} */ (client).logout();
  } catch (err) {
    console.warn(`⚠️ Error checking IMAP Account ${id}: ${errOf(err).message}`);
  } finally {
    if (activeClients) {
      const idx = activeClients.indexOf(client);
      if (idx !== -1) activeClients.splice(idx, 1);
    }
  }

  return { newReplies, newBounces, newUnsubscribes };
}

/**
 * Checks all configured IMAP accounts for replies, bounces, and unsubscribes.
 */
async function checkReplies() {
  console.log('🔍 Starting reply detection scan...\n');

  let totalReplies = 0;
  let totalBounces = 0;
  let totalUnsubscribes = 0;
  let accountsChecked = 0;
  /** @type {unknown[]} */
  const activeClients = [];

  let accounts = [];
  const settings = getSettings();

  if (settings.accounts && settings.accounts.length > 0) {
    accounts = settings.accounts.map(/** @param {{ id: string|number; user?: string; email?: string; pass?: string; password?: string; imapHost?: string; host?: string; imapPort?: number|string; port?: number|string }} acc */ (acc) => ({
      id: acc.id,
      user: acc.user || acc.email,
      pass: safeDecryptPassword(acc.pass || acc.password), // ← DECRYPTED
      host: acc.imapHost || acc.host || 'imap.gmail.com',
      port: acc.imapPort || acc.port || 993,
    }));
  } else {
    for (let i = 1; i <= 6; i++) {
      const user = process.env[`EMAIL_${i}_USER`];
      const pass = process.env[`EMAIL_${i}_PASS`];
      const host = process.env[`EMAIL_${i}_IMAP_HOST`] || 'imap.gmail.com';
      const port = process.env[`EMAIL_${i}_IMAP_PORT`] || 993;
      if (user && pass) accounts.push({ id: i, user, pass, host, port });
    }
  }

  if (accounts.length === 0) {
    console.log('❌ No IMAP accounts configured. Skipping reply detection.');
    return { totalReplies: 0, totalBounces: 0, totalUnsubscribes: 0, accountsChecked: 0 };
  }

  const scanWork = (async () => {
    for (const acct of accounts) {
      const result = await checkAccount(
        campaignDb, acct.id, acct.user, acct.pass, acct.host, acct.port, activeClients
      );
      totalReplies += result.newReplies;
      totalBounces += result.newBounces;
      totalUnsubscribes += result.newUnsubscribes;
      accountsChecked++;
    }
  })();

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Reply detection timed out after 30 seconds')),
      OVERALL_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([scanWork, timeout]);
  } catch (err) {
    console.warn(`⚠️ ${errOf(err).message}. Returning partial results.`);
    for (const client of /** @type {{ logout(): Promise<void> }[]} */ (activeClients)) {
      try { await client.logout(); } catch (_e) { /* best-effort logout */ }
    }
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  campaignDb.forceSave();

  console.log(
    `\n✅ Scan complete: ${totalReplies} replies, ${totalBounces} bounces, ${totalUnsubscribes} unsubscribes across ${accountsChecked} accounts.`
  );
  return { totalReplies, totalBounces, totalUnsubscribes, accountsChecked };
}

module.exports = { checkReplies };
