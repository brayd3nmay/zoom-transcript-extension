// Playback module: restores and persists the user's saved position and
// playback rate for a single Zoom recording's <video> element.
//
// Public surface: a single function, attachPlayback(video, videoId). See
// contracts/playback-api.md for the full contract — this file is the
// implementation, and the contract is the source of truth.

import {
  getSpeedPref,
  setSpeedPref,
  getPosition,
  setPosition,
  clearPosition,
} from './storage.js';

const SAVE_THROTTLE_MS = 2000;
const MIN_SAVE_TIME_S = 10;
const RESUME_THRESHOLD = 0.95;
const TOAST_FADE_MS = 2800;
const TOAST_REMOVE_MS = 3000;

const TOAST_ID = 'super-zoom-resume-toast';
const TOAST_CLASS = 'super-zoom-resume-toast';
const TOAST_FADING_CLASS = 'super-zoom-resume-toast--fading';

// Idempotency guard: tracks <video> elements already attached. WeakMap so
// removed video elements free their entries automatically.
const attached = new WeakMap();

export function attachPlayback(video, videoId) {
  // Bad-input guards. Duck-type the video so tests can pass a stand-in;
  // the production caller passes the real <video> from document.querySelector.
  if (!video || typeof video.addEventListener !== 'function') return;
  if (typeof videoId !== 'string' || videoId.length === 0) return;
  if (attached.has(video)) return;
  attached.set(video, true);

  // 1. Speed apply (immediate). Cache the rate we wrote so the resulting
  // ratechange event doesn't echo back into setSpeedPref.
  let lastAppliedRate = null;
  const savedRate = getSpeedPref();
  if (savedRate != null) {
    video.playbackRate = savedRate;
    lastAppliedRate = savedRate;
  }

  // 2. Position restore. If metadata is already loaded and duration is finite,
  // restore now. Otherwise defer to loadedmetadata.
  if (video.readyState >= 1 && Number.isFinite(video.duration)) {
    restorePosition(video, videoId);
  } else {
    video.addEventListener('loadedmetadata', () => {
      restorePosition(video, videoId);
    }, { once: true });
  }

  // 3. Throttled timeupdate save. Start at -Infinity so the very first
  // eligible timeupdate writes immediately (otherwise a fresh page load near
  // wall-clock t=0 would be stuck in the throttle window).
  let lastSaveAt = Number.NEGATIVE_INFINITY;
  video.addEventListener('timeupdate', () => {
    if (video.paused) return;
    if (video.currentTime < MIN_SAVE_TIME_S) return;
    const now = Date.now();
    if (now - lastSaveAt < SAVE_THROTTLE_MS) return;
    lastSaveAt = now;
    setPosition(videoId, video.currentTime);
  });

  // 4. ratechange persist with echo-write avoidance.
  video.addEventListener('ratechange', () => {
    const rate = video.playbackRate;
    if (rate === lastAppliedRate) return;
    lastAppliedRate = rate;
    setSpeedPref(rate);
  });

  // 5. ended clears the saved position.
  video.addEventListener('ended', () => {
    clearPosition(videoId);
  });
}

function restorePosition(video, videoId) {
  const saved = getPosition(videoId);
  if (saved == null) return;
  if (Number.isFinite(video.duration) && saved >= video.duration * RESUME_THRESHOLD) {
    clearPosition(videoId);
    return;
  }
  video.currentTime = saved;
  showResumeToast(saved);
}

function showResumeToast(seconds) {
  // Always wipe any pre-existing toast first — there is at most one.
  const existing = document.getElementById(TOAST_ID);
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = TOAST_ID;
  el.className = TOAST_CLASS;
  el.setAttribute('role', 'status');
  el.textContent = 'Resumed at ' + formatTime(seconds);
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);

  setTimeout(() => {
    if (!document.getElementById(TOAST_ID)) return;
    el.className = TOAST_CLASS + ' ' + TOAST_FADING_CLASS;
  }, TOAST_FADE_MS);
  setTimeout(() => {
    el.remove();
  }, TOAST_REMOVE_MS);
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  if (hh > 0) return pad(hh) + ':' + pad(mm) + ':' + pad(ss);
  return pad(mm) + ':' + pad(ss);
}
