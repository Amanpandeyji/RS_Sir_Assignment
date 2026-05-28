const db = require('../db/database');
const processReport = require('../agents/archivist');
function insertClaim(claim, subject, status, summary, cb) {
  const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
  db.run(`INSERT INTO claims (claim, subject, verification_status, summary, timestamp) VALUES (?, ?, ?, ?, ?)`, [claim, subject, status, summary, ts], function(err) {
    cb(err, this.lastID);
  });
}
function runTest() {
  const subject = 'Shape of Earth';
  insertClaim('Earth is flat', subject, 'false', 'Local test insertion: flat earth claim', (err, id) => {
    if (err) return console.error('Insert failed:', err);
    console.log('Inserted false claim id=', id);
    const report = {
      claim: 'Earth is round',
      subject,
      status: 'VERIFIED',
      summary: 'Test report: Earth is round'
    };
    processReport(report, (res) => {
      console.log('Archivist response:', res);
      const exactOppositeReport = {
        claim: 'Earth is flat',
        subject,
        status: 'VERIFIED',
        summary: 'Contradicting exact claim'
      };
      processReport(exactOppositeReport, (res2) => {
        console.log('Archivist response for exact contradiction:', res2);
        process.exit(0);
      });
    });
  });
}
runTest();
