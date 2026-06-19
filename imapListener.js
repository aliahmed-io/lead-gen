require('dotenv').config();
const { ImapFlow } = require('imapflow');
const simpleParser = require('mailparser').simpleParser;
const campaignDb = require('./campaignDb');

// Connect to 1 account and check INBOX
async function checkAccount(id, user, pass, host, port) {
  const client = new ImapFlow({
    host: host,
    port: parseInt(port),
    secure: true,
    auth: { user, pass },
    logger: false // Set to true for debugging
  });

  try {
    console.log(`\u231B Connecting to IMAP Account ${id} (${user})...`);
    await client.connect();
    
    // Select Inbox
    let lock = await client.getMailboxLock('INBOX');
    try {
      console.log(`\u2705 Connected. Scanning UNSEEN messages in Account ${id}...`);
      
      // We search for UNSEEN messages. You can also search for SINCE a certain date.
      const uids = await client.search({ unseen: true });
      
      let newReplies = 0;
      if (uids && uids.length > 0) {
        const messages = client.fetch(uids.join(','), { source: true, flags: true });
        
        for await (let message of messages) {
        // Parse raw email
        const parsed = await simpleParser(message.source);
        const fromAddress = parsed.from.value[0].address.toLowerCase();
        const subject = (parsed.subject || '').toLowerCase();
        
        // 1. Detect Bounces
        const isBounce = 
          fromAddress.includes('mailer-daemon') ||
          fromAddress.includes('postmaster') ||
          fromAddress.includes('bounce') ||
          subject.includes('undeliverable') ||
          subject.includes('delivery status notification');

        if (isBounce) {
          // Attempt to extract original recipient if possible, or just skip if we can't reliably map it.
          // For simplicity, we just skip marking it as 'interested'. If we can parse the body for the original TO address, we could mark them bounced.
          // But preventing the false positive 'interested' is the main priority.
          console.log(`   \u26A0\uFE0F Bounce notification ignored from ${fromAddress}`);
          await client.messageFlagsAdd(message.seq, ['\\Seen']);
          continue;
        }

        // 2. Check if this sender is a lead in our database
        const leadRecord = campaignDb.getRecord(fromAddress);
        if (leadRecord && ['sent', 'followed_up_1', 'followed_up_2'].includes(leadRecord.status)) {
          console.log(`   \u{1F389} Reply detected from ${fromAddress}!`);
          
          campaignDb.addOrUpdateRecord(fromAddress, {
            status: 'interested',
            repliedAt: Date.now()
          });
          
          newReplies++;
          
          // Optionally mark the message as read so we don't process it again
          await client.messageFlagsAdd(message.seq, ['\\Seen']);
        }
      }
      }
      
      console.log(`   Processed Account ${id}: Found ${newReplies} new replies.`);
    } finally {
      lock.release();
    }
    
    await client.logout();
  } catch (err) {
    console.error(`\u274C Error checking Account ${id}:`, err.message);
  }
}

async function startListener() {
  console.log('\u{1F50D} Starting IMAP Listener to scan for replies...\n');
  
  for (let i = 1; i <= 6; i++) {
    const user = process.env[`EMAIL_${i}_USER`];
    const pass = process.env[`EMAIL_${i}_PASS`];
    const host = process.env[`EMAIL_${i}_IMAP_HOST`] || 'imap.gmail.com';
    const port = process.env[`EMAIL_${i}_IMAP_PORT`] || 993;

    if (user && pass) {
      await checkAccount(i, user, pass, host, port);
    }
  }
  
  console.log('\n\u2705 IMAP Scan Complete!');
}

module.exports = { startListener };

if (require.main === module) {
  startListener();
}
