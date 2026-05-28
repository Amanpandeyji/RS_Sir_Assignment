const db = require('../db/database');
function normalizeClaim(claim) {
  return String(claim || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function dbg() {
  if (!process.env.ARCHIVIST_DEBUG) return;
  try {
    console.log.apply(console, ['[ARCHIVIST]'].concat(Array.from(arguments)));
  } catch (e) {}
}
function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
function hasNegation(tokens) {
  const neg = new Set(['no', 'not', 'never', 'none', 'without', "n't"]);
  return tokens.some(t => neg.has(t));
}
function getStatusCategory(s) {
  const v = String(s || '').trim().toLowerCase();
  const verified = new Set(['verified', 'true', 'yes', 'confirmed', 'supported', 'likely', 'plausible']);
  const falses = new Set(['false', 'no', 'debunked', 'refuted', 'falsified', 'disproven']);
  if (verified.has(v)) return 'verified';
  if (falses.has(v)) return 'false';
  return null;
}
function processReport(report, callback) {
  const claim = String(report.claim || '').trim();
  if (!claim) return callback({ action: 'DISCARD', message: 'Empty claim.' });
  const normalizedClaim = normalizeClaim(claim);
  const statusNorm = String(report.status || '').trim().toLowerCase();
  const statusCat = getStatusCategory(statusNorm);
  const subject = String(report.subject || 'General').trim();
  const verifiedSet = new Set(['verified', 'true', 'yes']);
  const falseSet = new Set(['false', 'no']);
  dbg('Incoming report:', { claim, normalizedClaim, statusNorm, statusCat, subject });
  db.get(
    `SELECT * FROM claims WHERE lower(trim(claim)) = ? LIMIT 1`,
    [normalizedClaim],
    (err, existingExact) => {
      if (err) return callback({ action: 'FLAG', message: 'Database lookup failed.' });
      if (existingExact) {
        const existingStatus = String(existingExact.verification_status || '').trim().toLowerCase();
        dbg('Exact match found:', { existingClaim: existingExact.claim, existingStatus });
        if ((verifiedSet.has(existingStatus) && verifiedSet.has(statusNorm)) ||
            (falseSet.has(existingStatus) && falseSet.has(statusNorm))) {
          dbg('Decision: DISCARD (duplicate exact)');
          return callback({ action: 'DISCARD', message: 'Duplicate claim found.' });
        }
        if ((verifiedSet.has(existingStatus) && falseSet.has(statusNorm)) ||
            (falseSet.has(existingStatus) && verifiedSet.has(statusNorm))) {
          dbg('Decision: FLAG (exact contradiction)');
          return callback({ action: 'FLAG', message: 'Contradiction with existing exact claim.' });
        }
        dbg('Decision: DISCARD (exact fallback)');
        return callback({ action: 'DISCARD', message: 'Duplicate claim found.' });
      }
      db.all(
        `SELECT claim, verification_status FROM claims WHERE lower(trim(verification_status)) IN ('verified','true','yes','false','no')`,
        [],
        (allErr, allRows) => {
          if (allErr) return callback({ action: 'FLAG', message: 'Database lookup failed.' });
          const incomingTokens = tokenize(normalizedClaim);
          const incomingNeg = hasNegation(incomingTokens);
          const incomingCat = statusCat; 
          const antonyms = [ ['flat', 'round'], ['alive', 'dead'] ];
          for (const r of allRows || []) {
            const existingNorm = normalizeClaim(r.claim);
            const existingTokens = tokenize(existingNorm);
            const existingNeg = hasNegation(existingTokens);
            const existingStatus = String(r.verification_status || '').trim().toLowerCase();
            const existingCat = getStatusCategory(existingStatus);
            for (const pair of antonyms) {
              if ((incomingTokens.includes(pair[0]) && existingTokens.includes(pair[1])) ||
                  (incomingTokens.includes(pair[1]) && existingTokens.includes(pair[0]))) {
                dbg('Antonym match', { pair, incomingTokens, existingTokens, incomingCat, existingCat });
                if ((incomingCat === 'verified' && existingCat === 'false') ||
                    (incomingCat === 'false' && existingCat === 'verified') ||
                    incomingCat === 'verified' || existingCat === 'verified') {
                  dbg('Decision: FLAG (antonym heuristic)');
                  return callback({ action: 'FLAG', message: 'Contradiction detected via antonym heuristic.' });
                }
              }
            }
            const shared = incomingTokens.filter(t => existingTokens.includes(t));
            if (shared.length >= 2 && (incomingNeg !== existingNeg)) {
              if ((incomingCat === 'verified' && existingCat === 'false') ||
                  (incomingCat === 'false' && existingCat === 'verified') ||
                  incomingCat === 'verified' || existingCat === 'verified') {
                dbg('Decision: FLAG (negation heuristic)', { shared, incomingNeg, existingNeg });
                return callback({ action: 'FLAG', message: 'Contradiction detected via negation heuristic.' });
              }
            }
          }
          db.get(
            `SELECT
               SUM(CASE WHEN lower(trim(verification_status)) IN ('verified','true','yes') THEN 1 ELSE 0 END) as verified_count,
               SUM(CASE WHEN lower(trim(verification_status)) IN ('false','no') THEN 1 ELSE 0 END) as false_count
             FROM claims WHERE subject = ?`,
            [subject],
            (countErr, counts) => {
              if (countErr) return callback({ action: 'FLAG', message: 'Database lookup failed.' });
              const hasVerified = counts && counts.verified_count > 0;
              const hasFalse = counts && counts.false_count > 0;
              dbg('Subject counts', { subject, counts });
              if (hasVerified && hasFalse) {
                dbg('Decision: FLAG (subject conflict)');
                return callback({ action: 'FLAG', message: 'Subject has existing conflicting records.' });
              }
              if (statusCat === 'verified' && hasFalse) {
                dbg('Decision: FLAG (subject: incoming verified but existing false)');
                return callback({ action: 'FLAG', message: 'Contradiction: existing false record for subject.' });
              }
              if (statusCat === 'false' && hasVerified) {
                dbg('Decision: FLAG (subject: incoming false but existing verified)');
                return callback({ action: 'FLAG', message: 'Contradiction: existing verified record for subject.' });
              }
              const norm = normalizedClaim;
              db.all(
                `SELECT id, claim, verification_status FROM claims WHERE lower(trim(claim)) LIKE '%' || ? || '%' OR ? LIKE '%' || lower(trim(claim)) || '%'`,
                [norm, norm],
                (simErr, similarRows) => {
                  if (simErr) return callback({ action: 'FLAG', message: 'Database lookup failed.' });
                    if (similarRows && similarRows.length > 0) {
                        dbg('Similar rows found', { similarCount: similarRows.length, similarRows: similarRows.map(r=>({id:r.id,claim:r.claim,verification_status:r.verification_status})) });
                      for (const r of similarRows) {
                        const existingStatus = String(r.verification_status || '').trim().toLowerCase();
                        const existingCat = getStatusCategory(existingStatus);
                        if ((existingCat === 'verified' && statusCat === 'false') ||
                            (existingCat === 'false' && statusCat === 'verified')) {
                            dbg('Decision: FLAG (similar contradiction)', { existingClaim: r.claim, existingStatus });
                            return callback({ action: 'FLAG', message: 'Contradiction with similar existing claim.' });
                        }
                      }
                        dbg('Decision: DISCARD (redundant similar)');
                        return callback({ action: 'DISCARD', message: 'Similar claim already exists.' });
                    }
                  if (verifiedSet.has(statusNorm)) {
                    db.run(
                      `INSERT INTO claims (claim, subject, verification_status, summary) VALUES (?, ?, ?, ?)`,
                      [claim, subject, report.status, report.summary],
                      function(insertErr) {
                        if (insertErr) {
                          dbg('Insert failed', insertErr);
                          return callback({ action: 'FLAG', message: 'Failed to store claim.' });
                        }
                        const insertedId = this.lastID;
                        dbg('Inserted claim id', insertedId);
                        try {
                          const CHROMA_URL = process.env.CHROMA_URL;
                          const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION || 'claims';
                          if (CHROMA_URL && report.embedding && Array.isArray(report.embedding)) {
                            const upsertUrl = `${CHROMA_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(CHROMA_COLLECTION)}/add`;
                            const payload = {
                              ids: [String(insertedId)],
                              embeddings: [report.embedding],
                              metadatas: [{ id: insertedId, claim, subject, verification_status: report.status, summary: report.summary }],
                              documents: [claim]
                            };
                            fetch(upsertUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                              .catch((err)=> dbg('Chroma upsert failed', err));
                          }
                        } catch (e) { dbg('Chroma upsert exception', e); }

                        dbg('Decision: INSERT, claim stored successfully');
                        return callback({ action: 'INSERT', message: 'Claim stored successfully.' });
                      }
                    );
                    return;
                  }
                  return callback({ action: 'DISCARD', message: 'Report not stored (not verified).' });
                }
              );
            }
          );
        }
      );
    }
  );
}
module.exports = processReport;
