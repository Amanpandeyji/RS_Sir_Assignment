const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = path.resolve(__dirname, '..', 'database.db');
let db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[DB] Failed to open database:', err.message);
    tryResetDatabase();
  }
});
function ensureSchema() {
  db.all(`PRAGMA table_info('claims')`, (err, rows) => {
    if (err) {
      db.run(`
        CREATE TABLE IF NOT EXISTS claims (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          claim TEXT NOT NULL,
          subject TEXT NOT NULL,
          verification_status TEXT NOT NULL,
          summary TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      return;
    }
    if (!rows || rows.length === 0) {
      db.run(`
        CREATE TABLE IF NOT EXISTS claims (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          claim TEXT NOT NULL,
          subject TEXT NOT NULL,
          verification_status TEXT NOT NULL,
          summary TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      return;
    }
    const hasConfidence = rows.some(r => r.name === 'confidence');
    if (hasConfidence) {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`
          CREATE TABLE IF NOT EXISTS claims_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claim TEXT NOT NULL,
            subject TEXT NOT NULL,
            verification_status TEXT NOT NULL,
            summary TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        db.run(`
          INSERT INTO claims_new (id, claim, subject, verification_status, summary, timestamp)
          SELECT id, claim, subject, verification_status, summary, timestamp FROM claims
        `);
        db.run(`DROP TABLE claims`);
        db.run(`ALTER TABLE claims_new RENAME TO claims`);
        db.run('COMMIT');
      });
    } else {
      db.run(`
        CREATE TABLE IF NOT EXISTS claims (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          claim TEXT NOT NULL,
          subject TEXT NOT NULL,
          verification_status TEXT NOT NULL,
          summary TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  });
}
ensureSchema();
function tryResetDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    console.log('[DB] Deleted corrupt database file, recreating...');
  } catch (e) {
    console.error('[DB] Failed to delete DB file', e.message);
  }
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) return console.error('[DB] Failed to recreate database:', err.message);
    ensureSchema();
    console.log('[DB] Database recreated successfully.');
  });
}
process.on('uncaughtException', (err) => {
  if (String(err && err.message || '').toLowerCase().includes('sqlite')) {
    console.error('[DB] Uncaught sqlite error, attempting reset:', err.message);
    tryResetDatabase();
  }
});
module.exports = db;
