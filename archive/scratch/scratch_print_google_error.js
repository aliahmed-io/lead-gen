const { ImapFlow } = require('imapflow');

const accounts = [
  { email: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
  { email: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' }
];

async function printErrors() {
  for (const acc of accounts) {
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
    } catch (err) {
      console.log(`\n========================================`);
      console.log(`ACCOUNT: ${acc.email}`);
      console.log(`ERROR RESPONSE:`, err.response || err.responseText || err.message);
      console.log(`========================================\n`);
    }
  }
}

printErrors();
