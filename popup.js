import { scrapeZoomTranscript } from './lib/scrape.js';
import { downloadTranscript } from './lib/download.js';

const ZOOM_RECORDING_RE = /^https:\/\/[^\/]+\.zoom\.us\/rec\/(play|share)\//;

const statusEl = document.getElementById('status');
const buttonEl = document.getElementById('download');

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = kind;
}

function setError(text) {
  setStatus(text, 'error');
  buttonEl.disabled = false;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !ZOOM_RECORDING_RE.test(tab.url)) {
    setStatus('Open a Zoom recording page first.');
    buttonEl.disabled = true;
    return;
  }
  setStatus('Ready.');
  buttonEl.disabled = false;
  buttonEl.addEventListener('click', () => handleDownload(tab.id));
}

async function handleDownload(tabId) {
  buttonEl.disabled = true;
  setStatus('Reading transcript…');

  let injectionResult;
  try {
    injectionResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeZoomTranscript,
    });
  } catch (err) {
    return setError('Couldn’t read this page. Try reloading and clicking again.');
  }

  const result = injectionResult?.[0]?.result;
  if (!result) {
    return setError('Couldn’t read this page. Try reloading and clicking again.');
  }
  if (result.error === 'no_transcript') {
    return setError('No transcript found on this page. Make sure the transcript panel is visible.');
  }
  if (result.error === 'empty') {
    return setError('Transcript is empty.');
  }

  try {
    downloadTranscript(result);
    setStatus('Downloaded.', 'success');
  } catch (err) {
    return setError('Download failed: ' + (err?.message ?? 'unknown error'));
  }
}

init();
