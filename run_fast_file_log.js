const { ImapFlow } = require('imapflow');
const fs = require('fs');

const targets = [
  'scott@caribouoffice.com',
  'bryce@bmdcollection.com',
  'info@framemytv.com',
  'lindsey@fullcirclearizona.com'
];

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
    let out = '';
    try {
      for await (const msg of client.fetch('1:*', { envelope: true })) {
        const from = (msg.envelope.from[0]?.address || '').toLowerCase();
        if (targets.includes(from)) {
          out += `MATCH: ${from} | Subject: ${msg.envelope.subject} | Date: ${msg.envelope.date}\n`;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    fs.writeFileSync('d:\\leadgen\\matches.txt', out, 'utf8');
  } catch (err) {
    fs.writeFileSync('d:\\leadgen\\matches.txt', 'ERR: ' + err.message, 'utf8');
  }
}
run();
