const { ImapFlow } = require('imapflow');

async function scanGetAethelon() {
  console.log('🔍 Scanning ali@getaethelon.com INBOX & Sent Mail...');
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
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
      console.log(`Found ${msgs.length} messages in INBOX for ali@getaethelon.com.`);
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
        console.log(`Found ${sentMsgs.length} messages in [Gmail]/Sent Mail for ali@getaethelon.com.`);
      } finally {
        lock.release();
      }
    } catch (e) {
      console.log('No [Gmail]/Sent Mail or error:', e.message);
    }

    await client.logout();
  } catch (err) {
    console.error('Failed to scan ali@getaethelon.com:', err.message);
  }
}

scanGetAethelon();
