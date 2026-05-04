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
const RESUME_THRESHOLD = 0.95;
const TOAST_FADE_MS = 2800;
const TOAST_REMOVE_MS = 3000;

// Selector for any speed-menu radio item (Zoom's native menu OR our injected items).
// Persistence is driven by user clicks here — NOT by the `ratechange` event,
// which also fires for Zoom's own player init resets.
const SPEED_MENU_ITEM_SELECTOR = '.vjs-speed-control li[role="menuitemradio"]';

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

  // 1. Speed apply. Repeated on multiple lifecycle events because Zoom's
  // player can reset playbackRate to its default after our initial set
  // (likely during media-element setup / first play). Each apply is a no-op
  // if the rate already matches, so the redundancy is cheap.
  const applySavedRate = () => {
    const saved = getSpeedPref();
    if (saved == null) return;
    if (video.playbackRate !== saved) video.playbackRate = saved;
  };
  applySavedRate();
  if (video.readyState >= 1) {
    // Metadata already loaded — schedule a microtask re-apply for the
    // post-attach reset window.
    queueMicrotask(applySavedRate);
  } else {
    video.addEventListener('loadedmetadata', applySavedRate, { once: true });
  }
  video.addEventListener('play', applySavedRate, { once: true });

  // 2. Position restore. If metadata is already loaded and duration is finite,
  // restore now. Otherwise defer to loadedmetadata.
  if (video.readyState >= 1 && Number.isFinite(video.duration)) {
    restorePosition(video, videoId);
  } else {
    video.addEventListener('loadedmetadata', () => {
      restorePosition(video, videoId);
    }, { once: true });
  }

  // 3. Throttled timeupdate save. No floor — if you scrub back to the start
  // we want THAT position remembered, not the previous saved time.
  let lastSaveAt = Number.NEGATIVE_INFINITY;
  video.addEventListener('timeupdate', () => {
    if (video.paused) return;
    const now = Date.now();
    if (now - lastSaveAt < SAVE_THROTTLE_MS) return;
    lastSaveAt = now;
    setPosition(videoId, video.currentTime);
  });

  // 4. Save immediately on user-initiated seeks (clicking the timeline,
  // pressing j/l). `seeked` fires when the seek completes. Bypasses the
  // throttle so a quick scrub-to-0-and-leave still overwrites the saved time.
  video.addEventListener('seeked', () => {
    setPosition(videoId, video.currentTime);
    lastSaveAt = Date.now();
  });

  // 5. ended clears the saved position.
  video.addEventListener('ended', () => {
    clearPosition(videoId);
  });
}

// Persist speed only on actual clicks of speed-menu items — both Zoom's
// native ones and our injected items. Delegated at document level so it
// covers both the original menu and any Vue re-render. Exported so the
// content-script entry point can install it once per page (and so unit
// tests don't auto-install when they import attachPlayback).
let speedClickInstalled = false;
export function installSpeedClickPersist() {
  if (speedClickInstalled) return;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  speedClickInstalled = true;
  document.addEventListener('click', (e) => {
    const li = e.target && typeof e.target.closest === 'function' && e.target.closest(SPEED_MENU_ITEM_SELECTOR);
    if (!li) return;
    // Defer to next microtask so Zoom's Vue handler (or our injected click
    // handler) has set playbackRate before we read it.
    queueMicrotask(() => {
      const v = document.querySelector('video');
      if (v) setSpeedPref(v.playbackRate);
    });
  }, true);
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
