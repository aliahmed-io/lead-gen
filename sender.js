require('dotenv').config();
const nodemailer = require('nodemailer');
const LeadsDatabase = require('./db');
const CampaignDatabase = require('./campaignDb');
const templates = require('./templates');
const { verifyEmail } = require('./verifier');
const { isWithinBusinessHours } = require('./timeUtils');

const isDryRun = process.argv.includes('--dry-run');
const MAX_EMAILS_PER_DAY = 30; // Hard limit per account per day

// 1. Initialize DBs
const leadsDb = new LeadsDatabase();
const campaignDb = new CampaignDatabase();

// 2. Setup Transporters
const transporters = [];
for (let i = 1; i <= 6; i++) {
  const user = process.env[`EMAIL_${i}_USER`];
  if (user) {
    transporters.push({
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
    });
  }
}

if (transporters.length === 0) {
  console.error('\u274C No SMTP accounts found in .env file!');
  process.exit(1);
}

// 3. Load Leads & Sync to Campaign DB
console.log('\u{1F4E4} Syncing leads from leads_db.json to Campaign Database...');
const leadsWithEmails = leadsDb.getAll().filter(b => b.emails && b.emails.length > 0);

for (const lead of leadsWithEmails) {
  const primaryEmail = lead.emails[0].toLowerCase();
  if (!campaignDb.getRecord(primaryEmail)) {
    campaignDb.addOrUpdateRecord(primaryEmail, {
      businessName: lead.name,
      platform: lead.platform || 'Other',
      website: lead.website || '',
      city: lead.city || '',
      state: lead.state || ''
    });
  }
}

// 4. Build the Shared Queue
let pendingQueue = campaignDb.getAllRecords().filter(r => r.status === 'pending');

console.log(`\n\u{1F4CA} Campaign Status:`);
console.log(`   Total Leads: ${leadsWithEmails.length}`);
console.log(`   Pending Sends in Queue: ${pendingQueue.length}`);
console.log(`   Using Accounts: ${transporters.length}`);
console.log(`   Daily Limit Per Account: ${MAX_EMAILS_PER_DAY}`);
console.log(isDryRun ? `   \u26A0\uFE0F DRY RUN MODE ACTIVE (No emails will be sent)\n` : `\n`);

if (pendingQueue.length === 0) {
  console.log('\u2705 No pending leads in the queue. Exiting.');
  process.exit(0);
}

// 5. Throttling Setup
const DELAY_MIN = parseInt(process.env.DELAY_MIN_MS || 300000); 
const DELAY_MAX = parseInt(process.env.DELAY_MAX_MS || 1200000); 

/**
 * The independent worker function assigned to a specific SMTP account.
 */
async function startWorker(account) {
  console.log(`\u{1F6E0}\uFE0F  Worker started for Account ${account.id} (${account.user})`);

  while (pendingQueue.length > 0) {
    // 1. Check Business Hours & Holidays
    const timeCheck = isWithinBusinessHours();
    if (!timeCheck.valid) {
      console.log(`\u{1F319} Account ${account.id} pausing... ${timeCheck.reason}`);
      await new Promise(r => setTimeout(r, 60 * 60 * 1000)); // Sleep for 1 hour, then check again
      continue;
    }

    // 2. Check Daily Quotas
    const dailyCount = campaignDb.getDailyCount(account.id);
    if (dailyCount >= MAX_EMAILS_PER_DAY) {
      console.log(`\u26A0\uFE0F Account ${account.id} reached its daily limit of ${MAX_EMAILS_PER_DAY} emails. Shutting down worker for today.`);
      return; // Exit this worker loop completely
    }

    // 3. Pop the next lead off the shared queue
    const lead = pendingQueue.shift();
    if (!lead) break;

    // 4. Verify Email
    console.log(`[Account ${account.id}] Verifying ${lead.email}...`);
    const verification = await verifyEmail(lead.email);
    if (!verification.valid) {
      console.log(`   \u274C Bad Email: ${lead.email} (${verification.reason}). Marking as failed.`);
      campaignDb.addOrUpdateRecord(lead.email, { status: 'failed', failReason: verification.reason });
      continue; // Skip the delay and instantly grab the next lead
    }

    // 5. Prepare Email
    let customSentence = 'I noticed your beautiful website and wanted to reach out.';
    if (lead.platform === 'Shopify') {
      customSentence = 'I noticed your store is running on Shopify, which is an excellent platform.';
    } else if (lead.platform === 'WooCommerce') {
      customSentence = 'I noticed your store is built on WooCommerce, which gives you great flexibility.';
    } else if (lead.platform === 'WordPress') {
      customSentence = 'I noticed you built your site on WordPress, which is a great choice.';
    }

    const emailData = templates.getInitialEmail({
      companyName: lead.businessName,
      website: lead.website || '',
      city: lead.city || '',
      state: lead.state || '',
      platform: lead.platform || 'Other',
      customSentence: customSentence
    });

    console.log(`[Account ${account.id}] \u27A1\uFE0F Sending to: ${lead.email} (${dailyCount + 1}/${MAX_EMAILS_PER_DAY} today)`);

    // 6. Send
    if (isDryRun) {
      console.log(`   \u{1F4DD} Subject: ${emailData.subject}`);
      // Simulate successful send
      campaignDb.incrementDailyCount(account.id);
      campaignDb.addOrUpdateRecord(lead.email, {
        status: 'sent',
        sentAt: Date.now(),
        accountId: account.id,
        messageId: 'dry-run-message-id'
      });
    } else {
      try {
        const info = await account.transporter.sendMail({
          from: `"${account.user.split('@')[0]}" <${account.user}>`,
          to: lead.email,
          subject: emailData.subject,
          text: emailData.text
        });

        // Update DB
        campaignDb.incrementDailyCount(account.id);
        campaignDb.addOrUpdateRecord(lead.email, {
          status: 'sent',
          sentAt: Date.now(),
          accountId: account.id,
          messageId: info.messageId
        });
        
        console.log(`   \u2705 Sent successfully! MessageId: ${info.messageId}`);
      } catch (err) {
        console.error(`   \u274C SMTP Error sending to ${lead.email}: ${err.message}`);
        // If it's a hard bounce/rejection, mark as failed permanently.
        campaignDb.addOrUpdateRecord(lead.email, { status: 'bounced', failReason: err.message });
        continue; 
      }
    }

    // 7. Sleep (Independent of other workers)
    if (pendingQueue.length > 0) {
      const delayMs = Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
      console.log(`   \u23F2\uFE0F Account ${account.id} sleeping for ${(delayMs / 1000 / 60).toFixed(2)} minutes...\n`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  console.log(`\u2705 Worker for Account ${account.id} has no more leads in queue to process.`);
}

// 6. Launch all workers concurrently
async function startCampaign() {
  console.log('\u{1F680} Launching Async Workers...\n');
  const workerPromises = transporters.map(account => startWorker(account));
  
  await Promise.all(workerPromises);
  
  console.log('\n\u{1F389} All workers have completed their tasks!');
}

// Export for the master scheduler
module.exports = { startCampaign };

// Allow direct execution if run manually via `node sender.js`
if (require.main === module) {
  startCampaign();
}
