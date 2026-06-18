import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// ─── Inline decrypt (same as accounts/route.ts) ─────────────────────
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not set');
  return crypto.createHash('sha256').update(key).digest();
}

function decryptPassword(encryptedBase64: string): string {
  const buffer = Buffer.from(encryptedBase64, 'base64');
  const iv = buffer.slice(0, IV_LENGTH);
  const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  (decipher as ReturnType<typeof crypto.createDecipheriv> & { setAuthTag(t: Buffer): void }).setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

function looksEncrypted(value: string): boolean {
  try { return Buffer.from(value, 'base64').length > IV_LENGTH + TAG_LENGTH; }
  catch { return false; }
}

function safeDecryptPassword(password: string): string {
  if (!password) return '';
  if (looksEncrypted(password)) {
    try { return decryptPassword(password); } catch { return ''; }
  }
  return password;
}

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

    const threads = (Object.values(inbox.threads) as Record<string, any>[])
      .sort((a, b) =>
        (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
      );

    return NextResponse.json({
      threads,
      unreadCount: threads.filter((t: Record<string, boolean>) => t.unread).length,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ─── POST /api/inbox/reply — Send a manual reply ────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadEmail, replyText, subject } = body;

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

    const replySubject = subject || (
      thread.messages?.length > 0
        ? `Re: ${thread.messages[0].subject || ''}`
        : 'Re: Following up'
    );

    const footer = [
      '',
      '---',
      'If you no longer wish to receive emails from us, please reply with "unsubscribe".',
      'Ali Ahmed | Aethelon Labs | 123 Business St, Suite 100, Austin, TX 78701',
    ].join('\n');

    const info = await transporter.sendMail({
      from: `"Ali | Aethelon Labs" <${user}>`,
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

    fs.writeFileSync(inboxDbPath, JSON.stringify(inbox, null, 2), 'utf-8');

    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
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
      fs.writeFileSync(inboxDbPath, JSON.stringify(inbox, null, 2), 'utf-8');
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
