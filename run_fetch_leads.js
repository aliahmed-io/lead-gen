const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function fetchLeads() {
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
    try {
      const targets = [
        'scott@caribouoffice.com',
        'bryce@bmdcollection.com',
        'info@framemytv.com',
        'lindsey@fullcirclearizona.com'
      ];
      for await (const msg of client.fetch('1:*', { envelope: true, source: true })) {
        const from = (msg.envelope.from[0]?.address || '').toLowerCase();
        if (targets.includes(from)) {
          const parsed = await simpleParser(msg.source);
          console.log('\n========================================');
          console.log('PROSPECT REPLY FOUND:');
          console.log('From:', parsed.from?.text);
          console.log('Subject:', parsed.subject);
          console.log('Date:', parsed.date);
          console.log('Body snippet:');
          console.log(parsed.text ? parsed.text.substring(0, 400) : '(Empty body)');
          console.log('========================================\n');
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('IMAP Error:', err.message);
  }
}
fetchLeads();
