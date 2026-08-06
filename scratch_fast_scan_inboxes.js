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
INTERNAL_EMAILS.add('mailer-daemon@googlemail.com');
INTERNAL_EMAILS.add('nobody@gmail.com');
INTERNAL_EMAILS.add('no-reply@accounts.google.com');
INTERNAL_EMAILS.add('google-noreply@google.com');

function isWarmupOrSystem(subject, fromEmail) {
  const sub = (subject || '').toLowerCase();
  const from = (fromEmail || '').toLowerCase();

  // Validation tests
  if (sub.includes('[leadgen validation]') || sub.includes('test_')) return true;

  // Google notifications & security alerts
  if (from.includes('no-reply@accounts.google.com') || from.includes('google-noreply@google.com')) return true;
  if (sub.includes('security alert') || sub.includes('new sign-in') || sub.includes('access granted')) return true;

  // Internal emails between pool
  if (INTERNAL_EMAILS.has(from)) return true;

  // Automated warmup terms
  if (sub.includes('warmup') || sub.includes('mailreach') || sub.includes('instantly')) return true;

  return false;
}

async function scanAccount(acc) {
  console.log(`🔍 Fast scanning mailbox: ${acc.email}...`);
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: acc.email, pass: acc.pass },
    logger: false
  });

  client.on('error', () => {});
  const foundLeads = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const messages = [];
      // Fetch only envelope & internalDate for fast scanning
      for await (const msg of client.fetch('1:*', { envelope: true, internalDate: true })) {
        messages.push(msg);
      }

      console.log(`   Found ${messages.length} message(s) in INBOX.`);

      for (const msg of messages) {
        const fromAddr = msg.envelope.from[0]?.address || '';
        const fromName = msg.envelope.from[0]?.name || fromAddr;
        const subject = msg.envelope.subject || '(No Subject)';
        const date = msg.envelope.date || msg.internalDate || new Date();

        if (!isWarmupOrSystem(subject, fromAddr)) {
          foundLeads.push({
            mailbox: acc.email,
            fromEmail: fromAddr,
            fromName,
            subject,
            date: new Date(date).toISOString(),
            uid: msg.uid
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error(`   ⚠️ Notice for ${acc.email}: ${err.message}`);
  }

  return foundLeads;
}

async function main() {
  console.log('======================================================');
  console.log('📥 OUTBOUND LEAD INBOX AUDIT REPORT (FAST ENVELOPE SCAN)');
  console.log('======================================================\n');

  const allLeads = [];

  for (const acc of mailboxes) {
    const leads = await scanAccount(acc);
    allLeads.push(...leads);
  }

  console.log('\n======================================================');
  console.log(`🎯 AUDIT COMPLETE — FOUND ${allLeads.length} POTENTIAL LEAD RESPONSES`);
  console.log('======================================================\n');

  if (allLeads.length === 0) {
    console.log('No prospect lead replies detected in any of the 6 inboxes.');
  } else {
    allLeads.forEach((l, idx) => {
      console.log(`[LEAD #${idx + 1}]`);
      console.log(`  Recipient Mailbox : ${l.mailbox}`);
      console.log(`  From Prospect     : ${l.fromName} <${l.fromEmail}>`);
      console.log(`  Subject           : ${l.subject}`);
      console.log(`  Date              : ${l.date}`);
      console.log('------------------------------------------------------');
    });
  }
}

main();
