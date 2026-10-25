const { ImapFlow } = require('imapflow');
const fs = require('fs');
const path = require('path');
const { decrypt } = require('./cryptoUtils');

const settingsPath = path.resolve(__dirname, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

async function verifyAll() {
  console.log('========================================');
  console.log('⚡ FULL 6-ACCOUNT IMAP VERIFICATION');
  console.log('========================================');

  for (const acc of settings.accounts) {
    const plainPass = decrypt(acc.password);
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: acc.email, pass: plainPass },
      logger: false
    });
    client.on('error', () => {});

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      console.log(`✅ ${acc.email.padEnd(25)} -> CONNECTED 100%`);
      lock.release();
      await client.logout();
    } catch (err) {
      console.log(`❌ ${acc.email.padEnd(25)} -> FAILED: ${err.message}`);
    }
  }
  console.log('========================================');
}

verifyAll();
