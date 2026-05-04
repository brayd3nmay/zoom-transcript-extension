// Inject 1.75x and 3x into Zoom's native speed menu, with a fallback
// dropdown when injection isn't possible.
//
// See contracts/speed-menu-api.md for the public contract and
// contracts/speed-menu-css.md for the fallback DOM contract.

const MENU_SELECTOR = '.vjs-speed-control .vjs-pop-menu ul.list';
const HOST_SELECTOR = '.vjs-extend-control';
const FALLBACK_BTN_ID = 'super-zoom-speed-btn';
const FORCE_FALLBACK_KEY = 'super-zoom:force-fallback';
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

// Per-video one-time setup (e.g. the `ratechange` listener for the injected
// items). The fallback wires its own `ratechange` listener inside buildFallback.
const injectedWired = new WeakMap();

export function trySpeedMenuInjection(video) {
  // Test affordance — deterministic fallback path.
  if (forceFallback()) {
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

function forceFallback() {
  try {
    return localStorage.getItem(FORCE_FALLBACK_KEY) === '1';
  } catch {
    return false;
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
  const items = ul.querySelectorAll('li[data-super-zoom="1"]');
  for (const li of items) {
    const span = li.querySelector('span');
    const rate = span ? parseFloat(span.textContent) : NaN;
    const active = Number.isFinite(rate) && rate === video.playbackRate;
    li.classList.toggle('selected', active);
    if (active) {
      li.setAttribute('aria-checked', 'true');
    } else {
      li.removeAttribute('aria-checked');
    }
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
  video.addEventListener('ratechange', () => syncFallbackActiveState(video));
  // Reflect the initial rate.
  syncFallbackActiveState(video);

  fallbackBuilt = true;
}

function syncFallbackActiveState(video) {
  const btn = document.getElementById(FALLBACK_BTN_ID);
  if (!btn) return;
  btn.textContent = formatRate(video.playbackRate);
  const items = document.querySelectorAll('.super-zoom-speed-menu-item');
  for (const li of items) {
    const rate = parseFloat(li.dataset.rate);
    li.setAttribute(
      'aria-checked',
      Number.isFinite(rate) && rate === video.playbackRate ? 'true' : 'false'
    );
  }
}

function formatRate(rate) {
  if (!Number.isFinite(rate)) return '1×';
  // Match the codebase's non-ASCII convention: `×` (U+00D7).
  return `${rate}×`;
}
