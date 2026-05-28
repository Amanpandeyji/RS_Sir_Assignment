const express = require('express');
const investigateClaim = require('../agents/investigator');
const processReport = require('../agents/archivist');
const db = require('../db/database');
const router = express.Router();
function runSql(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}
function allSql(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}
router.post('/verify', async (req, res) => {
  const claim = req.body && req.body.claim;
  if (!claim || !String(claim).trim()) {
    res.status(400).json({ message: 'Claim is required.' });
    return;
  }
  try {
    const report = await investigateClaim(claim);
    try {
      const s = String(report.status || '').trim().toLowerCase();
      if (s.includes('debunk') || s.includes('false') || s.includes('refut') || s.includes('disproven') || s.includes('fals')) {
        report.status = 'False';
      } else if (s.includes('verif') || s === 'true' || s === 'yes' || s.includes('confirm')) {
        report.status = 'Verified';
      }
    } catch (e) {
    }
    try {
      const summary = String(report.summary || '').toLowerCase();
      const conf = Number.isFinite(report.confidence) ? Number(report.confidence) : null;
      const noEvidenceRegex = /\bno (?:scientific |credible |reputable |reliable |convincing )?evidence\b|no credible sources|no evidence to support|lack of evidence|not supported by|insufficient evidence|no reputable sources|no reliable evidence|no convincing evidence|lack any evidence/;
      const hasNoEvidence = noEvidenceRegex.test(summary) || /\black of evidence\b/.test(summary) || summary.includes('no credible sources');
      const statusLower = String(report.status || '').toLowerCase();
      if ((statusLower === 'verified' && hasNoEvidence) || (conf !== null && conf < 0.5 && statusLower === 'verified')) {
        report.status = 'False';
      }
    } catch (e) {
    }
    processReport(report, result => {
      if (process.env.ARCHIVIST_DEBUG) {
        console.log('[ARCHIVIST ROUTE] report:', JSON.stringify(report));
        console.log('[ARCHIVIST ROUTE] result:', JSON.stringify(result));
      }
      try {
        if (result && result.action === 'FLAG') {
          report.status = 'FLAG';
        }
      } catch (e) {}
      res.json({
        state: {
          claim: report.claim,
          investigationHistory: report.investigationHistory,
          status: report.status,
          databaseDecision: result.action
        },
        report,
        databaseAction: result
      });
    });
  } catch {
    res.status(500).json({ message: 'Verification failed.' });
  }
});
router.get('/history', (req, res) => {
  db.all(`SELECT id, claim, subject, verification_status, summary, timestamp FROM claims ORDER BY timestamp DESC`, (err, rows) => {
    if (err) {
      res.status(500).json({ message: 'Database error.' });
      return;
    }
    res.json({ count: rows.length, claims: rows });
  });
});
router.post('/reset', async (req, res) => {
  try {
    await runSql('DELETE FROM claims');
    await runSql("DELETE FROM sqlite_sequence WHERE name = 'claims'");
    await runSql('VACUUM');
    res.json({ message: 'Database reset complete.' });
  } catch (err) {
    res.status(500).json({ message: 'Database reset failed.' });
  }
});
router.get('/download', async (req, res) => {
  try {
    const claims = await allSql(`SELECT id, claim, subject, verification_status, summary, timestamp FROM claims ORDER BY timestamp DESC`);
    const payload = {
      exportedAt: new Date().toISOString(),
      count: claims.length,
      claims
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="claims-export-${stamp}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ message: 'Download failed.' });
  }
});
module.exports = router;
