const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const mailboxes = [
  { email: 'ali@tryaethelon.com', pass: 'qhhnlclvvzgneixh' },
  { email: 'ali@aethelonlabs.com', pass: 'gtubhgwaznntofqu' },
  { email: 'ali@aethelonstudio.com', pass: 'tizlxamixcfvaqsa' },
  { email: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
  { email: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' },
  { email: 'ali@aethelonmail.com', pass: 'yzfoghxjrzlryzhl' }
];

// List of internal domains/emails to ignore as non-leads
const INTERNAL_EMAILS = new Set(mailboxes.map(m => m.email.toLowerCase()));
INTERNAL_EMAILS.add('mailer-daemon@googlemail.com');
INTERNAL_EMAILS.add('nobody@gmail.com');

function isWarmupOrSystem(subject, fromEmail, bodyText) {
  const sub = (subject || '').toLowerCase();
  const from = (fromEmail || '').toLowerCase();
  const body = (bodyText || '').toLowerCase();

  // Internal validation tests
  if (sub.includes('[leadgen validation]') || sub.includes('test_')) return true;

  // Google system / security notifications
  if (from.includes('no-reply@accounts.google.com') || from.includes('google-noreply@google.com')) return true;
  if (sub.includes('security alert') || sub.includes('new sign-in') || sub.includes('access granted')) return true;

  // Internal round-robin emails between account pool
  if (INTERNAL_EMAILS.has(from)) return true;

  // Common automated warmup signatures
  if (sub.includes('warmup') || body.includes('warmup email') || body.includes('sent by mailreach') || body.includes('sent by instantly')) return true;

  return false;
}

async function scanAccount(acc) {
  console.log(`\n🔍 Scanning mailbox: ${acc.email}...`);
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
      for await (const msg of client.fetch('1:*', { envelope: true, source: true })) {
        messages.push(msg);
      }

      console.log(`   Found ${messages.length} total message(s) in INBOX.`);

      for (const msg of messages) {
        const parsed = await simpleParser(msg.source);
        const fromAddr = parsed.from?.value[0]?.address || msg.envelope.from[0]?.address || '';
        const fromName = parsed.from?.value[0]?.name || msg.envelope.from[0]?.name || fromAddr;
        const subject = parsed.subject || msg.envelope.subject || '(No Subject)';
        const date = parsed.date || msg.envelope.date || new Date();
        const text = parsed.text || '';

        if (!isWarmupOrSystem(subject, fromAddr, text)) {
          foundLeads.push({
            mailbox: acc.email,
            fromEmail: fromAddr,
            fromName,
            subject,
            date: new Date(date).toISOString(),
            snippet: text.trim().substring(0, 300).replace(/\s+/g, ' '),
            rawText: text
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error(`   ❌ Failed to scan ${acc.email}:`, err.message);
  }

  return foundLeads;
}

async function main() {
  console.log('======================================================');
  console.log('📥 OUTBOUND LEAD INBOX AUDIT REPORT');
  console.log('======================================================');

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
      console.log(`  Recipient Account : ${l.mailbox}`);
      console.log(`  From Prospect     : ${l.fromName} <${l.fromEmail}>`);
      console.log(`  Subject           : ${l.subject}`);
      console.log(`  Date              : ${l.date}`);
      console.log(`  Snippet           : "${l.snippet}"`);
      console.log('------------------------------------------------------');
    });
  }
}

main();
