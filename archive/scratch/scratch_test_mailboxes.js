const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');

const mailboxes = [
  { email: 'ali@tryaethelon.com', pass: 'qhhnlclvvzgneixh' },
  { email: 'ali@aethelonlabs.com', pass: 'gtubhgwaznntofqu' },
  { email: 'ali@aethelonstudio.com', pass: 'tizlxamixcfvaqsa' },
  { email: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
  { email: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' },
  { email: 'ali@aethelonmail.com', pass: 'yzfoghxjrzlryzhl' }
];

async function runTest() {
  console.log('🚀 Starting End-to-End Round-Robin Mailbox Test for 6 Google Workspace Accounts...\n');

  const testId = `TEST_${Date.now()}`;
  const results = [];

  // 1. Send round-robin test emails via SMTP
  for (let i = 0; i < mailboxes.length; i++) {
    const sender = mailboxes[i];
    const receiver = mailboxes[(i + 1) % mailboxes.length];

    const subject = `[LeadGen Validation] ${testId} - From ${sender.email} to ${receiver.email}`;
    const text = `This is an automated delivery test from ${sender.email} to ${receiver.email}.\nTimestamp: ${new Date().toISOString()}`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: sender.email,
        pass: sender.pass
      }
    });

    try {
      console.log(`[SMTP Dispatch ${i + 1}/6] Sending from ${sender.email} ➔ ${receiver.email}...`);
      const info = await transporter.sendMail({
        from: `Ali | Aethelon <${sender.email}>`,
        to: receiver.email,
        subject,
        text
      });
      console.log(`  ✅ Sent successfully! Message ID: ${info.messageId}`);
      results.push({ sender: sender.email, receiver: receiver.email, subject, messageId: info.messageId, smtpPass: true, imapPass: false });
    } catch (err) {
      console.error(`  ❌ SMTP Send Failed for ${sender.email}:`, err.message);
      results.push({ sender: sender.email, receiver: receiver.email, subject, messageId: null, smtpPass: false, imapPass: false, error: err.message });
    }
  }

  console.log('\n⏳ Waiting 5 seconds for Google Workspace IMAP sync...\n');
  await new Promise(r => setTimeout(r, 5000));

  // 2. Verify receipt via IMAP
  for (let i = 0; i < mailboxes.length; i++) {
    const receiver = mailboxes[(i + 1) % mailboxes.length];
    const expected = results.find(r => r.receiver === receiver.email);

    if (!expected || !expected.smtpPass) continue;

    console.log(`[IMAP Check ${i + 1}/6] Logging into IMAP for ${receiver.email}...`);

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: receiver.email,
        pass: receiver.pass
      },
      logger: false
    });
    client.on('error', () => {});

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const messages = [];
        for await (const msg of client.fetch({ subject: testId }, { envelope: true })) {
          messages.push(msg);
        }
        if (messages.length > 0) {
          console.log(`  ✅ Verified receipt in INBOX for ${receiver.email}! Subject matched.`);
          expected.imapPass = true;
        } else {
          console.log(`  ⚠️ Message not found in INBOX yet for ${receiver.email}`);
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err) {
      console.error(`  ❌ IMAP Check Failed for ${receiver.email}:`, err.message);
    }
  }

  console.log('\n======================================================');
  console.log('📊 FINAL MAILBOX DISPATCH & RECEIPT TEST REPORT');
  console.log('======================================================');
  results.forEach((r, idx) => {
    const status = r.smtpPass && r.imapPass ? '🟢 100% PERFECT' : r.smtpPass ? '🟡 SMTP OK (IMAP Sync Pending)' : '🔴 FAILED';
    console.log(`${idx + 1}. Sender: ${r.sender} ➔ Receiver: ${r.receiver} | Status: ${status}`);
  });
  console.log('======================================================\n');
}

runTest();
