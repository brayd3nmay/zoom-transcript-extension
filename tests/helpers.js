// Test helpers for speed-menu tests.
//
// Provides:
//  - setupDom():     installs a fresh JSDOM as the global document/window.
//  - buildZoomMenu():creates Zoom's native speed-menu DOM structure.
//  - makeVideo():    a minimal HTMLVideoElement-like stub usable as a
//                    WeakMap key, with playbackRate + ratechange dispatch.
//  - freshModule():  re-imports lib/speed-menu.js with a cache-busting query
//                    so module-level state (probeStartedAt, WeakMap) starts
//                    clean for each test.
//  - setNow(t):      installs a fake Date.now used by the deadline check.

import { JSDOM } from 'jsdom';

let _now = 0;

export function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://us02web.zoom.us/rec/play/abc123',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.Event = dom.window.Event;
  globalThis.localStorage = dom.window.localStorage;
  // The module uses Date.now() for deadline tracking. Override on globalThis
  // (Node's Date) so we can drive elapsed time deterministically.
  globalThis.Date.now = () => _now;
  _now = 1_000_000;
  return dom;
}

export function setNow(t) {
  _now = t;
}

export function advanceNow(deltaMs) {
  _now += deltaMs;
}

const NATIVE_RATES = [
  { text: '0.75x', selected: false },
  { text: 'Normal', selected: true },
  { text: '1.25x', selected: false },
  { text: '1.5x', selected: false },
  { text: '2.0x', selected: false },
];

export function buildZoomMenu(host = document.body) {
  // Mirrors the verified Zoom DOM contract from the plan.
  const extend = document.createElement('div');
  extend.className = 'vjs-extend-control';

  const speedControl = document.createElement('div');
  speedControl.className = 'vjs-speed-control';

  const speedBtn = document.createElement('button');
  speedBtn.className = 'vjs-control';
  speedBtn.type = 'button';
  speedBtn.textContent = 'Speed';
  speedControl.appendChild(speedBtn);

  const popMenu = document.createElement('div');
  popMenu.className = 'vjs-pop-menu';

  const ul = document.createElement('ul');
  ul.className = 'list';
  ul.setAttribute('role', 'menu');
  ul.setAttribute('data-v-b59f94be', '');

  NATIVE_RATES.forEach((r, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'menuitemradio');
    li.setAttribute('data-v-b59f94be', '');
    li.id = `vjs-pop-menu-item-${i}`;
    li.style.paddingLeft = '30px';
    if (r.selected) {
      li.className = 'selected';
      li.setAttribute('aria-checked', 'true');
    }

    const icon = document.createElement('i');
    icon.className = 'zm-icon-ok';
    icon.setAttribute('data-v-b59f94be', '');
    icon.style.display = r.selected ? '' : 'none';
    li.appendChild(icon);

    const span = document.createElement('span');
    span.setAttribute('data-v-b59f94be', '');
    span.textContent = r.text;
    li.appendChild(span);

    ul.appendChild(li);
  });

  popMenu.appendChild(ul);
  speedControl.appendChild(popMenu);
  extend.appendChild(speedControl);
  host.appendChild(extend);
  return { extend, ul };
}

export function getMenuUl() {
  return document.querySelector('.vjs-speed-control .vjs-pop-menu ul.list');
}

export function getItemTexts(ul) {
  return Array.from(ul.querySelectorAll('li')).map((li) =>
    li.querySelector('span')?.textContent ?? ''
  );
}

export function makeVideo(initialRate = 1) {
  const listeners = new Map();
  const video = {
    _rate: initialRate,
    get playbackRate() {
      return this._rate;
    },
    set playbackRate(v) {
      if (this._rate === v) return;
      this._rate = v;
      const ls = listeners.get('ratechange') || [];
      for (const fn of ls) fn({ type: 'ratechange' });
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const ls = listeners.get(type);
      if (!ls) return;
      const i = ls.indexOf(fn);
      if (i >= 0) ls.splice(i, 1);
    },
    dispatchEvent(ev) {
      const ls = listeners.get(ev.type) || [];
      for (const fn of ls) fn(ev);
      return true;
    },
  };
  return video;
}

export async function freshModule() {
  // ESM cache is keyed by URL — a unique query forces a fresh module
  // evaluation so module-level state (probeStartedAt etc.) resets per test.
  const url = new URL(`../lib/speed-menu.js?t=${Math.random()}`, import.meta.url);
  return await import(url.href);
}
