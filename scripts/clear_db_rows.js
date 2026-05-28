const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.resolve(__dirname, '..', 'database.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open DB:', err.message);
    process.exit(1);
  }
  db.serialize(() => {
    db.run('DELETE FROM claims', function(err) {
      if (err) return console.error('Delete failed:', err.message);
      console.log('Deleted rows:', this.changes);
      db.run('VACUUM', (vErr) => {
        if (vErr) console.error('VACUUM failed:', vErr.message);
        else console.log('VACUUM complete.');
        db.close();
      });
    });
  });
});
