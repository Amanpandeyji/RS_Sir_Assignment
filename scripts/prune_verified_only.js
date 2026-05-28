const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');
function normalize(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
(async () => {
  console.log('Scanning claims...');
  db.all('SELECT id, claim, verification_status, timestamp FROM claims', (err, rows) => {
    if (err) {
      console.error('Failed to read claims:', err);
      db.close();
      process.exit(1);
    }
    const groups = rows.reduce((acc, r) => {
      const k = normalize(r.claim);
      acc[k] = acc[k] || [];
      acc[k].push(r);
      return acc;
    }, {});
    const toDelete = [];
    const kept = [];
    Object.values(groups).forEach(group => {
      const verified = group.filter(r => /^(verified|true|yes)$/i.test(String(r.verification_status || '').trim()));
      if (verified.length > 0) {
        verified.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        const keep = verified[0];
        kept.push(keep.id);
        group.forEach(r => { if (r.id !== keep.id) toDelete.push(r.id); });
      } else {
        group.forEach(r => toDelete.push(r.id));
      }
    });
    if (toDelete.length === 0) {
      console.log('No rows to delete. Kept', kept.length, 'verified rows.');
      db.close();
      return;
    }
    const batches = [];
    const batchSize = 200;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      batches.push(toDelete.slice(i, i + batchSize));
    }
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      batches.forEach(batch => {
        const placeholders = batch.map(() => '?').join(',');
        const sql = `DELETE FROM claims WHERE id IN (${placeholders})`;
        db.run(sql, batch, function(err) {
          if (err) console.error('Delete batch error:', err);
          else console.log('Deleted', this.changes, 'rows in batch');
        });
      });
      db.run('COMMIT', () => {
        console.log('Prune complete. Kept', kept.length, 'verified rows. Deleted', toDelete.length, 'rows.');
        db.close();
      });
    });
  });
})();
