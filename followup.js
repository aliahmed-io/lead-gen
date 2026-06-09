require('dotenv').config();
const nodemailer = require('nodemailer');
const CampaignDatabase = require('./campaignDb');
const templates = require('./templates');
const fs = require('fs');
const path = require('path');
const { isWithinBusinessHours } = require('./timeUtils');

function getSettings() {
  const settingsPath = path.join(__dirname, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing settings.json. Using defaults.');
    }
  }
  return { delayMinMs: 300000, delayMaxMs: 1200000, maxEmailsPerDay: 30 };
}

const isDryRun = process.argv.includes('--dry-run');

const campaignDb = new CampaignDatabase();

// 1. Setup Transporters
const transporters = {};
for (let i = 1; i <= 6; i++) {
  const user = process.env[`EMAIL_${i}_USER`];
  if (user) {
    transporters[i] = {
      id: i,
      user: user,
      transporter: nodemailer.createTransport({
        host: process.env[`EMAIL_${i}_SMTP_HOST`] || 'smtp.gmail.com',
        port: parseInt(process.env[`EMAIL_${i}_SMTP_PORT`] || 465),
        secure: true,
        auth: {
          user: user,
          pass: process.env[`EMAIL_${i}_PASS`],
        }
      })
    };
  }
}

// 2. Find leads needing follow-up
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const now = Date.now();

const allRecords = campaignDb.getAllRecords();

// We map candidates to include their next 'stage'
const followUpCandidates = allRecords.reduce((acc, r) => {
  if (r.status === 'sent' && r.sentAt !== null && (now - r.sentAt > THREE_DAYS_MS)) {
    acc.push({ ...r, nextStage: 1 });
  } 
  else if (r.status === 'followed_up_1' && r.followedUp1At !== null && (now - r.followedUp1At > FOUR_DAYS_MS)) {
    acc.push({ ...r, nextStage: 2 });
  }
  else if (r.status === 'followed_up_2' && r.followedUp2At !== null && (now - r.followedUp2At > FIVE_DAYS_MS)) {
    acc.push({ ...r, nextStage: 3 }); // Completion stage (no email)
  }
  return acc;
}, []);

console.log(`\u{1F4CA} Follow-Up Status:`);
console.log(`   Total Candidates found: ${followUpCandidates.length}`);
console.log(isDryRun ? `   \u26A0\uFE0F DRY RUN MODE ACTIVE\n` : `\n`);

if (followUpCandidates.length === 0) {
  console.log('\u2705 No leads are ready for follow-up right now. Exiting.');
  process.exit(0);
}

async function startFollowUps() {
  const timeCheck = isWithinBusinessHours();
  if (!timeCheck.valid) {
    console.log(`\u{1F319} Follow-up sequence pausing... ${timeCheck.reason}`);
    return; // Stop the sequence. Cron will trigger it again later.
  }

  for (let i = 0; i < followUpCandidates.length; i++) {
    const lead = followUpCandidates[i];

    // Stage 3: Auto-complete (No email sent)
    if (lead.nextStage === 3) {
      console.log(`[${i + 1}/${followUpCandidates.length}] \u27A1\uFE0F Marking as completed (no interest): ${lead.email}`);
      if (!isDryRun) {
        campaignDb.addOrUpdateRecord(lead.email, {
          status: 'completed_no_interest',
          completedAt: Date.now()
        });
      }
      continue; // Move to next lead instantly without delay
    }
    
    // We MUST use the same account that sent the initial email to maintain the thread
    const accountId = lead.accountId;
    const activeAccount = transporters[accountId];

    if (!activeAccount) {
      console.warn(`\u26A0\uFE0F Cannot send follow-up to ${lead.email}: Account ${accountId} not found in .env`);
      continue;
    }

    const templateData = {
      companyName: lead.businessName,
      website: lead.website || '',
      city: lead.city || '',
      state: lead.state || '',
      platform: lead.platform || 'Other'
    };

    const emailData = lead.nextStage === 1 
      ? templates.getFollowUpEmail1(templateData)
      : templates.getFollowUpEmail2(templateData);

    console.log(`[${i + 1}/${followUpCandidates.length}] \u27A1\uFE0F Sending Follow-up ${lead.nextStage} to: ${lead.email} via Account ${accountId}`);
    
    if (isDryRun) {
      console.log(`   \u{1F4DD} Subject: ${emailData.subject}`);
    } else {
      try {
        const mailOptions = {
          from: `"${activeAccount.user.split('@')[0]}" <${activeAccount.user}>`,
          to: lead.email,
          subject: emailData.subject,
          text: emailData.text
        };
        
        // If we saved the original messageId, use it for threading
        if (lead.messageId) {
          mailOptions.inReplyTo = lead.messageId;
          mailOptions.references = [lead.messageId];
        }

        const info = await activeAccount.transporter.sendMail(mailOptions);

        // Update DB
        if (lead.nextStage === 1) {
          campaignDb.addOrUpdateRecord(lead.email, { status: 'followed_up_1', followedUp1At: Date.now() });
        } else {
          campaignDb.addOrUpdateRecord(lead.email, { status: 'followed_up_2', followedUp2At: Date.now() });
        }
        
        console.log(`   \u2705 Follow-up ${lead.nextStage} sent! MessageId: ${info.messageId}`);
      } catch (err) {
        console.error(`   \u274C Error sending follow-up: ${err.message}`);
        continue; 
      }

      // Delay between sends (only if we actually sent an email)
      if (i < followUpCandidates.length - 1) {
        // Check if the next lead is also an email send (not just a stage 3 completion)
        if (followUpCandidates[i+1].nextStage !== 3) {
          const settings = getSettings();
          const delayMs = Math.floor(Math.random() * (settings.delayMaxMs - settings.delayMinMs + 1)) + settings.delayMinMs;
          console.log(`   \u23F2\uFE0F Pausing for ${(delayMs / 1000 / 60).toFixed(2)} minutes...\n`);
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
  }
  
  console.log('\n\u{1F389} Follow-up sequence complete!');
}

module.exports = { startFollowUps };

if (require.main === module) {
  startFollowUps();
}
