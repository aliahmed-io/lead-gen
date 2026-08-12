import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { safeDecryptPassword } from '@/lib/crypto';

// ─── File paths ──────────────────────────────────────────────────────
const inboxDbPath = path.resolve(process.cwd(), '../inbox_db.json');
const settingsPath = path.resolve(process.cwd(), '../settings.json');

function getInboxData() {
  if (fs.existsSync(inboxDbPath)) {
    try { return JSON.parse(fs.readFileSync(inboxDbPath, 'utf-8')); }
    catch {}
  }
  return { threads: {} };
}

function getSettings() {
  if (fs.existsSync(settingsPath)) {
    try { return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); }
    catch {}
  }
  return {};
}

// ─── GET /api/inbox — List all threads ──────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const leadEmail = searchParams.get('email');

    const inbox = getInboxData();

    if (leadEmail) {
      const thread = inbox.threads[leadEmail.toLowerCase()] || null;
      return NextResponse.json(thread);
    }

    interface Thread {
      leadEmail: string;
      accountId: number;
      messages: unknown[];
      lastMessageAt: number;
      unread: boolean;
    }

    const threads = (Object.values(inbox.threads) as Thread[])
      .sort((a, b) =>
        (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
      );

    return NextResponse.json({
      threads,
      unreadCount: threads.filter((t: Thread) => t.unread).length,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ─── POST /api/inbox — Reply (leadEmail + replyText) OR bulk actions ──
// Route files can only export ONE POST handler, so we dispatch by shape:
//   bulk  → { action: 'mark_read' | 'mark_unread' | 'delete', leadEmails: string[] }
//   reply → { leadEmail: string, replyText: string, subject?: string }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.action && Array.isArray(body?.leadEmails)) {
      return handleBulk(body);
    }
    return handleReply(body);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function handleBulk(body: Record<string, unknown>): NextResponse {
  const action = String(body?.action || '');
  const leadEmails: string[] = Array.isArray(body?.leadEmails) ? (body.leadEmails as string[]).map(String) : [];
  if (!action || leadEmails.length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (action !== 'mark_read' && action !== 'mark_unread' && action !== 'delete') {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const inbox = getInboxData();
  let affected = 0;

  if (action === 'delete') {
    for (const email of leadEmails) {
      const key = email.toLowerCase();
      if (inbox.threads[key]) {
        delete inbox.threads[key];
        affected++;
      }
    }
  } else {
    for (const email of leadEmails) {
      const key = email.toLowerCase();
      const thread = inbox.threads[key];
      if (thread && thread.unread !== (action === 'mark_unread')) {
        thread.unread = action === 'mark_unread';
        affected++;
      }
    }
  }

  const tempPath = inboxDbPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(inbox, null, 2), 'utf-8');
  fs.renameSync(tempPath, inboxDbPath);
  return NextResponse.json({ success: true, count: affected });
}

async function handleReply(body: Record<string, unknown>): Promise<NextResponse> {
  const leadEmail = body?.leadEmail as string | undefined;
  const replyText = body?.replyText as string | undefined;
  const subject = body?.subject as string | undefined;

  if (!leadEmail || !replyText) {
    return NextResponse.json({ error: 'leadEmail and replyText are required' }, { status: 400 });
  }

  const inbox = getInboxData();
  const thread = inbox.threads[leadEmail.toLowerCase()];

  if (!thread) {
    return NextResponse.json({ error: 'Thread not found for this lead' }, { status: 404 });
  }

  const settings = getSettings();
  const accounts = settings.accounts || [];
  const account = accounts.find(
    (a: Record<string, string>) => String(a.id) === String(thread.accountId)
  );

  if (!account) {
    return NextResponse.json({ error: 'Original sending account not found' }, { status: 404 });
  }

  const user = account.user || account.email;
  const pass = safeDecryptPassword(account.pass || account.password);

  const transporter = nodemailer.createTransport({
    host: account.smtpHost || 'smtp.gmail.com',
    port: parseInt(String(account.smtpPort || '465'), 10),
    secure: true,
    auth: { user, pass },
  });

  const senderDisplayName = settings.senderDisplayName || 'Ali | Aethelon Labs';
  const physicalAddress = settings.physicalAddress || '123 Business St, Suite 100, Austin, TX 78701';
  const footerText = settings.footerText || 'If you no longer wish to receive emails from us, please reply with "unsubscribe".';

  const replySubject = subject || (
    thread.messages?.length > 0
      ? `Re: ${thread.messages[0].subject || ''}`
      : 'Re: Following up'
  );

  const footer = [
    '',
    '---',
    footerText,
    `${senderDisplayName} | ${physicalAddress}`,
  ].join('\n');

  const info = await transporter.sendMail({
    from: `"${senderDisplayName}" <${user}>`,
    to: leadEmail,
    subject: replySubject,
    text: replyText + footer,
  });

  // Save outbound reply to inbox thread
  thread.messages.push({
    id: Date.now().toString(),
    direction: 'outbound',
    from: user,
    subject: replySubject,
    text: replyText + footer,
    html: '',
    receivedAt: Date.now(),
  });
  thread.lastMessageAt = Date.now();

  const tempPath = inboxDbPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(inbox, null, 2), 'utf-8');
  fs.renameSync(tempPath, inboxDbPath);

  return NextResponse.json({ success: true, messageId: info.messageId });
}

// ─── PATCH /api/inbox — Mark thread as read ─────────────────────────
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { leadEmail } = body;
    if (!leadEmail) return NextResponse.json({ error: 'leadEmail required' }, { status: 400 });

    const inbox = getInboxData();
    const key = leadEmail.toLowerCase();
    if (inbox.threads[key]) {
      inbox.threads[key].unread = false;
      const tempPath = inboxDbPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(inbox, null, 2), 'utf-8');
      fs.renameSync(tempPath, inboxDbPath);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
