const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const mailboxes = [
  { email: 'ali@tryaethelon.com', pass: 'qhhnlclvvzgneixh' },
  { email: 'ali@aethelonlabs.com', pass: 'gtubhgwaznntofqu' },
  { email: 'ali@aethelonstudio.com', pass: 'tizlxamixcfvaqsa' },
  { email: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
  { email: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' },
  { email: 'ali@aethelonmail.com', pass: 'yzfoghxjrzlryzhl' }
];

async function deepSearchAccount(acc) {
  console.log(`\n======================================================`);
  console.log(`🔍 DEEP SEARCHING ALL MAILBOX FOLDERS FOR: ${acc.email}`);
  console.log(`======================================================`);

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: acc.email, pass: acc.pass },
    logger: false
  });

  client.on('error', () => {});

  try {
    await client.connect();

    // List all folders (Sent Mail, All Mail, Inbox, etc.)
    const folders = await client.list();
    console.log(`Available folders for ${acc.email}:`, folders.map(f => f.path));

    // Target folders to search
    const targetFolders = folders.map(f => f.path).filter(p => 
      p === 'INBOX' || p.includes('Sent') || p.includes('All Mail') || p.includes('Starred')
    );

    for (const folderPath of targetFolders) {
      try {
        const lock = await client.getMailboxLock(folderPath);
        try {
          console.log(`\n  📂 Inspecting folder: "${folderPath}"...`);
          const messages = [];
          
          // Fetch messages in this folder
          for await (const msg of client.fetch('1:*', { envelope: true, source: true })) {
            messages.push(msg);
          }

          console.log(`     Total messages in ${folderPath}: ${messages.length}`);

          for (const msg of messages) {
            const parsed = await simpleParser(msg.source);
            const fromAddr = (parsed.from?.value[0]?.address || msg.envelope.from[0]?.address || '').toLowerCase();
            const toAddrs = (parsed.to?.value || []).map(v => (v.address || '').toLowerCase());
            const subject = parsed.subject || msg.envelope.subject || '';
            const text = parsed.text || '';

            // Check if this is an actual outreach email or conversation
            const isTest = subject.toLowerCase().includes('[leadgen validation]') || subject.toLowerCase().includes('test_');
            const isInternal = mailboxes.some(m => m.email.toLowerCase() === fromAddr) && toAddrs.some(t => mailboxes.some(m => m.email.toLowerCase() === t));

            if (!isTest && !isInternal) {
              // Print any email thread involving external addresses
              console.log(`\n  💌 [EMAIL FOUND in "${folderPath}"]`);
              console.log(`     From   : ${parsed.from?.text || fromAddr}`);
              console.log(`     To     : ${parsed.to?.text || toAddrs.join(', ')}`);
              console.log(`     Subject: ${subject}`);
              console.log(`     Date   : ${msg.envelope.date || parsed.date}`);
              console.log(`     Body Snippet: "${text.trim().substring(0, 200).replace(/\s+/g, ' ')}"`);
              console.log(`     --------------------------------------------------`);
            }
          }
        } finally {
          lock.release();
        }
      } catch (err) {
        console.log(`     ⚠️ Could not open folder "${folderPath}": ${err.message}`);
      }
    }

    await client.logout();
  } catch (err) {
    console.error(`❌ Failed to connect to ${acc.email}:`, err.message);
  }
}

async function main() {
  for (const acc of mailboxes) {
    await deepSearchAccount(acc);
  }
}

main();
