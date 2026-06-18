const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const DB_PATH = path.join(__dirname, 'campaign_db.json');
const BATCH_SAVE_THRESHOLD = 10;

class CampaignDatabase {
  constructor() {
    this._dirtyCount = 0;
    this.data = this.load();
  }

  load() {
    if (fs.existsSync(DB_PATH)) {
      try {
        const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (!parsed.records) parsed.records = {};
        if (!parsed.dailyCounts) parsed.dailyCounts = {};
        if (!parsed.unsubscribed) parsed.unsubscribed = [];
        if (!parsed.activityLog) parsed.activityLog = [];
        if (!parsed.abTests) parsed.abTests = {};
        if (!parsed.warmup) parsed.warmup = {};
        return parsed;
      } catch (err) {
        console.error('Error reading campaign_db.json. Starting fresh.', err.message);
        return { records: {}, dailyCounts: {}, unsubscribed: [], activityLog: [], abTests: {}, warmup: {} };
      }
    }
    return { records: {}, dailyCounts: {}, unsubscribed: [], activityLog: [], abTests: {}, warmup: {} };
  }

  save() {
    try {
      if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
      }
      const release = lockfile.lockSync(DB_PATH, { retries: { retries: 5, minTimeout: 50 } });
      const tempPath = DB_PATH + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_PATH);
      release();
      this._dirtyCount = 0;
    } catch (err) {
      console.error('Error saving campaign DB:', err.message);
    }
  }

  /**
   * Increments the dirty counter and auto-saves when the threshold is reached.
   */
  _maybeSave() {
    this._dirtyCount++;
    if (this._dirtyCount >= BATCH_SAVE_THRESHOLD) {
      this.save();
    }
  }

  /**
   * Forces an immediate save regardless of dirty counter state.
   * Call this at the end of a batch operation to flush pending writes.
   */
  forceSave() {
    if (this._dirtyCount > 0) {
      this.save();
    }
  }

  getRecord(email) {
    return this.data.records[email] || null;
  }

  getAllRecords() {
    return Object.values(this.data.records);
  }

  /**
   * Returns the current date string in YYYY-MM-DD format (Texas / Central Time).
   *
   * @returns {string}
   */
  getTodayDateString() {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
  }

  getDailyCount(accountId) {
    if (!this.data.dailyCounts) this.data.dailyCounts = {};
    if (!this.data.dailyCounts[accountId]) this.data.dailyCounts[accountId] = {};

    const today = this.getTodayDateString();
    return this.data.dailyCounts[accountId][today] || 0;
  }

  incrementDailyCount(accountId) {
    if (!this.data.dailyCounts) this.data.dailyCounts = {};
    if (!this.data.dailyCounts[accountId]) this.data.dailyCounts[accountId] = {};

    const today = this.getTodayDateString();
    this.data.dailyCounts[accountId][today] = (this.data.dailyCounts[accountId][today] || 0) + 1;
    this._maybeSave();
  }

  /**
   * Creates or updates a campaign record.
   * New records include the full schema: email, businessName, status, timestamps,
   * accountId, messageId, platform, website, city, state.
   * Status changes are logged to the activity log.
   *
   * @param {string} email
   * @param {object} details
   */
  addOrUpdateRecord(email, details) {
    const oldRecord = this.data.records[email];
    const oldStatus = oldRecord ? oldRecord.status : null;

    if (!oldRecord) {
      this.data.records[email] = {
        email: email,
        businessName: details.businessName || '',
        status: 'pending',
        sentAt: null,
        followedUp1At: null,
        followedUp2At: null,
        followedUp3At: null,
        followedUpAt: null,
        repliedAt: null,
        bouncedAt: null,
        unsubscribedAt: null,
        completedAt: null,
        accountId: null,
        messageId: null,
        platform: details.platform || 'Other',
        website: details.website || '',
        city: details.city || '',
        state: details.state || '',
      };
    }
    this.data.records[email] = { ...this.data.records[email], ...details };

    const newStatus = this.data.records[email].status;
    if (newStatus && newStatus !== oldStatus) {
      this._logActivity(email, oldStatus, newStatus);
    }

    this._maybeSave();
  }

  /**
   * Appends a status-change entry to the activity log.
   *
   * @param {string} email
   * @param {string|null} fromStatus
   * @param {string} toStatus
   */
  _logActivity(email, fromStatus, toStatus) {
    if (!this.data.activityLog) this.data.activityLog = [];
    this.data.activityLog.push({
      email,
      from: fromStatus,
      to: toStatus,
      at: Date.now(),
    });
    if (this.data.activityLog.length > 500) {
      this.data.activityLog = this.data.activityLog.slice(-500);
    }

    if (toStatus === 'interested') {
      setImmediate(() => {
        try {
          const settingsPath = path.join(__dirname, 'settings.json');
          if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            if (settings.webhookUrl) {
              const payload = JSON.stringify({
                email,
                businessName: this.data.records[email] ? this.data.records[email].businessName : '',
                status: toStatus,
                timestamp: Date.now()
              });
              const url = new URL(settings.webhookUrl);
              const lib = url.protocol === 'https:' ? require('https') : require('http');
              const req = lib.request(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload)
                }
              });
              req.on('error', e => console.error('Webhook error:', e.message));
              req.write(payload);
              req.end();
            }
          }
        } catch (e) {
          console.error('Failed to trigger webhook:', e.message);
        }
      });
    }
  }

  /* ── Analytics Methods ─────────────────────────────────────────── */

  /**
   * Returns aggregate campaign status counts.
   *
   * @returns {{ pending: number, sent: number, followed_up_1: number, followed_up_2: number, bounced: number, failed: number, interested: number, completed_no_interest: number }}
   */
  getStats() {
    const counts = {
      pending: 0,
      sent: 0,
      followed_up_1: 0,
      followed_up_2: 0,
      followed_up_3: 0,
      bounced: 0,
      soft_bounce: 0,
      failed: 0,
      interested: 0,
      unsubscribed: 0,
      completed_no_interest: 0,
    };

    for (const record of Object.values(this.data.records)) {
      if (record.status in counts) {
        counts[record.status]++;
      }
    }

    return counts;
  }

  /**
   * Returns per-account statistics for a given SMTP account ID.
   *
   * @param {number|string} accountId
   * @returns {{ sentToday: number, totalSent: number, bounceCount: number, bounceRate: number, lastActiveAt: number|null }}
   */
  getAccountStats(accountId) {
    const aid = String(accountId);
    let totalSent = 0;
    let bounceCount = 0;
    let lastActiveAt = null;

    for (const record of Object.values(this.data.records)) {
      if (String(record.accountId) === aid) {
        if (['sent', 'followed_up_1', 'followed_up_2', 'interested', 'completed_no_interest'].includes(record.status)) {
          totalSent++;
        }
        if (record.status === 'bounced') {
          bounceCount++;
          totalSent++;
        }
        const ts = record.sentAt || record.followedUp1At || record.followedUp2At;
        if (ts && (lastActiveAt === null || ts > lastActiveAt)) {
          lastActiveAt = ts;
        }
      }
    }

    return {
      sentToday: this.getDailyCount(accountId),
      totalSent,
      bounceCount,
      bounceRate: totalSent > 0 ? bounceCount / totalSent : 0,
      lastActiveAt,
    };
  }

  /* ── Unsubscribe Management ────────────────────────────────────── */

  /**
   * Returns the full list of unsubscribed email addresses.
   *
   * @returns {string[]}
   */
  getUnsubscribed() {
    return this.data.unsubscribed || [];
  }

  /**
   * Adds an email to the unsubscribe list if not already present.
   *
   * @param {string} email
   */
  addUnsubscribe(email) {
    if (!this.data.unsubscribed) this.data.unsubscribed = [];
    const normalized = email.toLowerCase().trim();
    if (!this.data.unsubscribed.includes(normalized)) {
      this.data.unsubscribed.push(normalized);
      this._maybeSave();
    }
  }

  /**
   * Checks whether an email is on the unsubscribe list.
   *
   * @param {string} email
   * @returns {boolean}
   */
  isUnsubscribed(email) {
    if (!this.data.unsubscribed) return false;
    return this.data.unsubscribed.includes(email.toLowerCase().trim());
  }

  /* ── Volume & Activity ─────────────────────────────────────────── */

  /**
   * Returns daily send volume for the last N days across all accounts.
   *
   * @param {number} [days=7]
   * @returns {Array<{ date: string, count: number }>}
   */
  getDailyVolume(days) {
    const numDays = days || 7;
    const result = [];
    const now = new Date();

    for (let d = numDays - 1; d >= 0; d--) {
      const target = new Date(now);
      target.setDate(target.getDate() - d);

      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = formatter.formatToParts(target);
      const dateStr = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;

      let dayTotal = 0;
      if (this.data.dailyCounts) {
        for (const accountCounts of Object.values(this.data.dailyCounts)) {
          dayTotal += accountCounts[dateStr] || 0;
        }
      }

      result.push({ date: dateStr, count: dayTotal });
    }

    return result;
  }

  /**
   * Returns the most recent N status changes from the activity log.
   *
   * @param {number} [limit=20]
   * @returns {Array<{ email: string, from: string|null, to: string, at: number }>}
   */
  getRecentActivity(limit) {
    const n = limit || 20;
    const log = this.data.activityLog || [];
    return log.slice(-n);
  }

  /* ── A/B Testing & Warmup Tracking ────────────────────────────── */

  getAbTest(testId) {
    if (!this.data.abTests) this.data.abTests = {};
    return this.data.abTests[testId] || null;
  }

  updateAbTest(testId, variant, result) {
    if (!this.data.abTests) this.data.abTests = {};
    if (!this.data.abTests[testId]) {
      this.data.abTests[testId] = { variants: {} };
    }
    if (!this.data.abTests[testId].variants[variant]) {
      this.data.abTests[testId].variants[variant] = { sent: 0, replies: 0 };
    }
    if (result === 'sent') this.data.abTests[testId].variants[variant].sent++;
    if (result === 'reply') this.data.abTests[testId].variants[variant].replies++;
    this._maybeSave();
  }

  getWarmupStatus(accountId) {
    if (!this.data.warmup) this.data.warmup = {};
    return this.data.warmup[accountId] || { level: 1, currentVolume: 0 };
  }

  updateWarmupStatus(accountId, data) {
    if (!this.data.warmup) this.data.warmup = {};
    this.data.warmup[accountId] = { ...this.getWarmupStatus(accountId), ...data };
    this._maybeSave();
  }
}

const instance = new CampaignDatabase();
module.exports = instance;
