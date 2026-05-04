import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createFakeDocument, FakeElement, FakeVideo } from './dom-stub.mjs';

// Mutable storage state — replaced every test in beforeEach.
let storage;

function resetStorage() {
  storage = {
    speedPref: null,
    positions: new Map(),
    speedSets: [],
    positionSets: [],
    clears: [],
  };
}
resetStorage();

// Mock lib/storage.js *before* importing the module under test. The mock
// closes over the mutable `storage` object so each test can rewire it.
mock.module('../lib/storage.js', {
  namedExports: {
    getTheaterPref: () => false,
    setTheaterPref: () => {},
    getSpeedPref: () => storage.speedPref,
    setSpeedPref: (rate) => { storage.speedSets.push(rate); },
    getPosition: (id) => storage.positions.get(id) ?? null,
    setPosition: (id, time) => { storage.positionSets.push({ id, time }); },
    clearPosition: (id) => { storage.clears.push(id); },
    gcExpiredPositions: () => {},
  },
});

// Wire DOM globals before importing the module so any top-level code (none
// today) sees a sane environment.
globalThis.document = createFakeDocument();

const { attachPlayback } = await import('../lib/playback.js');

beforeEach(() => {
  resetStorage();
  globalThis.document = createFakeDocument();
  mock.timers.reset();
});

// ---------- Bad input ----------

test('attachPlayback no-ops on null video', () => {
  assert.doesNotThrow(() => attachPlayback(null, 'abc'));
  assert.equal(storage.speedSets.length, 0);
  assert.equal(storage.positionSets.length, 0);
});

test('attachPlayback no-ops on non-HTMLVideoElement', () => {
  assert.doesNotThrow(() => attachPlayback({ foo: 'bar' }, 'abc'));
  assert.doesNotThrow(() => attachPlayback('not a video', 'abc'));
});

test('attachPlayback no-ops on empty videoId', () => {
  const v = new FakeVideo();
  attachPlayback(v, '');
  assert.equal(v.listenerCount('timeupdate'), 0);
});

test('attachPlayback no-ops on non-string videoId', () => {
  const v = new FakeVideo();
  attachPlayback(v, null);
  attachPlayback(v, 42);
  assert.equal(v.listenerCount('timeupdate'), 0);
});

// ---------- Idempotency ----------

test('second attachPlayback on the same video is a no-op', () => {
  const v = new FakeVideo();
  attachPlayback(v, 'id1');
  const before = v.listenerCount('timeupdate');
  attachPlayback(v, 'id1');
  assert.equal(v.listenerCount('timeupdate'), before);
});

test('second attach does not re-restore position or re-show toast', () => {
  storage.speedPref = 1.5;
  storage.positions.set('id1', 30);
  const v = new FakeVideo({ readyState: 1, duration: 600 });

  attachPlayback(v, 'id1');
  assert.equal(v.currentTime, 30);
  assert.ok(document.getElementById('super-zoom-resume-toast'));

  // Mutate state to prove the second call doesn't fire.
  document.getElementById('super-zoom-resume-toast').remove();
  v.currentTime = 100;

  attachPlayback(v, 'id1');
  assert.equal(v.currentTime, 100, 'second attach must not seek');
  assert.equal(document.getElementById('super-zoom-resume-toast'), null);
});

// ---------- Speed apply at attach ----------

test('attach applies saved speed pref immediately', () => {
  storage.speedPref = 1.75;
  const v = new FakeVideo({ playbackRate: 1 });
  attachPlayback(v, 'id1');
  assert.equal(v.playbackRate, 1.75);
});

test('attach does not touch playbackRate when no pref is saved', () => {
  storage.speedPref = null;
  const v = new FakeVideo({ playbackRate: 1.25 });
  attachPlayback(v, 'id1');
  assert.equal(v.playbackRate, 1.25);
});

// ---------- Position restore ----------

test('attach with readyState>=1 + finite duration seeks immediately', () => {
  storage.positions.set('id1', 90);
  const v = new FakeVideo({ readyState: 1, duration: 600 });
  attachPlayback(v, 'id1');
  assert.equal(v.currentTime, 90);
});

test('attach with readyState 0 defers seek to loadedmetadata', () => {
  storage.positions.set('id1', 90);
  const v = new FakeVideo({ readyState: 0, duration: NaN });
  attachPlayback(v, 'id1');
  assert.equal(v.currentTime, 0, 'must wait for loadedmetadata');
  // Now the metadata arrives.
  v.readyState = 1;
  v.duration = 600;
  v.fire('loadedmetadata');
  assert.equal(v.currentTime, 90);
});

test('attach with finite-duration check via loadedmetadata when duration arrives late', () => {
  storage.positions.set('id1', 50);
  const v = new FakeVideo({ readyState: 1, duration: NaN });
  attachPlayback(v, 'id1');
  assert.equal(v.currentTime, 0, 'no seek when duration is NaN');
  v.duration = 200;
  v.fire('loadedmetadata');
  assert.equal(v.currentTime, 50);
});

test('skip restore (and clear) when saved >= duration * 0.95', () => {
  storage.positions.set('id1', 591); // 591/600 = 98.5%
  const v = new FakeVideo({ readyState: 1, duration: 600 });
  attachPlayback(v, 'id1');
  assert.equal(v.currentTime, 0, 'no seek');
  assert.deepEqual(storage.clears, ['id1'], 'must clear stale position');
  assert.equal(document.getElementById('super-zoom-resume-toast'), null);
});

test('no restore (and no toast) when no saved position', () => {
  storage.positions.clear();
  const v = new FakeVideo({ readyState: 1, duration: 600 });
  attachPlayback(v, 'id1');
  assert.equal(v.currentTime, 0);
  assert.equal(document.getElementById('super-zoom-resume-toast'), null);
  assert.deepEqual(storage.clears, []);
});

// ---------- Resume toast ----------

test('toast renders with id, class, role=status, and MM:SS text', () => {
  storage.positions.set('id1', 125); // 02:05
  const v = new FakeVideo({ readyState: 1, duration: 600 });
  attachPlayback(v, 'id1');

  const toast = document.getElementById('super-zoom-resume-toast');
  assert.ok(toast, 'toast element exists');
  assert.equal(toast.tagName, 'DIV');
  assert.equal(toast.className, 'super-zoom-resume-toast');
  assert.equal(toast.getAttribute('role'), 'status');
  assert.equal(toast.textContent, 'Resumed at 02:05');
});

test('toast formats HH:MM:SS when saved time >= 3600s', () => {
  storage.positions.set('id1', 3725); // 01:02:05
  const v = new FakeVideo({ readyState: 1, duration: 7200 });
  attachPlayback(v, 'id1');
  assert.equal(
    document.getElementById('super-zoom-resume-toast').textContent,
    'Resumed at 01:02:05'
  );
});

test('toast click removes it immediately', () => {
  storage.positions.set('id1', 60);
  const v = new FakeVideo({ readyState: 1, duration: 600 });
  attachPlayback(v, 'id1');
  const toast = document.getElementById('super-zoom-resume-toast');
  toast.click();
  assert.equal(document.getElementById('super-zoom-resume-toast'), null);
});

test('toast auto-fades and removes on its timer', () => {
  mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  storage.positions.set('id1', 60);
  const v = new FakeVideo({ readyState: 1, duration: 600 });
  attachPlayback(v, 'id1');

  const toast = document.getElementById('super-zoom-resume-toast');
  assert.ok(!toast.className.includes('--fading'), 'not fading yet');

  mock.timers.tick(2800);
  assert.match(toast.className, /super-zoom-resume-toast--fading/, 'fade modifier added');

  mock.timers.tick(200); // total 3000ms
  assert.equal(document.getElementById('super-zoom-resume-toast'), null, 'removed');
});

test('toast removes any existing toast before inserting', () => {
  // Pre-existing toast from a prior load.
  const stale = new FakeElement('div');
  stale.id = 'super-zoom-resume-toast';
  document.body.appendChild(stale);

  storage.positions.set('id1', 60);
  const v = new FakeVideo({ readyState: 1, duration: 600 });
  attachPlayback(v, 'id1');

  const toasts = document.body.children.filter(
    (c) => c.id === 'super-zoom-resume-toast'
  );
  assert.equal(toasts.length, 1, 'exactly one toast in the DOM');
  assert.notEqual(toasts[0], stale, 'stale toast was replaced');
});

// ---------- Throttled timeupdate save ----------

test('timeupdate writes one position per SAVE_THROTTLE_MS window', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const v = new FakeVideo({ readyState: 1, duration: 600, currentTime: 30, paused: false });
  attachPlayback(v, 'id1');

  v.fire('timeupdate');
  assert.equal(storage.positionSets.length, 1, 'first write');

  v.currentTime = 31;
  v.fire('timeupdate');
  assert.equal(storage.positionSets.length, 1, 'throttled within window');

  mock.timers.tick(2000);
  v.currentTime = 32;
  v.fire('timeupdate');
  assert.equal(storage.positionSets.length, 2, 'next window writes again');
});

test('timeupdate saves even when currentTime < 10 (no floor)', () => {
  // The 10-second floor was removed: scrubbing back to the start must
  // overwrite a previously-saved later time, otherwise reload would jump
  // back to the old position.
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const v = new FakeVideo({ readyState: 1, duration: 600, currentTime: 5, paused: false });
  attachPlayback(v, 'id1');
  v.fire('timeupdate');
  assert.deepEqual(storage.positionSets, [{ id: 'id1', time: 5 }]);
});

test('timeupdate does not save while paused', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const v = new FakeVideo({ readyState: 1, duration: 600, currentTime: 30, paused: true });
  attachPlayback(v, 'id1');
  v.fire('timeupdate');
  assert.equal(storage.positionSets.length, 0);
});

// ---------- seeked (immediate save, bypasses throttle) ----------

test('seeked saves the new position immediately', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const v = new FakeVideo({ readyState: 1, duration: 600, currentTime: 0, paused: true });
  attachPlayback(v, 'id1');
  v.currentTime = 0;
  v.fire('seeked');
  assert.deepEqual(storage.positionSets, [{ id: 'id1', time: 0 }]);
});

test('seeked overwrites a previously saved later time when scrubbed back to start', () => {
  // The exact scenario that was broken under the old 10-second floor.
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  storage.positions.set('id1', 200); // pretend we had a prior save
  const v = new FakeVideo({ readyState: 1, duration: 600, currentTime: 0, paused: true });
  attachPlayback(v, 'id1');
  v.currentTime = 0;
  v.fire('seeked');
  // The latest save is the new currentTime (0), not the old 200.
  assert.equal(storage.positionSets[storage.positionSets.length - 1].time, 0);
});

// ---------- ratechange (NO LONGER persists — speed pref is click-driven) ----------

test('ratechange does NOT persist (speed pref is driven by user clicks, not rate events)', () => {
  // Rationale: Zoom's player resets playbackRate to its default during init,
  // which would otherwise clobber the saved value via ratechange.
  // installSpeedClickPersist (in content/main.js) listens for actual menu
  // clicks instead.
  const v = new FakeVideo({ playbackRate: 1 });
  attachPlayback(v, 'id1');
  v.playbackRate = 1.75;
  v.fire('ratechange');
  assert.deepEqual(storage.speedSets, []);
});

// ---------- speed re-apply on lifecycle events ----------

test('attach re-applies saved speed on play (defends against Zoom reset)', () => {
  storage.speedPref = 1.5;
  const v = new FakeVideo({ readyState: 1, playbackRate: 1 });
  attachPlayback(v, 'id1');
  // Pretend Zoom reset to 1 after our initial set
  v.playbackRate = 1;
  v.fire('play');
  assert.equal(v.playbackRate, 1.5);
});

test('attach re-applies saved speed on loadedmetadata when readyState started at 0', () => {
  storage.speedPref = 1.75;
  const v = new FakeVideo({ readyState: 0, playbackRate: 1 });
  attachPlayback(v, 'id1');
  // Even if our initial set didn't take, loadedmetadata re-applies.
  v.playbackRate = 1;
  v.fire('loadedmetadata');
  assert.equal(v.playbackRate, 1.75);
});

// ---------- ended ----------

test('ended clears the saved position', () => {
  const v = new FakeVideo({ readyState: 1, duration: 600 });
  attachPlayback(v, 'id1');
  v.fire('ended');
  assert.deepEqual(storage.clears, ['id1']);
});
