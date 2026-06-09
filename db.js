// @ts-check
/**
 * @module db
 * @description Lightweight JSON-file database for persistent lead storage
 * with query-completion tracking for resume capability.
 *
 * Stores businesses keyed by normalised website domain (or name+address
 * when no website exists). Tracks which search queries have been fully
 * processed so re-runs skip them automatically.
 * 
 * @typedef {import('./scraper').BusinessDetails} BusinessDetails
 * @typedef {BusinessDetails & { _key?: string, addedAt?: string, updatedAt?: string }} StoredBusiness
 */

const fs = require('fs');
const { DB_FILE, DB_AUTOSAVE_INTERVAL } = require('./config');

/* ------------------------------------------------------------------ */
/*  LeadsDatabase                                                     */
/* ------------------------------------------------------------------ */

class LeadsDatabase {
  /**
   * Create or load a leads database from the configured JSON file.
   * @param {string} [dbPath] - override path (defaults to DB_FILE).
   */
  constructor(dbPath) {
    /** @type {string} */
    this.dbPath = dbPath || DB_FILE;
    /** @private @type {number} unsaved mutation counter */
    this._dirtyCount = 0;
    /** @type {{businesses: Record<string,StoredBusiness>, completedQueries: string[], metadata: unknown}} */
    this.data = this._load();
  }

  /* ── private ──────────────────────────────────────────────────── */

  /**
   * Load existing database from disk or create a fresh one.
   * @private
   * @returns {{businesses: Record<string,StoredBusiness>, completedQueries: string[], metadata: unknown}}
   */
  _load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed.businesses === 'object') {
          /* Ensure completedQueries array exists (compat with v1 DBs) */
          if (!Array.isArray(parsed.completedQueries)) {
            parsed.completedQueries = [];
          }

          console.log(
            `\u{1F4C2} Loaded database: ${Object.keys(parsed.businesses).length} businesses, ${parsed.completedQueries.length} completed queries`
          );
          return parsed;
        }
      }
    } catch (err) {
      if (err instanceof SyntaxError && fs.existsSync(this.dbPath)) {
        const backupPath = this.dbPath + '.bak';
        try {
          fs.renameSync(this.dbPath, backupPath);
          console.error(`\u26A0\uFE0F  Database file corrupt. Renamed to ${backupPath}`);
        } catch (renameErr) {
          console.error(`\u26A0\uFE0F  Failed to rename corrupt database: ${renameErr instanceof Error ? renameErr.message : String(renameErr)}`);
        }
        throw new Error(`Fatal: Database JSON is corrupt: ${err.message}`);
      }
      console.warn(
        `\u26A0\uFE0F  Database file unreadable, creating new: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return {
      businesses: {},
      completedQueries: [],
      metadata: {
        created: new Date().toISOString(),
        lastRun: null,
        totalRuns: 0,
      },
    };
  }

  /**
   * Generate a stable deduplication key for a business record.
   * @private
   * @param {BusinessDetails} business
   * @returns {string}
   */
  _generateKey(business) {
    if (business.website && business.website.trim().length > 0) {
      try {
        const raw = business.website.trim();
        const urlObj = new URL(
          raw.startsWith('http') ? raw : `https://${raw}`
        );
        return urlObj.hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        /* fall through */
      }
    }
    const name = (business.name || '').toLowerCase().trim();
    const addr = (business.address || '').toLowerCase().trim();
    return `${name}|${addr}`;
  }

  /**
   * Bump the dirty counter and auto-save when the threshold is reached.
   * @private
   */
  _maybeSave() {
    this._dirtyCount++;
    if (this._dirtyCount >= DB_AUTOSAVE_INTERVAL) {
      this.save();
    }
  }

  /* ── persistence ──────────────────────────────────────────────── */

  /**
   * Persist the database to disk using an atomic write-then-rename.
   */
  save() {
    try {
      const tmpPath = this.dbPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.dbPath);
      this._dirtyCount = 0;
    } catch (err) {
      console.error(`\u26A0\uFE0F  Failed to save database: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* ── business CRUD ────────────────────────────────────────────── */

  /**
   * Check whether a business already exists in the database.
   * @param {BusinessDetails} business
   * @returns {boolean}
   */
  has(business) {
    return this._generateKey(business) in this.data.businesses;
  }

  /**
   * Check whether a place link from Google Maps feed matches an existing business in the DB.
   * Matches by name (case-insensitive) parsed from the feed item label.
   *
   * @param {string} label - e.g. "Store Name · 5.0 (5) · Furniture store · Cary, NC"
   * @returns {boolean}
   */
  hasFeedItem(label) {
    if (!label) return false;
    const parts = label.split(/[·\u00B7]/);
    const rawName = parts[0];
    const name = rawName ? rawName.trim().toLowerCase() : '';
    if (!name) return false;

    for (const b of Object.values(this.data.businesses)) {
      if ((b.name || '').toLowerCase().trim() === name) {
        return true;
      }
    }
    return false;
  }

  /**
   * Insert a new business. Returns `false` if the record already exists.
   * @param {BusinessDetails} business
   * @returns {boolean}
   */
  add(business) {
    const key = this._generateKey(business);
    if (key in this.data.businesses) return false;

    this.data.businesses[key] = {
      ...business,
      _key: key,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._maybeSave();
    return true;
  }

  /**
   * Merge `updates` into an existing business record.
   * @param {BusinessDetails} business
   * @param {BusinessDetails} updates
   * @returns {boolean}
   */
  update(business, updates) {
    const key = this._generateKey(business);
    const existing = this.data.businesses[key];
    if (!existing) return false;

    Object.assign(existing, updates, {
      updatedAt: new Date().toISOString(),
    });
    this._maybeSave();
    return true;
  }

  /**
   * Retrieve a single business record (or `null`).
   * @param {BusinessDetails} business
   * @returns {StoredBusiness|null}
   */
  get(business) {
    const key = this._generateKey(business);
    return this.data.businesses[key] || null;
  }

  /**
   * Return every stored business record.
   * @returns {Array<StoredBusiness>}
   */
  getAll() {
    return Object.values(this.data.businesses);
  }

  /**
   * Return businesses that need email scanning:
   *   - Has a website
   *   - No email found yet
   *   - Never been scanned, OR previous attempt was a transient error
   *
   * Businesses with status "scanned" (checked, genuinely no email),
   * "found", "found-playwright", or "chain-skipped" are excluded.
   *
   * @returns {Array<StoredBusiness>}
   */
  getNeedingEmailScan() {
    return this.getAll().filter(
      (b) =>
        b.website &&
        b.website.trim().length > 0 &&
        (!b.email || b.email.length === 0) &&
        !b.emailStatus // Only check leads that have NEVER been tried
    );
  }

  /* ── query tracking ───────────────────────────────────────────── */

  /**
   * Check whether a search query has already been fully processed
   * in a previous run.
   * @param {string} query
   * @returns {boolean}
   */
  isQueryCompleted(query) {
    return this.data.completedQueries.includes(query);
  }

  /**
   * Mark a search query as fully processed. Triggers auto-save.
   * @param {string} query
   */
  markQueryCompleted(query) {
    if (!this.data.completedQueries.includes(query)) {
      this.data.completedQueries.push(query);
      this._maybeSave();
    }
  }

  /**
   * Return the number of queries already completed.
   * @returns {number}
   */
  getCompletedQueryCount() {
    return this.data.completedQueries.length;
  }

  /**
   * Clear the completed-queries list so all queries run again.
   * Businesses already in the DB are still deduplicated.
   */
  resetCompletedQueries() {
    this.data.completedQueries = [];
    this.save();
  }

  /* ── statistics ───────────────────────────────────────────────── */

  /**
   * Aggregate statistics about the current dataset.
   * @returns {{total:number, withEmails:number, withWebsites:number, platforms:Record<string,number>, states:Record<string,number>}}
   */
  getStats() {
    const all = this.getAll();
    /** @type {Record<string,number>} */
    const platforms = {};
    /** @type {Record<string,number>} */
    const states = {};

    for (const b of all) {
      const p = b.platform || 'Unknown';
      platforms[p] = (platforms[p] || 0) + 1;
      const s = b.state || 'Unknown';
      states[s] = (states[s] || 0) + 1;
    }

    return {
      total: all.length,
      withEmails: all.filter((b) => b.email && b.email.length > 0)
        .length,
      withWebsites: all.filter(
        (b) => b.website && b.website.trim().length > 0
      ).length,
      platforms,
      states,
    };
  }

  /**
   * Number of stored records.
   * @returns {number}
   */
  size() {
    return Object.keys(this.data.businesses).length;
  }

  /**
   * Record run metadata and persist.
   */
  markRunComplete() {
    this.data.metadata.lastRun = new Date().toISOString();
    this.data.metadata.totalRuns = (this.data.metadata.totalRuns || 0) + 1;
    this.save();
  }
}

module.exports = { LeadsDatabase };
