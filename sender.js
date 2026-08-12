require('dotenv').config();
const { errOf } = require('./utils');
const nodemailer = require('nodemailer');
const { LeadsDatabase } = require('./db');
const campaignDb = require('./campaignDb');
const templates = require('./templates');
const fs = require('fs');
const path = require('path');
const { verifyEmail } = require('./verifier');
const { isWithinBusinessHours } = require('./timeUtils');
const campaignState = require('./campaignState');
const { decrypt, isEncrypted } = require('./cryptoUtils');

/**
 * @param {CampaignSettings} settings
 */
function getSenderDetails(settings) {
  const displayName = settings.senderDisplayName || 'Sales Team';
  const address = settings.physicalAddress || '123 Business St, City, State 12345';
  return {
    displayName,
    footer: [
      '',
      '---',
      'If you no longer wish to receive emails from us, please reply with "unsubscribe".',
      `${displayName} | ${address}`,
    ].join('\n')
  };
}

function getSettings() {
  const settingsPath = path.join(__dirname, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing settings.json. Using defaults.');
    }
  }
  return { delayMinMs: 300000, delayMaxMs: 1200000, maxEmailsPerDay: 30, startHour: 8, endHour: 18, bounceThreshold: 0.05 };
}

/**
 * Safely decrypts a password field.
 * If it looks encrypted, decrypt it. If it is plain text (legacy), use as-is
 * and log a warning so you know to re-save it encrypted.
 */
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
  // Plain text fallback — warn loudly
  console.warn('⚠️  WARNING: Plain text password detected. Re-add this account through the dashboard to encrypt it.');
  return password;
}

/**
 * Builds the array of SMTP transporter objects.
 * Credentials are decrypted at runtime — never stored decrypted.
 */
function buildTransporters() {
  const settings = getSettings();
  if (settings.accounts && settings.accounts.length > 0) {
    return settings.accounts.map(/** @param {EmailAccount} acc */ (acc) => {
      const user = acc.user || acc.email;
      const pass = safeDecryptPassword(acc.pass || acc.password);
      const host = acc.smtpHost || acc.host || 'smtp.gmail.com';
      const port = parseInt(String(acc.smtpPort || acc.port || '465'), 10);
      return {
        id: acc.id,
        user,
        transporter: nodemailer.createTransport({
          host,
          port,
          secure: true,
          auth: { user, pass },
        }),
      };
    });
  }

  // .env fallback
  const result = [];
  for (let i = 1; i <= 6; i++) {
    const user = process.env[`EMAIL_${i}_USER`];
    if (user) {
      result.push({
        id: i,
        user,
        transporter: nodemailer.createTransport({
          host: process.env[`EMAIL_${i}_SMTP_HOST`] || 'smtp.gmail.com',
          port: parseInt(process.env[`EMAIL_${i}_SMTP_PORT`] || '465', 10),
          secure: true,
          auth: {
            user,
            pass: process.env[`EMAIL_${i}_PASS`],
          },
        }),
      });
    }
  }
  return result;
}

/**
 * Checks the bounce rate for an account and auto-pauses if it exceeds the threshold.
 *
 * @param {{ getAccountStats(id: string|number): { totalSent: number; bounceRate: number; bounceCount: number } }} campaignDb
 * @param {{ id: string|number; user: string }} account
 * @param {number} bounceThreshold
 * @returns {boolean} true if the account is safe to send, false if auto-paused.
 */
function checkBounceRate(campaignDb, account, bounceThreshold) {
  const stats = campaignDb.getAccountStats(account.id);
  if (stats.totalSent > 0 && stats.bounceRate > bounceThreshold) {
    console.warn(`⚠️ AUTO-PAUSE: Account ${account.id} (${account.user}) has ${(stats.bounceRate * 100).toFixed(1)}% bounce rate (${stats.bounceCount}/${stats.totalSent}). Skipping.`);
    return false;
  }
  return true;
}

/**
 * Main campaign entry point. Initializes databases, syncs leads, builds the
 * pending queue, and sends initial outreach emails using round-robin account
 * rotation.
 *
 * Safe to import — all initialization runs inside this function, not at
 * module load time.
 */
async function startCampaign() {
  const isDryRun = process.argv.includes('--dry-run');

  const leadsDb = new LeadsDatabase();

  const transporters = buildTransporters();

  if (transporters.length === 0) {
    console.log('❌ No SMTP accounts found in .env file! Skipping sender module.');
    return;
  }

  console.log('📤 Syncing leads from leads_db.json to Campaign Database...');
  const leadsWithEmails = leadsDb.getAll().filter(b => b.emails && b.emails.length > 0);

  for (const lead of /** @type {LeadRecord[]} */ (leadsWithEmails)) {
    const primaryEmail = (lead.emails || [])[0].toLowerCase();
    if (!campaignDb.getRecord(primaryEmail)) {
      campaignDb.addOrUpdateRecord(primaryEmail, {
        businessName: lead.name,
        platform: lead.platform || 'Other',
        website: lead.website || '',
        city: lead.city || '',
        state: lead.state || '',
      });
    }
  }

  const priorityPlatforms = ['Shopify', 'WooCommerce', 'Magento', 'WordPress'];
  const pendingQueue = campaignDb.getAllRecords()
    .filter(r => r.status === 'pending')
    .sort((a, b) => {
      const aPriority = priorityPlatforms.includes(/** @type {string} */ (a.platform || '')) ? 1 : 0;
      const bPriority = priorityPlatforms.includes(/** @type {string} */ (b.platform || '')) ? 1 : 0;
      return bPriority - aPriority;
    });
  const settings = getSettings();
  const senderDetails = getSenderDetails(settings);

  console.log('\n📊 Campaign Status:');
  console.log(`   Total Leads: ${leadsWithEmails.length}`);
  console.log(`   Pending Sends in Queue: ${pendingQueue.length}`);
  console.log(`   Using Accounts: ${transporters.length}`);
  console.log(`   Daily Limit Per Account: ${settings.maxEmailsPerDay}`);
  if (settings.maxDailyTotal) console.log(`   Global Daily Limit: ${settings.maxDailyTotal}`);
  console.log(isDryRun ? '   ⚠️ DRY RUN MODE ACTIVE (No emails will be sent)\n' : '\n');

  if (pendingQueue.length === 0) {
    console.log('✅ No pending leads in the queue. Done.');
    return;
  }

  if (!campaignState.isRunning()) {
    const state = campaignState.getState();
    console.log(`⏸️  Campaign is ${state.status}${state.pauseReason ? ` (${state.pauseReason})` : ''}. Exiting.`);
    return;
  }

  console.log('🚀 Starting round-robin campaign...\n');

  let queueIndex = 0;
  let accountIndex = 0;

  while (queueIndex < pendingQueue.length) {
    if (!campaignState.isRunning()) {
      const state = campaignState.getState();
      console.log(`⏸️  Campaign ${state.status} during send loop. Stopping.`);
      break;
    }

    const timeCheck = isWithinBusinessHours(settings.startHour, settings.endHour);
    if (!timeCheck.valid) {
      console.log(`🌙 Pausing... ${timeCheck.reason}. Will retry in 1 hour.`);
      await new Promise(r => setTimeout(r, 60 * 60 * 1000));
      continue;
    }

    const account = transporters[accountIndex % transporters.length];
    accountIndex++;

    const warmup = /** @type {{ level?: number }} */ (campaignDb.getWarmupStatus(account.id));
    const accountMaxEmails = (warmup && warmup.level) ? warmup.level * 10 : settings.maxEmailsPerDay;

    const dailyCount = campaignDb.getDailyCount(account.id);
    const globalCount = campaignDb.getTotalDailyCount();

    if (settings.maxDailyTotal && globalCount >= settings.maxDailyTotal) {
      console.log(`⚠️ Global daily limit of ${settings.maxDailyTotal} reached. Stopping.`);
      break;
    }

    if (dailyCount >= accountMaxEmails) {
      const allMaxed = transporters.every(/** @param {{ id: string|number }} t */ (t) => {
        const tWarmup = /** @type {{ level?: number }} */ (campaignDb.getWarmupStatus(t.id));
        const tMax = (tWarmup && tWarmup.level) ? tWarmup.level * 10 : settings.maxEmailsPerDay;
        return campaignDb.getDailyCount(t.id) >= tMax;
      });
      if (allMaxed) {
        console.log('⚠️ All accounts have reached their daily sending limits. Stopping.');
        break;
      }
      continue;
    }

    if (!checkBounceRate(campaignDb, account, settings.bounceThreshold || 0.05)) {
      const healthyAccounts = transporters.filter(/** @param {{ id: string|number; user: string }} t */ (t) => checkBounceRate(campaignDb, t, settings.bounceThreshold || 0.05));
      if (healthyAccounts.length === 0) {
        console.log('🛑 All accounts exceed bounce rate threshold. Stopping campaign.');
        campaignState.pause('All accounts exceeded bounce rate');
        break;
      }
      continue;
    }

    const lead = pendingQueue[queueIndex];
    queueIndex++;

    const currentRecord = campaignDb.getRecord(lead.email);
    if (currentRecord && currentRecord.status !== 'pending') {
      console.log(`   ⏭️ Skipping ${lead.email} - status changed to ${currentRecord.status}`);
      continue;
    }

    if (campaignDb.isUnsubscribed(lead.email)) {
      console.log(`   🚫 Skipping unsubscribed email: ${lead.email}`);
      campaignDb.addOrUpdateRecord(lead.email, { status: 'failed', failReason: 'Unsubscribed' });
      continue;
    }

    console.log(`[Account ${account.id}] Verifying ${lead.email}...`);
    const verification = await verifyEmail(lead.email);
    if (!verification.valid) {
      const reason = /** @type {string} */ (verification.reason || 'Invalid email');
      console.log(`   ❌ Bad Email: ${lead.email} (${reason}). Marking as failed.`);
      campaignDb.addOrUpdateRecord(lead.email, { status: 'failed', failReason: reason });
      continue;
    }

    let customSentence = 'I noticed your beautiful website and wanted to reach out.';
    if (lead.platform === 'Shopify') {
      customSentence = 'I noticed your store is running on Shopify, which is an excellent platform.';
    } else if (lead.platform === 'WooCommerce') {
      customSentence = 'I noticed your store is built on WooCommerce, which gives you great flexibility.';
    } else if (lead.platform === 'WordPress') {
      customSentence = 'I noticed you built your site on WordPress, which is a great choice.';
    } else {
      const genericCompliments = [
        'I noticed your beautiful website and wanted to reach out.',
        'Your website design is really impressive, and I just had to get in touch.',
        'I came across your site and really loved the user experience.',
        'Your online presence is fantastic, and I wanted to connect.',
        "I was browsing your website and was really impressed by what you've built."
      ];
      customSentence = genericCompliments[Math.floor(Math.random() * genericCompliments.length)];
    }

    const emailData = templates.getEmail('initial', {
      companyName: lead.businessName,
      website: lead.website || '',
      city: lead.city || '',
      state: lead.state || '',
      platform: lead.platform || 'Other',
      customSentence: customSentence,
    });

    const updatedDailyCount = campaignDb.getDailyCount(account.id);
    console.log(`[Account ${account.id}] ➡️ Sending to: ${lead.email} (${updatedDailyCount + 1}/${accountMaxEmails} today)`);

    if (isDryRun) {
      console.log(`   📝 Subject: ${emailData.subject}`);
      campaignDb.incrementDailyCount(account.id);
      campaignDb.addOrUpdateRecord(lead.email, {
        status: 'sent',
        sentAt: Date.now(),
        accountId: account.id,
        messageId: 'dry-run-message-id',
      });
    } else {
      try {
        const info = await account.transporter.sendMail({
          from: `"${senderDetails.displayName}" <${account.user}>`,
          to: lead.email,
          subject: emailData.subject,
          text: emailData.text + senderDetails.footer,
          headers: {
            'List-Unsubscribe': `<mailto:${account.user}?subject=unsubscribe>`
          }
        });

        campaignDb.incrementDailyCount(account.id);
        campaignDb.addOrUpdateRecord(lead.email, {
          status: 'sent',
          sentAt: Date.now(),
          accountId: account.id,
          messageId: info.messageId,
        });

        console.log(`   ✅ Sent successfully! MessageId: ${info.messageId}`);
      } catch (err) {
        console.error(`   ❌ SMTP Error sending to ${lead.email}: ${errOf(err).message}`);
        campaignDb.addOrUpdateRecord(lead.email, { status: 'bounced', failReason: errOf(err).message });
        continue;
      }
    }

    if (queueIndex < pendingQueue.length) {
      const delayMs = Math.floor(Math.random() * (settings.delayMaxMs - settings.delayMinMs + 1)) + settings.delayMinMs;
      console.log(`   ⏲️ Account ${account.id} sleeping for ${(delayMs / 1000 / 60).toFixed(2)} minutes...\n`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  campaignDb.forceSave();
  console.log('\n🎉 Campaign send cycle complete!');
}

module.exports = { startCampaign };

if (require.main === module) {
  startCampaign();
}
