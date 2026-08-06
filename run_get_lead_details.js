const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fs = require('fs');

const targets = ['scott@caribouoffice.com', 'bryce@bmdcollection.com'];

async function run() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: 'ali@aethelonmail.com', pass: 'yzfoghxjrzlryzhl' },
    logger: false
  });
  client.on('error', () => {});
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let output = '';
    try {
      for await (const msg of client.fetch('1:*', { envelope: true, source: true })) {
        const from = (msg.envelope.from[0]?.address || '').toLowerCase();
        if (targets.includes(from)) {
          const parsed = await simpleParser(msg.source);
          output += `========================================\n`;
          output += `FROM: ${parsed.from?.text}\n`;
          output += `SUBJECT: ${parsed.subject}\n`;
          output += `DATE: ${parsed.date}\n`;
          output += `BODY:\n${parsed.text}\n`;
          output += `========================================\n\n`;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    fs.writeFileSync('d:\\leadgen\\lead_details.txt', output, 'utf8');
  } catch (err) {
    fs.writeFileSync('d:\\leadgen\\lead_details.txt', 'ERR: ' + err.message, 'utf8');
  }
}
run();
