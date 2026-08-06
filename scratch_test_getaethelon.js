const { ImapFlow } = require('imapflow');

async function run() {
  console.log('Testing IMAP for ali@getaethelon.com...');
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
    logger: false
  });
  client.on('error', (e) => console.log('IMAP Error:', e.message));

  try {
    await client.connect();
    console.log('✅ IMAP SUCCESS for ali@getaethelon.com!');
    const lock = await client.getMailboxLock('INBOX');
    console.log('Opened INBOX successfully!');
    lock.release();
    await client.logout();
  } catch (err) {
    console.log('❌ IMAP FAIL:', err.message);
  }
}

run();
