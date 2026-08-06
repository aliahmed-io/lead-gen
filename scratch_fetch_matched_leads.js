const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const mailboxes = [
  { email: 'ali@tryaethelon.com', pass: 'qhhnlclvvzgneixh' },
  { email: 'ali@aethelonlabs.com', pass: 'gtubhgwaznntofqu' },
  { email: 'ali@aethelonstudio.com', pass: 'tizlxamixcfvaqsa' },
  { email: 'ali@aethelonmail.com', pass: 'yzfoghxjrzlryzhl' }
];

const targetEmails = [
  'scott@caribouoffice.com',
  'bryce@bmdcollection.com',
  'info@framemytv.com',
  'lindsey@fullcirclearizona.com'
];

async function run() {
  for (const acc of mailboxes) {
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
      const lock = await client.getMailboxLock('INBOX');
      try {
        for await (const msg of client.fetch('1:*', { envelope: true, source: true })) {
          const fromAddr = (msg.envelope.from[0]?.address || '').toLowerCase();
          if (targetEmails.includes(fromAddr)) {
            const parsed = await simpleParser(msg.source);
            console.log(`=== MATCH IN ${acc.email} ===`);
            console.log(`From: ${parsed.from?.text}`);
            console.log(`Subject: ${parsed.subject}`);
            console.log(`Date: ${parsed.date}`);
            console.log(`Body: ${parsed.text ? parsed.text.trim() : ''}`);
            console.log(`=============================\n`);
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (e) {
      console.log(`Error reading ${acc.email}: ${e.message}`);
    }
  }
}
run();
