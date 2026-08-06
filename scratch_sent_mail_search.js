const { ImapFlow } = require('imapflow');

const mailboxes = [
  { email: 'ali@tryaethelon.com', pass: 'qhhnlclvvzgneixh' },
  { email: 'ali@aethelonlabs.com', pass: 'gtubhgwaznntofqu' },
  { email: 'ali@aethelonstudio.com', pass: 'tizlxamixcfvaqsa' },
  { email: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
  { email: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' },
  { email: 'ali@aethelonmail.com', pass: 'yzfoghxjrzlryzhl' }
];

const INTERNAL_EMAILS = new Set(mailboxes.map(m => m.email.toLowerCase()));

async function inspectSentAndReplies(acc) {
  console.log(`\n🔍 Checking [Gmail]/Sent Mail for: ${acc.email}...`);
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: acc.email, pass: acc.pass },
    logger: false
  });

  client.on('error', () => {});

  const sentRecipients = new Set();

  try {
    await client.connect();

    // 1. Check Sent Mail
    try {
      const lockSent = await client.getMailboxLock('[Gmail]/Sent Mail');
      try {
        const sentMsgs = [];
        for await (const msg of client.fetch('1:*', { envelope: true })) {
          sentMsgs.push(msg);
        }
        console.log(`   Found ${sentMsgs.length} sent message(s) in [Gmail]/Sent Mail.`);

        sentMsgs.forEach(m => {
          const toArr = m.envelope.to || [];
          toArr.forEach(t => {
            const addr = (t.address || '').toLowerCase();
            const sub = m.envelope.subject || '';
            if (addr && !INTERNAL_EMAILS.has(addr) && !sub.includes('[LeadGen Validation]')) {
              sentRecipients.add(addr);
              console.log(`   ➔ OUTBOUND DISPATCHED to: ${t.name || addr} <${addr}> | Subject: "${sub}"`);
            }
          });
        });
      } finally {
        lockSent.release();
      }
    } catch (err) {
      console.log(`   ⚠️ Could not read [Gmail]/Sent Mail: ${err.message}`);
    }

    // 2. Check INBOX for replies from those sent recipients
    if (sentRecipients.size > 0) {
      console.log(`   🔎 Checking INBOX for replies from ${sentRecipients.size} outbound recipient(s)...`);
      const lockInbox = await client.getMailboxLock('INBOX');
      try {
        for await (const msg of client.fetch('1:*', { envelope: true })) {
          const fromAddr = (msg.envelope.from[0]?.address || '').toLowerCase();
          if (sentRecipients.has(fromAddr)) {
            console.log(`   🌟 MATCHED PROSPECT REPLY FROM: ${msg.envelope.from[0]?.name || fromAddr} <${fromAddr}>`);
            console.log(`      Subject: ${msg.envelope.subject}`);
            console.log(`      Date   : ${msg.envelope.date}`);
          }
        }
      } finally {
        lockInbox.release();
      }
    } else {
      console.log(`   (No non-internal outbound emails found in Sent Mail for ${acc.email})`);
    }

    await client.logout();
  } catch (err) {
    console.error(`❌ Connection error for ${acc.email}:`, err.message);
  }
}

async function main() {
  console.log('======================================================');
  console.log('📬 SENT MAIL & OUTBOUND REPLIES AUDIT');
  console.log('======================================================');

  for (const acc of mailboxes) {
    await inspectSentAndReplies(acc);
  }

  console.log('\n======================================================');
  console.log('✅ AUDIT COMPLETE');
  console.log('======================================================');
}

main();
