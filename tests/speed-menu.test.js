import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupDom,
  setNow,
  advanceNow,
  buildZoomMenu,
  getMenuUl,
  getItemTexts,
  makeVideo,
  freshModule,
} from './helpers.js';

beforeEach(() => {
  setupDom();
});

test('injection: inserts 1.75x after 1.5x and 3x after 2.0x in fixed order', async () => {
  buildZoomMenu();
  const video = makeVideo();
  const { trySpeedMenuInjection } = await freshModule();

  trySpeedMenuInjection(video);

  const ul = getMenuUl();
  assert.deepEqual(getItemTexts(ul), [
    '0.75x',
    'Normal',
    '1.25x',
    '1.5x',
    '1.75x',
    '2.0x',
    '3x',
  ]);
});

test('injection: clicking an injected item sets video.playbackRate to that rate', async () => {
  buildZoomMenu();
  const video = makeVideo();
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video);

  const ul = getMenuUl();
  const items = Array.from(ul.querySelectorAll('li[data-super-zoom="1"]'));
  const item175 = items.find((li) => li.querySelector('span').textContent === '1.75x');
  const item3 = items.find((li) => li.querySelector('span').textContent === '3x');

  item175.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(video.playbackRate, 1.75);

  item3.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(video.playbackRate, 3);
});

test('injection: idempotent — second call does not double-inject', async () => {
  buildZoomMenu();
  const { trySpeedMenuInjection } = await freshModule();

  trySpeedMenuInjection(makeVideo());
  trySpeedMenuInjection(makeVideo());
  trySpeedMenuInjection(makeVideo());

  const ul = getMenuUl();
  assert.equal(ul.querySelectorAll('li[data-super-zoom="1"]').length, 2);
});

test('injection: re-injects when Vue diffs out our items', async () => {
  buildZoomMenu();
  const video = makeVideo();
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video);

  const ul = getMenuUl();
  // Simulate Vue re-render wiping our markers.
  ul.querySelectorAll('li[data-super-zoom="1"]').forEach((li) => li.remove());
  assert.equal(ul.querySelectorAll('li[data-super-zoom="1"]').length, 0);

  trySpeedMenuInjection(video);
  assert.equal(ul.querySelectorAll('li[data-super-zoom="1"]').length, 2);
});

test('injection: ratechange marks our 1.75x active and clears it when rate changes', async () => {
  buildZoomMenu();
  const video = makeVideo();
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video);

  const ul = getMenuUl();
  const ours = Array.from(ul.querySelectorAll('li[data-super-zoom="1"]'));
  const item175 = ours.find((li) => li.querySelector('span').textContent === '1.75x');
  const item3 = ours.find((li) => li.querySelector('span').textContent === '3x');

  // Click 1.75x — rate becomes 1.75; ratechange handler should mark it selected.
  item175.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(item175.classList.contains('selected'), true, '1.75x has .selected');
  assert.equal(item175.querySelector('i.zm-icon-ok').style.display, '', '1.75x checkmark visible');
  assert.equal(item3.classList.contains('selected'), false, '3x not selected');
  assert.equal(item3.querySelector('i.zm-icon-ok').style.display, 'none', '3x checkmark hidden');

  // Switch to 3x.
  item3.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(item3.classList.contains('selected'), true);
  assert.equal(item3.querySelector('i.zm-icon-ok').style.display, '');
  assert.equal(item175.classList.contains('selected'), false);
  assert.equal(item175.querySelector('i.zm-icon-ok').style.display, 'none');

  // Switch to a Zoom-native rate (1.5) — both our items deselect.
  video.playbackRate = 1.5;
  assert.equal(item175.classList.contains('selected'), false);
  assert.equal(item3.classList.contains('selected'), false);
});

test('injection: ratechange clears `selected` on Zoom native items that no longer match', async () => {
  // Bug fix: when our 1.75x is active, Zoom's previously-selected native
  // item (e.g. 1.5x) must lose its `.selected` class — otherwise the menu
  // shows TWO check-marks, which is misleading.
  buildZoomMenu();
  const video = makeVideo();
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video);

  const ul = getMenuUl();
  // Simulate the user clicking Zoom's "1.5x" first — Vue would mark it
  // selected. We simulate Vue's effect directly.
  const native15 = Array.from(ul.querySelectorAll('li[role="menuitemradio"]:not([data-super-zoom])'))
    .find((li) => li.querySelector('span').textContent === '1.5x');
  native15.classList.add('selected');
  native15.setAttribute('aria-checked', 'true');

  // Now click our injected 1.75x.
  const item175 = Array.from(ul.querySelectorAll('li[data-super-zoom="1"]'))
    .find((li) => li.querySelector('span').textContent === '1.75x');
  item175.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(item175.classList.contains('selected'), true, 'our 1.75x is selected');
  assert.equal(native15.classList.contains('selected'), false, 'native 1.5x cleared');
  assert.equal(native15.getAttribute('aria-checked'), null, 'native 1.5x aria-checked cleared');

  // Switch back to a native rate (1) — our 1.75x clears, "Normal" gets selected.
  video.playbackRate = 1;
  const native1 = Array.from(ul.querySelectorAll('li[role="menuitemradio"]:not([data-super-zoom])'))
    .find((li) => li.querySelector('span').textContent === 'Normal');
  assert.equal(item175.classList.contains('selected'), false, 'our 1.75x deselected');
  assert.equal(native1.classList.contains('selected'), true, 'native Normal (=1) selected');
});

test('fallback: not built when menu is absent and deadline has not elapsed', async () => {
  // No buildZoomMenu — menu UL absent. We still need a host for the fallback.
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());
  // Less than 5s elapsed since first probe.
  advanceNow(1000);
  trySpeedMenuInjection(makeVideo());

  assert.equal(document.getElementById('super-zoom-speed-btn'), null);
  assert.equal(document.querySelector('.super-zoom-speed-wrapper'), null);
});

test('fallback: built when menu is absent and 5s deadline has elapsed', async () => {
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const video = makeVideo();
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video); // first probe at t=now
  advanceNow(5001);
  trySpeedMenuInjection(video); // deadline elapsed → build fallback

  const wrapper = document.querySelector('.super-zoom-speed-wrapper');
  assert.ok(wrapper, 'wrapper exists');
  assert.equal(wrapper.parentElement, extend, 'wrapper appended into .vjs-extend-control');
  const btn = document.getElementById('super-zoom-speed-btn');
  assert.ok(btn, 'fallback button exists');
  assert.equal(btn.classList.contains('super-zoom-speed-btn'), true);
  const menu = wrapper.querySelector('.super-zoom-speed-menu');
  assert.ok(menu, 'fallback menu exists');
  assert.equal(menu.hidden, true, 'menu starts hidden');
  assert.equal(menu.getAttribute('role'), 'menu');
});

test('fallback: dropdown items are 0.75/1/1.25/1.5/1.75/2/3 in order with proper attrs', async () => {
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const video = makeVideo(1);
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video);
  advanceNow(5001);
  trySpeedMenuInjection(video);

  const items = document.querySelectorAll('.super-zoom-speed-menu-item');
  const rates = Array.from(items).map((li) => li.dataset.rate);
  assert.deepEqual(rates, ['0.75', '1', '1.25', '1.5', '1.75', '2', '3']);

  const labels = Array.from(items).map((li) => li.textContent);
  assert.deepEqual(labels, ['0.75×', '1×', '1.25×', '1.5×', '1.75×', '2×', '3×']);

  for (const li of items) {
    assert.equal(li.getAttribute('role'), 'menuitemradio');
    assert.ok(li.classList.contains('super-zoom-speed-menu-item'));
    assert.ok(['true', 'false'].includes(li.getAttribute('aria-checked')));
  }
  // Initial active state matches the video's current rate (1).
  const active = Array.from(items).find(
    (li) => li.getAttribute('aria-checked') === 'true'
  );
  assert.equal(active.dataset.rate, '1');
  // Button label shows the current rate.
  assert.equal(document.getElementById('super-zoom-speed-btn').textContent, '1×');
});

test('fallback: clicking button toggles menu visibility', async () => {
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());
  advanceNow(5001);
  trySpeedMenuInjection(makeVideo());

  const btn = document.getElementById('super-zoom-speed-btn');
  const menu = document.querySelector('.super-zoom-speed-menu');
  assert.equal(menu.hidden, true);
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(menu.hidden, false);
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(menu.hidden, true);
});

test('fallback: clicking an item sets playbackRate and closes the menu', async () => {
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const video = makeVideo();
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video);
  advanceNow(5001);
  trySpeedMenuInjection(video);

  const btn = document.getElementById('super-zoom-speed-btn');
  const menu = document.querySelector('.super-zoom-speed-menu');
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(menu.hidden, false);

  const item3 = document.querySelector('.super-zoom-speed-menu-item[data-rate="3"]');
  item3.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(video.playbackRate, 3);
  assert.equal(menu.hidden, true);
});

test('fallback: Escape key closes the menu', async () => {
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());
  advanceNow(5001);
  trySpeedMenuInjection(makeVideo());

  const btn = document.getElementById('super-zoom-speed-btn');
  const menu = document.querySelector('.super-zoom-speed-menu');
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(menu.hidden, false);

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu.hidden, true);
});

test('fallback: outside click closes the menu', async () => {
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);
  const outside = document.createElement('div');
  outside.id = 'outside';
  document.body.appendChild(outside);

  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());
  advanceNow(5001);
  trySpeedMenuInjection(makeVideo());

  const btn = document.getElementById('super-zoom-speed-btn');
  const menu = document.querySelector('.super-zoom-speed-menu');
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(menu.hidden, false);

  outside.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(menu.hidden, true);
});

test('fallback: ratechange updates aria-checked on items and the button label', async () => {
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const video = makeVideo(1);
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video);
  advanceNow(5001);
  trySpeedMenuInjection(video);

  const btn = document.getElementById('super-zoom-speed-btn');
  assert.equal(btn.textContent, '1×');

  video.playbackRate = 1.75;

  const item175 = document.querySelector('.super-zoom-speed-menu-item[data-rate="1.75"]');
  const item1 = document.querySelector('.super-zoom-speed-menu-item[data-rate="1"]');
  assert.equal(item175.getAttribute('aria-checked'), 'true');
  assert.equal(item1.getAttribute('aria-checked'), 'false');
  assert.equal(btn.textContent, '1.75×');
});

test('fallback: only one wrapper is built across many calls', async () => {
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());
  advanceNow(5001);
  trySpeedMenuInjection(makeVideo());
  trySpeedMenuInjection(makeVideo());
  trySpeedMenuInjection(makeVideo());

  assert.equal(document.querySelectorAll('.super-zoom-speed-wrapper').length, 1);
  assert.equal(document.querySelectorAll('#super-zoom-speed-btn').length, 1);
});

test('force-fallback flag: skips injection and builds fallback even when menu is present', async () => {
  buildZoomMenu();
  const extend = document.querySelector('.vjs-extend-control');
  localStorage.setItem('super-zoom:force-fallback', '1');

  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());

  // No injected items in the native menu.
  const ul = getMenuUl();
  assert.equal(ul.querySelectorAll('li[data-super-zoom="1"]').length, 0);
  // Fallback exists, attached to .vjs-extend-control.
  const wrapper = document.querySelector('.super-zoom-speed-wrapper');
  assert.ok(wrapper);
  assert.equal(wrapper.parentElement, extend);
});

test('mutually exclusive: once injection succeeds, fallback is never built', async () => {
  buildZoomMenu();
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());
  // Plenty of time elapses; we keep ticking. Fallback must NOT appear.
  advanceNow(60_000);
  trySpeedMenuInjection(makeVideo());
  trySpeedMenuInjection(makeVideo());

  assert.equal(document.querySelector('.super-zoom-speed-wrapper'), null);
});

test('mutually exclusive: once fallback is built, injection probe stops even if menu later appears', async () => {
  // Start with no menu, deadline expires, fallback built.
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';
  document.body.appendChild(extend);

  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());
  advanceNow(5001);
  trySpeedMenuInjection(makeVideo());
  assert.ok(document.getElementById('super-zoom-speed-btn'));

  // Now Zoom's menu appears. We should NOT inject.
  buildZoomMenu(extend);
  trySpeedMenuInjection(makeVideo());

  const ul = getMenuUl();
  assert.equal(ul.querySelectorAll('li[data-super-zoom="1"]').length, 0);
});

test('only one ratechange listener wired per video, even across re-injection', async () => {
  buildZoomMenu();
  const video = makeVideo();
  let calls = 0;
  // Spy on add/remove for ratechange.
  const realAdd = video.addEventListener;
  video.addEventListener = function (type, fn) {
    if (type === 'ratechange') calls++;
    return realAdd.call(this, type, fn);
  };

  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(video);
  // Force re-injection by removing markers.
  document.querySelectorAll('li[data-super-zoom="1"]').forEach((li) => li.remove());
  trySpeedMenuInjection(video);
  trySpeedMenuInjection(video);

  assert.equal(calls, 1, 'ratechange listener attached exactly once');
});

test('injection: cloned items carry data-super-zoom="1" and have no id', async () => {
  buildZoomMenu();
  const { trySpeedMenuInjection } = await freshModule();
  trySpeedMenuInjection(makeVideo());

  const ul = getMenuUl();
  const ours = ul.querySelectorAll('li[data-super-zoom="1"]');
  assert.equal(ours.length, 2, 'two items injected');
  for (const li of ours) {
    assert.equal(li.getAttribute('data-super-zoom'), '1');
    assert.equal(li.id, '', `injected item should have no id (had: "${li.id}")`);
    // Vue scoped attribute survives cloneNode(true)
    assert.equal(li.hasAttribute('data-v-b59f94be'), true, 'preserves Vue scoped attr');
    // Cloned item is not pre-selected
    assert.equal(li.classList.contains('selected'), false);
    // Inner icon is hidden initially
    const icon = li.querySelector('i.zm-icon-ok');
    assert.equal(icon.style.display, 'none');
  }
});
