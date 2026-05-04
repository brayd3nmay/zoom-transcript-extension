// Inject 1.75x and 3x into Zoom's native speed menu, with a fallback
// dropdown when injection isn't possible.
//
// See contracts/speed-menu-api.md for the public contract and
// contracts/speed-menu-css.md for the fallback DOM contract.

import { getForceFallback } from './storage.js';

const MENU_SELECTOR = '.vjs-speed-control .vjs-pop-menu ul.list';
const HOST_SELECTOR = '.vjs-extend-control';
const FALLBACK_BTN_ID = 'super-zoom-speed-btn';
const INJECTION_DEADLINE_MS = 5000;

const INJECTED_RATES = [
  { rate: 1.75, text: '1.75x', insertAfterText: '1.5x' },
  { rate: 3, text: '3x', insertAfterText: '2.0x' },
];

const FALLBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 3];

// Module state. `freshModule()` in tests gets a clean copy via cache-busting.
let injected = false;
let fallbackBuilt = false;
let probeStartedAt = null;

// Test-affordance flag is read once per session (it's effectively static).
// Skipping the per-tick localStorage read keeps the observer hot path cheap.
let forceFallbackCached = null;
function isForceFallback() {
  if (forceFallbackCached === null) forceFallbackCached = getForceFallback();
  return forceFallbackCached;
}

// Per-video one-time setup (e.g. the `ratechange` listener for the injected
// items). The fallback wires its own `ratechange` listener inside buildFallback.
const injectedWired = new WeakMap();

export function trySpeedMenuInjection(video) {
  // Test affordance — deterministic fallback path.
  if (isForceFallback()) {
    if (!fallbackBuilt) buildFallback(video);
    return;
  }

  // If the fallback is up, the injection path is shut off forever.
  if (fallbackBuilt) return;

  const ul = document.querySelector(MENU_SELECTOR);

  if (ul) {
    // If we've already injected and our markers are still there, nothing to
    // do. If `injected` is true but markers vanished (Vue diff'd them out),
    // re-run the injection algorithm so the items reappear.
    if (injected && ul.querySelector('li[data-super-zoom="1"]')) return;
    runInjection(ul, video);
    return;
  }

  // Menu not (yet) present — start the deadline clock on first probe.
  if (probeStartedAt === null) probeStartedAt = Date.now();
  if (Date.now() - probeStartedAt > INJECTION_DEADLINE_MS) {
    buildFallback(video);
  }
}

// ---------- native injection ----------

function runInjection(ul, video) {
  const existing = ul.querySelectorAll('li[role="menuitemradio"]:not([data-super-zoom])');
  if (existing.length < 2) return;

  const template = existing[0];

  for (const { rate, text, insertAfterText } of INJECTED_RATES) {
    const sibling = Array.from(existing).find(
      (li) => li.querySelector('span')?.textContent === insertAfterText
    );
    if (!sibling) continue;

    const clone = template.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('data-super-zoom', '1');
    clone.dataset.rate = String(rate);
    clone.classList.remove('selected');
    clone.removeAttribute('aria-checked');
    const span = clone.querySelector('span');
    if (span) span.textContent = text;
    const icon = clone.querySelector('i.zm-icon-ok');
    if (icon) icon.style.display = 'none';
    clone.addEventListener('click', () => {
      video.playbackRate = rate;
    });

    sibling.parentNode.insertBefore(clone, sibling.nextSibling);
  }

  injected = true;

  // Wire ratechange sync exactly once per video element.
  if (!injectedWired.has(video)) {
    injectedWired.set(video, true);
    video.addEventListener('ratechange', () => syncInjectedActiveState(video));
  }

  // Reflect the current rate on freshly-injected items.
  syncInjectedActiveState(video);
}

function syncInjectedActiveState(video) {
  const ul = document.querySelector(MENU_SELECTOR);
  if (!ul) return;
  const all = ul.querySelectorAll('li[role="menuitemradio"]');
  for (const li of all) {
    let rate;
    if (li.dataset.superZoom === '1') {
      rate = parseFloat(li.dataset.rate);
    } else {
      // Native Zoom item — text is "Normal" (= 1) or e.g. "1.5x".
      const text = (li.querySelector('span')?.textContent || '').trim();
      rate = text === 'Normal' ? 1 : parseFloat(text);
    }
    const active = Number.isFinite(rate) && rate === video.playbackRate;
    // Skip no-op writes: visual state already matches.
    if (li.classList.contains('selected') === active) continue;
    li.classList.toggle('selected', active);
    if (active) li.setAttribute('aria-checked', 'true');
    else li.removeAttribute('aria-checked');
    const icon = li.querySelector('i.zm-icon-ok');
    if (icon) icon.style.display = active ? '' : 'none';
  }
}

// ---------- fallback dropdown ----------

function buildFallback(video) {
  if (document.getElementById(FALLBACK_BTN_ID)) {
    fallbackBuilt = true;
    return;
  }
  const host = document.querySelector(HOST_SELECTOR);
  if (!host) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'super-zoom-speed-wrapper';

  const btn = document.createElement('button');
  btn.id = FALLBACK_BTN_ID;
  btn.className = 'super-zoom-speed-btn';
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.textContent = formatRate(video.playbackRate);

  const menu = document.createElement('ul');
  menu.className = 'super-zoom-speed-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  // Capture (li, rate) pairs so the ratechange sync doesn't re-query the DOM
  // or re-parse dataset on every call.
  const items = [];
  for (const rate of FALLBACK_RATES) {
    const item = document.createElement('li');
    item.className = 'super-zoom-speed-menu-item';
    item.setAttribute('role', 'menuitemradio');
    item.dataset.rate = String(rate);
    item.setAttribute('aria-checked', rate === video.playbackRate ? 'true' : 'false');
    item.textContent = formatRate(rate);
    item.addEventListener('click', () => {
      video.playbackRate = rate;
      closeMenu();
    });
    menu.appendChild(item);
    items.push({ li: item, rate });
  }

  wrapper.appendChild(btn);
  wrapper.appendChild(menu);
  host.appendChild(wrapper);

  // --- toggle / outside-click / Escape ---
  let outsideHandler = null;
  let escapeHandler = null;

  function openMenu() {
    if (!menu.hidden) return;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');

    outsideHandler = (e) => {
      if (!wrapper.contains(e.target)) closeMenu();
    };
    escapeHandler = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    // Capture phase ensures we see the click before any stopPropagation.
    document.addEventListener('click', outsideHandler, true);
    document.addEventListener('keydown', escapeHandler, true);
  }

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (outsideHandler) {
      document.removeEventListener('click', outsideHandler, true);
      outsideHandler = null;
    }
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler, true);
      escapeHandler = null;
    }
  }

  btn.addEventListener('click', (e) => {
    // Stop the click from bubbling into the just-installed outside-click
    // handler, which would close the menu we just opened.
    e.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  // --- ratechange sync ---
  // Closes over `btn` and the captured `items`, so no DOM re-queries per call.
  // Skips writes when the rendered state already matches the desired state.
  function sync() {
    const rate = video.playbackRate;
    const newLabel = formatRate(rate);
    if (btn.textContent !== newLabel) btn.textContent = newLabel;
    for (const { li, rate: itemRate } of items) {
      const desired = itemRate === rate ? 'true' : 'false';
      if (li.getAttribute('aria-checked') !== desired) {
        li.setAttribute('aria-checked', desired);
      }
    }
  }

  video.addEventListener('ratechange', sync);
  sync(); // Reflect the initial rate.

  fallbackBuilt = true;
}

function formatRate(rate) {
  if (!Number.isFinite(rate)) return '1×';
  // Match the codebase's non-ASCII convention: `×` (U+00D7).
  return `${rate}×`;
}
