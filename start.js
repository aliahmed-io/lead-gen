const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { startCampaign } = require('./sender');
const { startFollowUps } = require('./followup');
const { checkReplies } = require('./replyDetector');

// Global Logger Interceptor
const logFile = fs.createWriteStream(path.join(__dirname, 'audit.log'), { flags: 'a' });
const originalLog = console.log;
const originalError = console.error;

/**
 * @param {unknown[]} args
 */
function formatArgs(args) {
  return args.map(/** @param {unknown} a */ (a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
}

console.log = function (...args) {
  const msg = formatArgs(args);
  logFile.write(`[INFO] ${new Date().toISOString()} - ${msg}\n`);
  originalLog.apply(console, args);
};

console.error = function (...args) {
  const msg = formatArgs(args);
  logFile.write(`[ERROR] ${new Date().toISOString()} - ${msg}\n`);
  originalError.apply(console, args);
};

console.log('======================================================');
console.log('\u{1F916} MASTER SCHEDULER ONLINE');
console.log('======================================================');
console.log(' - Sender Queue:     Runs immediately, then checks hourly');
console.log(' - IMAP Scanner:     Scheduled every hour');
console.log(' - Follow-ups:       Scheduled daily at 9:15 AM (Texas Time)');
console.log(' - Safety Controls:  Auto-pauses on Nights, Weekends, and Holidays');
console.log('======================================================\n');

// 1. Kick off the sender immediately
startCampaign().catch(err => console.error('\u274C Error in Sender:', err));

// 2. Schedule Hourly Tasks (Top of the hour)
// This scans for replies, and then kicks off the sender queue in case new leads were scraped
cron.schedule('0 * * * *', async () => {
  console.log('\n\u23F0 [CRON] Hourly tick: Scanning IMAP and checking Sender queue...');
  try {
    await checkReplies();
    await startCampaign();
  } catch (err) {
    console.error('\u274C Error in hourly cron:', err);
  }
});

// 3. Schedule Daily Follow-ups
// Runs at exactly 9:15 AM America/Chicago time
cron.schedule('15 9 * * *', async () => {
  console.log('\n\u23F0 [CRON] Daily tick: Checking Follow-up Sequence...');
  try {
    await startFollowUps();
  } catch (err) {
    console.error('\u274C Error in daily cron:', err);
  }
}, {
  scheduled: true,
  timezone: "America/Chicago"
});
