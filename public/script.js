const claimInput = document.getElementById('claimInput');
const result = document.getElementById('result');
const verifyButton = document.getElementById('verifyButton');
const resetButton = document.getElementById('resetButton');
const downloadButton = document.getElementById('downloadButton');
function setBusy(isBusy) {
  verifyButton.disabled = isBusy;
  resetButton.disabled = isBusy;
  downloadButton.disabled = isBusy;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function verifyClaim() {
  const claim = claimInput.value.trim();
  if (!claim) {
    result.textContent = 'Please enter a claim.';
    return;
  }
  setBusy(true);
  result.textContent = 'Verifying claim...';
  try {
    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim })
    });
    const data = await response.json();
    if (!response.ok) {
      result.textContent = data.message || 'Verification failed.';
      return;
    }
    result.textContent = [
      `Status: ${data.report.status}`,
      `Summary: ${data.report.summary}`,
      `Database Action: ${data.databaseAction.action}`,
      `Database Message: ${data.databaseAction.message || ''}`,
      `Decision: ${data.state.databaseDecision}`
    ].join('\n');
  } catch (error) {
    result.textContent = 'Network error.';
  } finally {
    setBusy(false);
  }
}
async function resetDatabase() {
  if (!confirm('This will delete all saved claims. Continue?')) {
    return;
  }
  setBusy(true);
  result.textContent = 'Resetting database...';
  try {
    const response = await fetch('/api/reset', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      result.textContent = data.message || 'Database reset failed.';
      return;
    }
    result.textContent = data.message || 'Database reset complete.';
    claimInput.value = '';
  } catch (error) {
    result.textContent = 'Network error.';
  } finally {
    setBusy(false);
  }
}
async function downloadDatabase() {
  setBusy(true);
  result.textContent = 'Preparing database download...';
  try {
    const response = await fetch('/api/download');
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      result.textContent = data.message || 'Download failed.';
      return;
    }
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match ? match[1] : 'claims-export.json';
    const blob = await response.blob();
    downloadBlob(blob, filename);
    result.textContent = 'Database download started.';
  } catch (error) {
    result.textContent = 'Network error.';
  } finally {
    setBusy(false);
  }
}
verifyButton.addEventListener('click', verifyClaim);
resetButton.addEventListener('click', resetDatabase);
downloadButton.addEventListener('click', downloadDatabase);
claimInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') verifyClaim();
});
