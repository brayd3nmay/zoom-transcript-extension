import { scrapeZoomTranscript } from '../lib/scrape.js';
import { downloadTranscript } from '../lib/download.js';

const BUTTON_ID = 'super-zoom-download-btn';
const SUCCESS_RESET_MS = 20000;
const ERROR_RESET_MS = 5000;

function buildButton() {
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.className = 'super-zoom-download-btn';
  btn.type = 'button';
  btn.dataset.state = 'idle';
  btn.setAttribute('aria-label', 'Download transcript as Markdown');
  btn.textContent = 'Download Transcript';
  btn.addEventListener('click', handleClick);
  return btn;
}

function setState(btn, state, label) {
  btn.dataset.state = state;
  btn.textContent = label;
  btn.disabled = state !== 'idle';
}

function resetAfter(btn, ms) {
  setTimeout(() => {
    if (!btn.isConnected) return;
    setState(btn, 'idle', 'Download Transcript');
  }, ms);
}

function failWith(btn, label) {
  setState(btn, 'error', label);
  resetAfter(btn, ERROR_RESET_MS);
}

function handleClick(event) {
  const btn = event.currentTarget;
  setState(btn, 'reading', 'Reading…');

  let result;
  try {
    result = scrapeZoomTranscript();
  } catch (err) {
    console.error('[super-zoom] scrape threw:', err);
    return failWith(btn, 'Failed');
  }

  if (!result || result.error === 'no_transcript') return failWith(btn, 'No transcript');
  if (result.error === 'empty') return failWith(btn, 'Empty');

  try {
    downloadTranscript(result);
  } catch (err) {
    console.error('[super-zoom] downloadTranscript threw:', err);
    return failWith(btn, 'Failed');
  }

  setState(btn, 'success', 'Downloaded');
  resetAfter(btn, SUCCESS_RESET_MS);
}

function tryInject() {
  if (document.getElementById(BUTTON_ID)) return;
  const panel = document.querySelector('#transcript-tab');
  if (!panel) return;
  panel.insertBefore(buildButton(), panel.firstChild);
}

const observer = new MutationObserver(tryInject);
observer.observe(document.body, { childList: true, subtree: true });
tryInject();
