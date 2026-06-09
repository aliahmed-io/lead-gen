const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'campaign_db.json');

class CampaignDatabase {
  constructor() {
    this.data = this.load();
  }

  load() {
    if (fs.existsSync(DB_PATH)) {
      try {
        const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(fileContent);
      } catch (err) {
        console.error('Error reading campaign_db.json. Starting fresh.', err.message);
        return { records: {} };
      }
    }
    return { records: {} };
  }

  save() {
    // Write atomically
    const tempPath = DB_PATH + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_PATH);
  }

  getRecord(email) {
    if (!this.data.dailyCounts) {
      this.data.dailyCounts = {};
    }
    return this.data.records[email] || null;
  }

  getAllRecords() {
    return Object.values(this.data.records);
  }

  // Gets the current date string in YYYY-MM-DD format (Texas time)
  getTodayDateString() {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
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
    this.save();
  }

  addOrUpdateRecord(email, details) {
    if (!this.data.records[email]) {
      this.data.records[email] = {
        email: email,
        businessName: details.businessName || '',
        status: 'pending',
        sentAt: null,
        followedUpAt: null,
        repliedAt: null,
        accountId: null,
        messageId: null, // Track outgoing message ID for threading
        platform: details.platform || 'Other'
      };
    }
    this.data.records[email] = { ...this.data.records[email], ...details };
    this.save();
  }
}

module.exports = CampaignDatabase;
