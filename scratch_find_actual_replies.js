const { ImapFlow } = require('imapflow');
const fs = require('fs');
const path = require('path');

const mailboxes = [
  { email: 'ali@tryaethelon.com', pass: 'qhhnlclvvzgneixh' },
  { email: 'ali@aethelonlabs.com', pass: 'gtubhgwaznntofqu' },
  { email: 'ali@aethelonstudio.com', pass: 'tizlxamixcfvaqsa' },
  { email: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
  { email: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' },
  { email: 'ali@aethelonmail.com', pass: 'yzfoghxjrzlryzhl' }
];

// Load leads_db.json and campaign_db.json to match against actual contacted leads
let contactedEmails = new Set();

try {
  const dbPath = path.resolve(__dirname, 'leads_db.json');
  if (fs.existsSync(dbPath)) {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const records = data.businesses || data.records || data;
    Object.values(records).forEach(r => {
      if (r.email) contactedEmails.add(r.email.toLowerCase());
    });
  }
} catch {}

try {
  const cDbPath = path.resolve(__dirname, 'campaign_db.json');
  if (fs.existsSync(cDbPath)) {
    const data = JSON.parse(fs.readFileSync(cDbPath, 'utf8'));
    const records = data.records || {};
    Object.values(records).forEach(r => {
      if (r.email) contactedEmails.add(r.email.toLowerCase());
    });
  }
} catch {}

const INTERNAL_EMAILS = new Set(mailboxes.map(m => m.email.toLowerCase()));

async function scanForReplies(acc) {
  console.log(`🔍 Checking inboxes for replies to outreach: ${acc.email}...`);
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: acc.email, pass: acc.pass },
    logger: false
  });
  client.on('error', () => {});

  const matchedReplies = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const messages = [];
      for await (const msg of client.fetch('1:*', { envelope: true })) {
        messages.push(msg);
      }

      for (const msg of messages) {
        const fromAddr = (msg.envelope.from[0]?.address || '').toLowerCase();
        const fromName = msg.envelope.from[0]?.name || fromAddr;
        const subject = msg.envelope.subject || '';
        const date = msg.envelope.date || new Date();

        // 1. Direct match with a lead in leads_db.json / campaign_db.json
        const isKnownLead = contactedEmails.has(fromAddr);

        // 2. Contains Re: and isn't internal or automated spam
        const isReSubject = subject.toLowerCase().startsWith('re:') && !INTERNAL_EMAILS.has(fromAddr);

        // 3. Mentions Aethelon or Ali in subject
        const isDirectMention = (subject.toLowerCase().includes('aethelon') || subject.toLowerCase().includes('quick question')) && !INTERNAL_EMAILS.has(fromAddr);

        if ((isKnownLead || isReSubject || isDirectMention) && !fromAddr.includes('google.com')) {
          matchedReplies.push({
            mailbox: acc.email,
            fromEmail: fromAddr,
            fromName,
            subject,
            date: new Date(date).toISOString(),
            isKnownLead,
            isReSubject,
            isDirectMention
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error(`   ⚠️ Notice for ${acc.email}:`, err.message);
  }

  return matchedReplies;
}

async function main() {
  console.log('======================================================');
  console.log('🎯 OUTBOUND PROSPECT REPLIES & LEAD DETECTOR');
  console.log('======================================================\n');

  const allMatched = [];

  for (const acc of mailboxes) {
    const replies = await scanForReplies(acc);
    allMatched.push(...replies);
  }

  console.log('\n======================================================');
  console.log(`📊 REPLIES AUDIT COMPLETE — MATCHED ${allMatched.length} REPLIES/INQUIRIES`);
  console.log('======================================================\n');

  if (allMatched.length === 0) {
    console.log('ℹ️ No prospect replies detected yet for outbound campaigns.');
    console.log('   (No leads from your database have replied to any of the 6 inboxes yet.)');
  } else {
    allMatched.forEach((r, idx) => {
      console.log(`[PROSPECT REPLY #${idx + 1}]`);
      console.log(`  Mailbox Account : ${r.mailbox}`);
      console.log(`  From Lead       : ${r.fromName} <${r.fromEmail}>`);
      console.log(`  Subject         : ${r.subject}`);
      console.log(`  Date            : ${r.date}`);
      console.log(`  Matched In DB   : ${r.isKnownLead ? 'YES ✅' : 'NO (Unsolicited / Inbound)'}`);
      console.log('------------------------------------------------------');
    });
  }
}

main();
