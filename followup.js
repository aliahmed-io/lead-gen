require('dotenv').config();
const nodemailer = require('nodemailer');
const campaignDb = require('./campaignDb');
const templates = require('./templates');
const fs = require('fs');
const path = require('path');
const { isWithinBusinessHours } = require('./timeUtils');
const campaignState = require('./campaignState');

const SENDER_DISPLAY_NAME = 'Ali | Aethelon Labs';
const CAN_SPAM_FOOTER = [
  '',
  '---',
  'If you no longer wish to receive emails from us, please reply with "unsubscribe".',
  `${SENDER_DISPLAY_NAME} | 123 Business St, Suite 100, Austin, TX 78701`,
].join('\n');

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

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
 * Builds the SMTP transporter map from settings.accounts or .env configuration, keyed by account ID.
 *
 * @returns {Record<number, { id: number, user: string, transporter: object }>}
 */
function buildTransporters() {
  const settings = getSettings();
  const result = {};

  if (settings.accounts && settings.accounts.length > 0) {
    for (const acc of settings.accounts) {
      const user = acc.user || acc.email;
      const pass = acc.pass || acc.password;
      const host = acc.smtpHost || acc.host || 'smtp.gmail.com';
      const port = parseInt(String(acc.smtpPort || acc.port || '465'), 10);
      result[acc.id] = {
        id: acc.id,
        user,
        transporter: nodemailer.createTransport({
          host,
          port,
          secure: true,
          auth: { user, pass },
        }),
      };
    }
    return result;
  }

  for (let i = 1; i <= 6; i++) {
    const user = process.env[`EMAIL_${i}_USER`];
    if (user) {
      result[i] = {
        id: i,
        user: user,
        transporter: nodemailer.createTransport({
          host: process.env[`EMAIL_${i}_SMTP_HOST`] || 'smtp.gmail.com',
          port: parseInt(process.env[`EMAIL_${i}_SMTP_PORT`] || '465', 10),
          secure: true,
          auth: {
            user: user,
            pass: process.env[`EMAIL_${i}_PASS`],
          },
        }),
      };
    }
  }
  return result;
}

/**
 * Builds the list of follow-up candidates from the campaign database.
 *
 * @param {CampaignDatabase} campaignDb
 * @returns {Array<object>}
 */
function buildFollowUpCandidates(campaignDb) {
  const now = Date.now();
  const allRecords = campaignDb.getAllRecords();

  return allRecords.reduce((acc, r) => {
    if (r.status === 'sent' && r.sentAt !== null && (now - r.sentAt > THREE_DAYS_MS)) {
      acc.push({ ...r, nextStage: 1 });
    } else if (r.status === 'followed_up_1' && r.followedUp1At !== null && (now - r.followedUp1At > FOUR_DAYS_MS)) {
      acc.push({ ...r, nextStage: 2 });
    } else if (r.status === 'followed_up_2' && r.followedUp2At !== null && (now - r.followedUp2At > FIVE_DAYS_MS)) {
      acc.push({ ...r, nextStage: 3 });
    }
    return acc;
  }, []);
}

/**
 * Main follow-up entry point. Initializes the campaign database and
 * transporters, finds leads needing follow-up, and sends follow-up emails.
 *
 * Safe to import — all initialization runs inside this function, not at
 * module load time.
 */
async function startFollowUps() {
  const isDryRun = process.argv.includes('--dry-run');

  const transporters = buildTransporters();

  const followUpCandidates = buildFollowUpCandidates(campaignDb);

  console.log('📊 Follow-Up Status:');
  console.log(`   Total Candidates found: ${followUpCandidates.length}`);
  console.log(isDryRun ? '   ⚠️ DRY RUN MODE ACTIVE\n' : '\n');

  if (followUpCandidates.length === 0) {
    console.log('✅ No leads are ready for follow-up right now. Done.');
    return;
  }

  if (!campaignState.isRunning()) {
    const state = campaignState.getState();
    console.log(`⏸️  Campaign is ${state.status}${state.pauseReason ? ` (${state.pauseReason})` : ''}. Skipping follow-ups.`);
    return;
  }

  const settings = getSettings();
  const timeCheck = isWithinBusinessHours(settings.startHour, settings.endHour);
  if (!timeCheck.valid) {
    console.log(`🌙 Follow-up sequence pausing... ${timeCheck.reason}`);
    return;
  }



  for (let i = 0; i < followUpCandidates.length; i++) {
    if (!campaignState.isRunning()) {
      const state = campaignState.getState();
      console.log(`⏸️  Campaign ${state.status} during follow-up loop. Stopping.`);
      break;
    }

    const lead = followUpCandidates[i];

    if (lead.nextStage === 3) {
      console.log(`[${i + 1}/${followUpCandidates.length}] ➡️ Marking as completed (no interest): ${lead.email}`);
      if (!isDryRun) {
        campaignDb.addOrUpdateRecord(lead.email, {
          status: 'completed_no_interest',
          completedAt: Date.now(),
        });
      }
      continue;
    }

    if (campaignDb.isUnsubscribed(lead.email)) {
      console.log(`   🚫 Skipping unsubscribed email: ${lead.email}`);
      continue;
    }

    const accountId = lead.accountId;
    const activeAccount = transporters[accountId];

    if (!activeAccount) {
      console.warn(`⚠️ Cannot send follow-up to ${lead.email}: Account ${accountId} not found in .env`);
      continue;
    }

    const warmup = campaignDb.getWarmupStatus(accountId);
    const accountMaxEmails = (warmup && warmup.level) ? warmup.level * 10 : settings.maxEmailsPerDay;

    const dailyCount = campaignDb.getDailyCount(accountId);
    if (dailyCount >= accountMaxEmails) {
      console.log(`⚠️ Account ${accountId} reached daily limit of ${accountMaxEmails}. Skipping follow-up for ${lead.email}.`);
      continue;
    }

    const templateData = {
      companyName: lead.businessName,
      website: lead.website || '',
      city: lead.city || '',
      state: lead.state || '',
      platform: lead.platform || 'Other',
    };

    const emailData = lead.nextStage === 1
      ? templates.getFollowUpEmail1(templateData)
      : templates.getFollowUpEmail2(templateData);

    console.log(`[${i + 1}/${followUpCandidates.length}] ➡️ Sending Follow-up ${lead.nextStage} to: ${lead.email} via Account ${accountId} (${dailyCount + 1}/${settings.maxEmailsPerDay} today)`);

    if (isDryRun) {
      console.log(`   📝 Subject: ${emailData.subject}`);
      campaignDb.incrementDailyCount(accountId);
      if (lead.nextStage === 1) {
        campaignDb.addOrUpdateRecord(lead.email, { status: 'followed_up_1', followedUp1At: Date.now() });
      } else {
        campaignDb.addOrUpdateRecord(lead.email, { status: 'followed_up_2', followedUp2At: Date.now() });
      }
    } else {
      try {
        const mailOptions = {
          from: `"${SENDER_DISPLAY_NAME}" <${activeAccount.user}>`,
          to: lead.email,
          subject: emailData.subject,
          text: emailData.text + CAN_SPAM_FOOTER,
        };

        if (lead.messageId) {
          mailOptions.inReplyTo = lead.messageId;
          mailOptions.references = [lead.messageId];
        }

        const info = await activeAccount.transporter.sendMail(mailOptions);

        campaignDb.incrementDailyCount(accountId);

        if (lead.nextStage === 1) {
          campaignDb.addOrUpdateRecord(lead.email, { status: 'followed_up_1', followedUp1At: Date.now() });
        } else {
          campaignDb.addOrUpdateRecord(lead.email, { status: 'followed_up_2', followedUp2At: Date.now() });
        }

        console.log(`   ✅ Follow-up ${lead.nextStage} sent! MessageId: ${info.messageId}`);
      } catch (err) {
        console.error(`   ❌ Error sending follow-up: ${err.message}`);
        continue;
      }

      if (i < followUpCandidates.length - 1) {
        if (followUpCandidates[i + 1].nextStage !== 3) {
          const delayMs = Math.floor(Math.random() * (settings.delayMaxMs - settings.delayMinMs + 1)) + settings.delayMinMs;
          console.log(`   ⏲️ Pausing for ${(delayMs / 1000 / 60).toFixed(2)} minutes...\n`);
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
  }

  campaignDb.forceSave();
  console.log('\n🎉 Follow-up sequence complete!');
}

module.exports = { startFollowUps };

if (require.main === module) {
  startFollowUps();
}
