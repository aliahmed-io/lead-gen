const fs = require('fs');
const { errOf } = require('./utils');
const path = require('path');
const lockfile = require('proper-lockfile');

const INBOX_PATH = path.join(__dirname, 'inbox_db.json');

class InboxDatabase {
  constructor() {
    this.data = this.load();
  }

  load() {
    if (fs.existsSync(INBOX_PATH)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(INBOX_PATH, 'utf-8'));
        if (!parsed.threads) parsed.threads = {};
        return parsed;
      } catch (err) {
        if (err instanceof SyntaxError && fs.existsSync(INBOX_PATH)) {
          const backupPath = INBOX_PATH + '.bak';
          try {
            fs.renameSync(INBOX_PATH, backupPath);
            console.error(`⚠️ Database file corrupt. Renamed to ${backupPath}`);
          } catch (renameErr) {
            console.error(`⚠️ Failed to rename corrupt database: ${errOf(renameErr).message}`);
          }
          throw new Error(`Fatal: Inbox database JSON is corrupt: ${errOf(err).message}`);
        }
        console.error('Error reading inbox_db.json. Starting fresh.', errOf(err).message);
      }
    }
    return { threads: {} };
  }

  save() {
    try {
      if (!fs.existsSync(INBOX_PATH)) {
        fs.writeFileSync(INBOX_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
      }
      const release = lockfile.lockSync(INBOX_PATH, /** @type {any} */ ({
        retries: { retries: 5, minTimeout: 50 }
      }));
      const tempPath = INBOX_PATH + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, INBOX_PATH);
      release();
    } catch (err) {
      console.error('Error saving inbox DB:', errOf(err).message);
    }
  }

  /**
   * Saves or appends a message to a thread keyed by the lead's email address.
   * Direction: 'inbound' (from lead) or 'outbound' (sent by you).
   * @param {{ leadEmail: string; fromAddress?: string; subject?: string; textBody?: string; htmlBody?: string; direction?: string; accountId?: string | number }} params
   */
  addMessage({ leadEmail, fromAddress, subject, textBody, htmlBody, direction, accountId }) {
    const key = leadEmail.toLowerCase();
    if (!this.data.threads[key]) {
      this.data.threads[key] = {
        leadEmail: key,
        accountId,
        messages: [],
        lastMessageAt: null,
        unread: false,
      };
    }

    this.data.threads[key].messages.push({
      id: Date.now().toString(),
      direction: direction || 'inbound',
      from: fromAddress,
      subject: subject || '',
      text: textBody || '',
      html: htmlBody || '',
      receivedAt: Date.now(),
    });

    this.data.threads[key].lastMessageAt = Date.now();

    if (direction === 'inbound') {
      this.data.threads[key].unread = true;
    }

    this.save();
  }

  /** @param {string} leadEmail */
  getThread(leadEmail) {
    return this.data.threads[leadEmail.toLowerCase()] || null;
  }

  getAllThreads() {
    return Object.values(this.data.threads)
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  }

  /** @param {string} leadEmail */
  markRead(leadEmail) {
    const key = leadEmail.toLowerCase();
    if (this.data.threads[key]) {
      this.data.threads[key].unread = false;
      this.save();
    }
  }

  getUnreadCount() {
    return Object.values(this.data.threads).filter(t => t.unread).length;
  }
}

const instance = new InboxDatabase();
module.exports = instance;
