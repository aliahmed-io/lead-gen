const fs = require('fs');
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
        console.error('Error reading inbox_db.json. Starting fresh.', err.message);
      }
    }
    return { threads: {} };
  }

  save() {
    try {
      if (!fs.existsSync(INBOX_PATH)) {
        fs.writeFileSync(INBOX_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
      }
      const release = lockfile.lockSync(INBOX_PATH, {
        retries: { retries: 5, minTimeout: 50 }
      });
      const tempPath = INBOX_PATH + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, INBOX_PATH);
      release();
    } catch (err) {
      console.error('Error saving inbox DB:', err.message);
    }
  }

  /**
   * Saves or appends a message to a thread keyed by the lead's email address.
   * Direction: 'inbound' (from lead) or 'outbound' (sent by you).
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

  getThread(leadEmail) {
    return this.data.threads[leadEmail.toLowerCase()] || null;
  }

  getAllThreads() {
    return Object.values(this.data.threads)
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  }

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
