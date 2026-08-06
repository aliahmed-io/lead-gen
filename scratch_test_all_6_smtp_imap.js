const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const fs = require('fs');
const path = require('path');
const { decrypt } = require('./cryptoUtils');

const settingsPath = path.resolve(__dirname, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

async function testEverything() {
  console.log('======================================================');
  console.log('🚀 LIVE 6-ACCOUNT SMTP + IMAP VERIFICATION REPORT');
  console.log('======================================================\n');

  let passedSmtp = 0;
  let passedImap = 0;

  for (const acc of settings.accounts) {
    const plainPass = decrypt(acc.password);
    console.log(`Checking ${acc.email}...`);

    // 1. Test SMTP
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: acc.email, pass: plainPass }
    });

    let smtpStatus = 'FAILED';
    try {
      await transporter.verify();
      smtpStatus = '✅ PASSED';
      passedSmtp++;
    } catch (e) {
      smtpStatus = `❌ FAILED (${e.message})`;
    }

    // 2. Test IMAP
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: acc.email, pass: plainPass },
      logger: false
    });
    client.on('error', () => {});

    let imapStatus = 'FAILED';
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      imapStatus = '✅ PASSED';
      passedImap++;
      lock.release();
      await client.logout();
    } catch (e) {
      imapStatus = `❌ FAILED (${e.message})`;
    }

    console.log(`   SMTP (Outbound Sending) : ${smtpStatus}`);
    console.log(`   IMAP (Inbound Reading) : ${imapStatus}\n`);
  }

  console.log('======================================================');
  console.log(`📊 FINAL RESULT: SMTP ${passedSmtp}/6 Passed | IMAP ${passedImap}/6 Passed`);
  console.log('======================================================');
}

testEverything();
