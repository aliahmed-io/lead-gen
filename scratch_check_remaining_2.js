const { ImapFlow } = require('imapflow');

const accounts = [
  { email: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
  { email: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' }
];

async function checkRemaining() {
  for (const acc of accounts) {
    console.log(`Testing connection for ${acc.email}...`);
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: acc.email, pass: acc.pass },
      logger: false
    });
    client.on('error', (e) => {
      console.log(`[Error Event] ${acc.email}: ${e.message}`);
    });
    try {
      await client.connect();
      console.log(`✅ CONNECTED SUCCESS: ${acc.email}`);
      const lock = await client.getMailboxLock('INBOX');
      console.log(`   Opened INBOX for ${acc.email}`);
      lock.release();
      await client.logout();
    } catch (err) {
      console.log(`❌ FAILED TO CONNECT ${acc.email}: ${err.message}`);
    }
  }
}

checkRemaining();
