'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch { throw new Error('Start with npm scripts, or Node --experimental-sqlite (Node 22.12+).'); }
const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.LEADGEN_DATA_DIR || path.join(root, 'data-working'));
let db;
function connection() {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, 'leadgen.sqlite'));
  db.exec(`PRAGMA busy_timeout=15000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS documents (name TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, type TEXT NOT NULL, email TEXT, account_id TEXT, at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, email TEXT NOT NULL, step INTEGER NOT NULL, status TEXT NOT NULL, account_id TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS events_account_time ON events(account_id,at);
    CREATE INDEX IF NOT EXISTS events_type_time ON events(type,at);
    CREATE INDEX IF NOT EXISTS attempts_account_time ON attempts(account_id,created_at);
    CREATE INDEX IF NOT EXISTS attempts_time ON attempts(created_at);`);
  return db;
}
let transactionDepth=0;
function transaction(fn){const c=connection();const nested=transactionDepth>0;const savepoint='nested_'+transactionDepth;c.exec(nested?'SAVEPOINT '+savepoint:'BEGIN IMMEDIATE');transactionDepth++;try{const result=fn();if(result?.then)throw new Error('Transactions must be synchronous');c.exec(nested?'RELEASE '+savepoint:'COMMIT');return result;}catch(error){if(nested){c.exec('ROLLBACK TO '+savepoint);c.exec('RELEASE '+savepoint);}else c.exec('ROLLBACK');throw error;}finally{transactionDepth--;}}

function read(name, fallback) {
  const row = connection().prepare('SELECT payload FROM documents WHERE name=?').get(name);
  if (!row) { if (fallback !== undefined) return structuredClone(fallback); throw new Error(`Missing ${name}; run npm run setup`); }
  return JSON.parse(row.payload);
}
function write(name, value) { connection().prepare('INSERT INTO documents(name,payload) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload').run(name, JSON.stringify(value)); }
function mutate(name, fn) { return transaction(() => { const data = read(name); const result = fn(data); write(name, data); return result; }); }

// Explicit columns avoid schema drift and keep event insertion compatible with SQLite.
function record(type, data = {}) {
  connection().prepare('INSERT INTO events(id,type,email,account_id,at,payload) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(), type, data.email || null, data.accountId == null ? null : String(data.accountId), Date.now(), JSON.stringify(data));
}
function events(limit = 1000) { return connection().prepare('SELECT * FROM events ORDER BY at DESC LIMIT ?').all(Math.min(10000, limit)).map(r => ({ ...JSON.parse(r.payload), id:r.id, type:r.type, at:r.at })); }
function lease(name, owner, durationMs) { return transaction(() => {
  connection().prepare('DELETE FROM leases WHERE expires_at < ?').run(Date.now());
  const current = connection().prepare('SELECT owner FROM leases WHERE name=?').get(name);
  if (current && current.owner !== owner) return false;
  connection().prepare('INSERT INTO leases VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at').run(name, owner, Date.now()+durationMs); return true;
}); }
function release(name, owner) { connection().prepare('DELETE FROM leases WHERE name=? AND owner=?').run(name, owner); }
function close() { if(db){db.close();db=null;} }
module.exports = { root, dataDir, connection, transaction, read, write, mutate, record, events, lease, release, close };
