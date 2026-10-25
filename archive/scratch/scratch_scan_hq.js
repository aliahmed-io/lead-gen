const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function scanHQ() {
  console.log('🔍 Scanning ali@aethelonhq.com INBOX & Sent Mail...');
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' },
    logger: false
  });
  client.on('error', () => {});

  try {
    await client.connect();

    // 1. Scan INBOX
    console.log('\n📂 Scanning INBOX...');
    let lock = await client.getMailboxLock('INBOX');
    try {
      const msgs = [];
      for await (const msg of client.fetch('1:*', { envelope: true })) {
        msgs.push(msg);
      }
      console.log(`Found ${msgs.length} messages in INBOX for ali@aethelonhq.com.`);
      msgs.forEach(m => {
        const from = m.envelope.from[0]?.address || '';
        const sub = m.envelope.subject || '';
        console.log(`  [INBOX] From: ${from} | Subject: "${sub}" | Date: ${m.envelope.date}`);
      });
    } finally {
      lock.release();
    }

    // 2. Scan Sent Mail
    console.log('\n📂 Scanning [Gmail]/Sent Mail...');
    try {
      lock = await client.getMailboxLock('[Gmail]/Sent Mail');
      try {
        const sentMsgs = [];
        for await (const msg of client.fetch('1:*', { envelope: true })) {
          sentMsgs.push(msg);
        }
        console.log(`Found ${sentMsgs.length} messages in [Gmail]/Sent Mail for ali@aethelonhq.com.`);
        sentMsgs.forEach(m => {
          const to = (m.envelope.to || []).map(t => t.address).join(', ');
          const sub = m.envelope.subject || '';
          console.log(`  [SENT] To: ${to} | Subject: "${sub}" | Date: ${m.envelope.date}`);
        });
      } finally {
        lock.release();
      }
    } catch (e) {
      console.log('No [Gmail]/Sent Mail or error:', e.message);
    }

    await client.logout();
  } catch (err) {
    console.error('Failed to scan ali@aethelonhq.com:', err.message);
  }
}

scanHQ();
