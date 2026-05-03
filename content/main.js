import { scrapeZoomTranscript } from '../lib/scrape.js';
import { downloadTranscript } from '../lib/download.js';
import { enableTheater, isTheaterEnabled, toggleTheater } from '../lib/theater.js';
import { getTheaterPref, setTheaterPref } from '../lib/storage.js';

const BUTTON_ID = 'super-zoom-download-btn';
const THEATER_BUTTON_ID = 'super-zoom-theater-btn';
const SUCCESS_RESET_MS = 20000;
const ERROR_RESET_MS = 5000;

// Apply persisted theater preference synchronously, before observers run.
if (getTheaterPref()) {
  enableTheater();
}

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

const SVG_NS = 'http://www.w3.org/2000/svg';

const THEATER_ICON_PATHS = [
  'M12 4.5C15.0776 4.5 17.8526 3.77588 19.8097 2.61579C19.9349 2.54155 20.0772 2.5 20.2228 2.5C20.652 2.5 21 2.84797 21 3.27722V9.5C21 16.5 16.5 21.5 12 21.5C7.5 21.5 3 16.5 3 9.5V3.27722C3 2.84797 3.34797 2.5 3.77722 2.5C3.92281 2.5 4.06506 2.54155 4.1903 2.61579C6.14736 3.77588 8.92241 4.5 12 4.5Z',
  'M6.5 9.5C6.86849 9.19313 7.40399 9 8 9C8.59601 9 9.13151 9.19313 9.5 9.5',
  'M12 15.2C13.192 15.2 14.263 14.9296 15 14.5C15 14.5 14.5 17.5 12 17.5C9.5 17.5 9 14.5 9 14.5C9.73698 14.9296 10.808 15.2 12 15.2Z',
  'M14.5 9.5C14.8685 9.19313 15.404 9 16 9C16.596 9 17.1315 9.19313 17.5 9.5',
];

function makeTheaterIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of THEATER_ICON_PATHS) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function setTheaterButtonState(btn, enabled) {
  const label = enabled ? 'Exit theater mode' : 'Enter theater mode';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  if (!btn.firstChild) {
    btn.appendChild(makeTheaterIcon());
  }
}

function buildTheaterButton() {
  const btn = document.createElement('button');
  btn.id = THEATER_BUTTON_ID;
  btn.type = 'button';
  btn.className = 'super-zoom-theater-btn';
  setTheaterButtonState(btn, isTheaterEnabled());
  btn.addEventListener('click', toggleAndPersist);
  return btn;
}

function toggleAndPersist() {
  const enabled = toggleTheater();
  setTheaterPref(enabled);
  const btn = document.getElementById(THEATER_BUTTON_ID);
  if (btn) setTheaterButtonState(btn, enabled);
}

function tryInjectTheaterButton() {
  if (document.getElementById(THEATER_BUTTON_ID)) return;
  const host = document.querySelector('.vjs-extend-control');
  if (!host) return;
  host.appendChild(buildTheaterButton());
}

function tryInjectDownloadButton() {
  if (document.getElementById(BUTTON_ID)) return;
  const panel = document.querySelector('#transcript-tab');
  if (!panel) return;
  panel.insertBefore(buildButton(), panel.firstChild);
}

function injectAll() {
  tryInjectDownloadButton();
  tryInjectTheaterButton();
}

const observer = new MutationObserver(injectAll);
observer.observe(document.body, { childList: true, subtree: true });
injectAll();

document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 't') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) {
    return;
  }
  e.preventDefault();
  toggleAndPersist();
}, true); // capture phase — beats Video.js / Zoom's own keydown handlers
