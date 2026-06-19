require('dotenv').config();
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { LeadsDatabase } = require('./db');
const campaignDb = require('./campaignDb');
const inboxDb = require('./inboxDb');
const templates = require('./templates');
const fs = require('fs');
const path = require('path');
const { verifyEmail } = require('./verifier');
const { isWithinBusinessHours } = require('./timeUtils');
const campaignState = require('./campaignState');
const { decrypt, isEncrypted } = require('./cryptoUtils');

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

// ─── Settings ───────────────────────────────────────────────────────

function getSettings() {
  const settingsPath = path.join(__dirname, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing settings.json.');
    }
  }
  return {
    delayMinMs: 300000,
    delayMaxMs: 1200000,
    maxEmailsPerDay: 30,
    startHour: 8,
    endHour: 18,
    bounceThreshold: 0.05,
    sequence: getDefaultSequence(),
  };
}

/**
 * Default sequence used if none is defined in settings.json.
 * Each step: templateKey (maps to templates.js), delayDays (from previous step).
 * Step 0 = initial send, delay is ignored.
 */
function getDefaultSequence() {
  return [
    { step: 0, templateKey: 'initial',  delayDays: 0 },
    { step: 1, templateKey: 'followup1', delayDays: 4 },
    { step: 2, templateKey: 'followup2', delayDays: 5 },
    { step: 3, templateKey: 'followup3', delayDays: 6 },
    { step: 4, templateKey: 'breakup',   delayDays: 7 },
  ];
}

// ─── Step → Status mapping ──────────────────────────────────────────

const STEP_TO_STATUS = {
  0: 'sent',
  1: 'followed_up_1',
  2: 'followed_up_2',
  3: 'followed_up_3',
  4: 'completed_no_interest',
};

const STATUS_TO_STEP = Object.fromEntries(
  Object.entries(STEP_TO_STATUS).map(([k, v]) => [v, Number(k)])
);

/**
 * Returns the next sequence step index for a given record.
 * Returns null if the sequence is complete.
 */
function getNextStep(record, sequence) {
  if (record.status === 'pending') return 0;

  const currentStep = STATUS_TO_STEP[record.status];
  if (currentStep === undefined) return null;

  const nextStep = currentStep + 1;
  if (nextStep >= sequence.length) return null;

  return nextStep;
}

/**
 * Returns true if enough time has passed since the last contact
 * to send the next step in the sequence.
 */
function isReadyForNextStep(record, nextStepDef) {
  if (nextStepDef.step === 0) return true; // Initial send — always ready

  const lastContactedAt =
    record.followedUp3At ||
    record.followedUp2At ||
    record.followedUp1At ||
    record.sentAt ||
    null;

  if (!lastContactedAt) return true;

  const delayMs = nextStepDef.delayDays * 24 * 60 * 60 * 1000;
  return Date.now() - lastContactedAt >= delayMs;
}

// ─── Transporter ────────────────────────────────────────────────────

function safeDecryptPassword(password) {
  if (!password) return '';
  if (isEncrypted(password)) {
    try { return decrypt(password); } catch (e) {
      console.error('Failed to decrypt password:', e.message);
      return '';
    }
  }
  console.warn('⚠️ Plain text password detected. Re-add account through dashboard.');
  return password;
}

function buildTransporters() {
  const settings = getSettings();
  if (settings.accounts && settings.accounts.length > 0) {
    return settings.accounts.map(acc => ({
      id: acc.id,
      user: acc.user || acc.email,
      pass: safeDecryptPassword(acc.pass || acc.password),
      smtpHost: acc.smtpHost || 'smtp.gmail.com',
      smtpPort: parseInt(String(acc.smtpPort || '465'), 10),
      imapHost: acc.imapHost || 'imap.gmail.com',
      imapPort: parseInt(String(acc.imapPort || '993'), 10),
      transporter: null, // built lazily below
    })).map(acc => ({
      ...acc,
      transporter: nodemailer.createTransport({
        host: acc.smtpHost,
        port: acc.smtpPort,
        secure: true,
        auth: { user: acc.user, pass: acc.pass },
      }),
    }));
  }

  const result = [];
  for (let i = 1; i <= 6; i++) {
    const user = process.env[`EMAIL_${i}_USER`];
    if (user) {
      const pass = process.env[`EMAIL_${i}_PASS`] || '';
      result.push({
        id: i,
        user,
        pass,
        smtpHost: process.env[`EMAIL_${i}_SMTP_HOST`] || 'smtp.gmail.com',
        smtpPort: parseInt(process.env[`EMAIL_${i}_SMTP_PORT`] || '465', 10),
        imapHost: process.env[`EMAIL_${i}_IMAP_HOST`] || 'imap.gmail.com',
        imapPort: parseInt(process.env[`EMAIL_${i}_IMAP_PORT`] || '993', 10),
        transporter: nodemailer.createTransport({
          host: process.env[`EMAIL_${i}_SMTP_HOST`] || 'smtp.gmail.com',
          port: parseInt(process.env[`EMAIL_${i}_SMTP_PORT`] || '465', 10),
          secure: true,
          auth: { user, pass },
        }),
      });
    }
  }
  return result;
}

function checkBounceRate(account, bounceThreshold) {
  const stats = campaignDb.getAccountStats(account.id);
  if (stats.totalSent > 0 && stats.bounceRate > bounceThreshold) {
    console.warn(
      `⚠️ AUTO-PAUSE: Account ${account.id} has ${(stats.bounceRate * 100).toFixed(1)}% bounce rate. Skipping.`
    );
    return false;
  }
  return true;
}

// ─── Timestamp field per step ───────────────────────────────────────

function getTimestampField(step) {
  const fields = {
    0: 'sentAt',
    1: 'followedUp1At',
    2: 'followedUp2At',
    3: 'followedUp3At',
  };
  return fields[step] || 'sentAt';
}

// ─── Custom platform sentence ───────────────────────────────────────

function getCustomSentence(platform) {
  if (platform === 'Shopify')
    return 'I noticed your store is running on Shopify, which is an excellent platform.';
  if (platform === 'WooCommerce')
    return 'I noticed your store is built on WooCommerce, which gives you great flexibility.';
  if (platform === 'WordPress')
    return 'I noticed you built your site on WordPress, which is a great choice.';
  const generic = [
    'I noticed your beautiful website and wanted to reach out.',
    'Your website design is really impressive, and I just had to get in touch.',
    'I came across your site and really loved the user experience.',
    "I was browsing your website and was really impressed by what you've built.",
  ];
  return generic[Math.floor(Math.random() * generic.length)];
}

// ─── Main sequence loop ─────────────────────────────────────────────

async function runSequence() {
  const isDryRun = process.argv.includes('--dry-run');
  const settings = getSettings();
  const senderDetails = getSenderDetails(settings);
  const sequence = settings.sequence || getDefaultSequence();
  const transporters = buildTransporters();

  if (transporters.length === 0) {
    console.log('❌ No SMTP accounts found. Exiting.');
    return;
  }

  // Sync leads into campaignDb
  const leadsDb = new LeadsDatabase();
  const leadsWithEmails = leadsDb.getAll().filter(b => b.emails?.length > 0);
  for (const lead of leadsWithEmails) {
    const primaryEmail = lead.emails[0].toLowerCase();
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

  // Build the work queue: all records that are actionable
  const ACTIONABLE_STATUSES = ['pending', 'sent', 'followed_up_1', 'followed_up_2', 'followed_up_3'];
  const allRecords = campaignDb.getAllRecords().filter(r =>
    ACTIONABLE_STATUSES.includes(r.status)
  );

  // Determine which records are ready for their next step
  const readyQueue = allRecords
    .map(record => {
      const nextStep = getNextStep(record, sequence);
      if (nextStep === null) return null;
      const stepDef = sequence[nextStep];
      if (!isReadyForNextStep(record, stepDef)) return null;
      return { record, nextStep, stepDef };
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Prioritize initial sends over follow-ups
      if (a.nextStep !== b.nextStep) return a.nextStep - b.nextStep;
      // Within same step, prioritize Shopify/WooCommerce
      const priority = ['Shopify', 'WooCommerce', 'Magento', 'WordPress'];
      const aPrio = priority.includes(a.record.platform) ? 1 : 0;
      const bPrio = priority.includes(b.record.platform) ? 1 : 0;
      return bPrio - aPrio;
    });

  console.log('\n📊 Sequence Runner Status:');
  console.log(`   Total actionable records: ${allRecords.length}`);
  console.log(`   Ready to send now: ${readyQueue.length}`);
  console.log(`   Accounts available: ${transporters.length}`);
  console.log(`   Daily limit per account: ${settings.maxEmailsPerDay}`);
  if (settings.maxDailyTotal) console.log(`   Global Daily Limit: ${settings.maxDailyTotal}`);
  console.log(`   Sequence steps: ${sequence.length}`);
  console.log(isDryRun ? '   ⚠️ DRY RUN MODE\n' : '\n');

  if (readyQueue.length === 0) {
    console.log('✅ Nothing ready to send right now.');
    return;
  }

  if (!campaignState.isRunning()) {
    const state = campaignState.getState();
    console.log(`⏸️ Campaign is ${state.status}. Exiting.`);
    return;
  }

  let queueIndex = 0;
  let accountIndex = 0;

  while (queueIndex < readyQueue.length) {
    if (!campaignState.isRunning()) break;

    const timeCheck = isWithinBusinessHours(settings.startHour, settings.endHour);
    if (!timeCheck.valid) {
      console.log(`🌙 Outside business hours. Waiting 1 hour...`);
      await new Promise(r => setTimeout(r, 60 * 60 * 1000));
      continue;
    }

    const account = transporters[accountIndex % transporters.length];
    accountIndex++;

    const warmup = campaignDb.getWarmupStatus(account.id);
    const accountMax = warmup?.level ? warmup.level * 10 : settings.maxEmailsPerDay;
    const dailyCount = campaignDb.getDailyCount(account.id);
    const globalCount = campaignDb.getTotalDailyCount();

    if (settings.maxDailyTotal && globalCount >= settings.maxDailyTotal) {
      console.log(`⚠️ Global daily limit of ${settings.maxDailyTotal} reached. Stopping.`);
      break;
    }

    if (dailyCount >= accountMax) {
      const allMaxed = transporters.every(t => {
        const tw = campaignDb.getWarmupStatus(t.id);
        const tMax = tw?.level ? tw.level * 10 : settings.maxEmailsPerDay;
        return campaignDb.getDailyCount(t.id) >= tMax;
      });
      if (allMaxed) {
        console.log('⚠️ All accounts hit daily limit. Stopping.');
        break;
      }
      continue;
    }

    if (!checkBounceRate(account, settings.bounceThreshold || 0.05)) {
      const healthy = transporters.filter(t =>
        checkBounceRate(t, settings.bounceThreshold || 0.05)
      );
      if (healthy.length === 0) {
        console.log('🛑 All accounts exceed bounce threshold. Stopping.');
        campaignState.pause('All accounts exceeded bounce rate');
        break;
      }
      continue;
    }

    const { record, nextStep, stepDef } = readyQueue[queueIndex];
    queueIndex++;

    // Re-check status hasn't changed since queue was built
    const freshRecord = campaignDb.getRecord(record.email);
    if (!freshRecord || !ACTIONABLE_STATUSES.includes(freshRecord.status)) {
      console.log(`   ⏭️ Skipping ${record.email} — status changed.`);
      continue;
    }

    if (campaignDb.isUnsubscribed(record.email)) {
      console.log(`   🚫 Skipping unsubscribed: ${record.email}`);
      campaignDb.addOrUpdateRecord(record.email, { status: 'unsubscribed' });
      continue;
    }

    // Only verify email on the very first send
    if (nextStep === 0) {
      console.log(`[Account ${account.id}] Verifying ${record.email}...`);
      const verification = await verifyEmail(record.email);
      if (!verification.valid) {
        console.log(`   ❌ Invalid: ${record.email} (${verification.reason})`);
        campaignDb.addOrUpdateRecord(record.email, {
          status: 'failed',
          failReason: verification.reason,
        });
        continue;
      }
    }

    const emailData = templates.getEmail(stepDef.templateKey, {
      companyName: record.businessName,
      website: record.website || '',
      city: record.city || '',
      state: record.state || '',
      platform: record.platform || 'Other',
      customSentence: getCustomSentence(record.platform),
    });

    const newStatus = STEP_TO_STATUS[nextStep] || 'sent';
    const timestampField = getTimestampField(nextStep);

    console.log(
      `[Account ${account.id}] Step ${nextStep} → ${record.email} ` +
      `(${dailyCount + 1}/${accountMax} today) [${stepDef.templateKey}]`
    );

    if (isDryRun) {
      console.log(`   📝 DRY RUN: Subject: ${emailData.subject}`);
      campaignDb.incrementDailyCount(account.id);
      campaignDb.addOrUpdateRecord(record.email, {
        status: newStatus,
        [timestampField]: Date.now(),
        accountId: account.id,
        messageId: 'dry-run-id',
      });
    } else {
      try {
        const info = await account.transporter.sendMail({
          from: `"${senderDetails.displayName}" <${account.user}>`,
          to: record.email,
          subject: emailData.subject,
          text: emailData.text + senderDetails.footer,
          headers: {
            'List-Unsubscribe': `<mailto:${account.user}?subject=unsubscribe>`
          }
        });

        campaignDb.incrementDailyCount(account.id);
        campaignDb.addOrUpdateRecord(record.email, {
          status: newStatus,
          [timestampField]: Date.now(),
          accountId: account.id,
          messageId: info.messageId,
        });

        // Save outbound message to inbox thread
        inboxDb.addMessage({
          leadEmail: record.email,
          fromAddress: account.user,
          subject: emailData.subject,
          textBody: emailData.text + senderDetails.footer,
          htmlBody: '',
          direction: 'outbound',
          accountId: account.id,
        });

        console.log(`   ✅ Sent. MessageId: ${info.messageId}`);
      } catch (err) {
        console.error(`   ❌ SMTP Error: ${err.message}`);
        campaignDb.addOrUpdateRecord(record.email, {
          status: 'bounced',
          failReason: err.message,
          bouncedAt: Date.now(),
        });
      }
    }

    if (queueIndex < readyQueue.length) {
      const delayMs =
        Math.floor(Math.random() * (settings.delayMaxMs - settings.delayMinMs + 1)) +
        settings.delayMinMs;
      console.log(`   ⏲️ Sleeping ${(delayMs / 1000 / 60).toFixed(1)} min...\n`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  campaignDb.forceSave();
  console.log('\n🎉 Sequence run complete.');
}

module.exports = { runSequence };
if (require.main === module) runSequence();
