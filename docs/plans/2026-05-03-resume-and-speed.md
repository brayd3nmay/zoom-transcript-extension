# Resume, Remembered Speed, Extra Speeds, and Playback Shortcuts

**Goal:** Add per-video resume, a remembered global playback speed, the missing 1.75x and 3x speed options, and YouTube-style `j`/`k`/`l` playback shortcuts to the Super Zoom Chrome extension's Zoom recording playback page.

**Architecture:** Two new modules under `lib/` (`playback.js`, `speed-menu.js`) plus extensions to `lib/storage.js`. The video-ID extractor and the `j`/`k`/`l` keyboard handler live inline inside `content/main.js` (next to the existing `t` shortcut) — small enough that promoting them to their own modules would be ceremony for ~5 / ~25 lines respectively. Persistence stays in `localStorage` (per Zoom subdomain, no new permissions). A `MutationObserver` on `document.body` waits for the player's `<video>` element to appear; once it does, the playback module attaches save/restore listeners and the speed-menu module wires speed UI.

**Tech stack:** Vanilla ES modules bundled by `esbuild` to a single IIFE (`content.js`) loaded as a Chrome MV3 content script. No runtime libraries. The player is Video.js (Zoom's vendored copy); we interact only with the standard `HTMLVideoElement` API.

**Non-goals:**
- Per-video speed overrides (speed pref is global only).
- Cross-device sync (`chrome.storage.sync` is intentionally not used).
- A persistent history UI of watched recordings.
- Any change to the existing transcript-download or theater-mode features beyond sharing `lib/storage.js` and the toolbar area.
- Storage-quota handling beyond the existing `try/catch` pattern in `storage.js`.

## Brainstorming Handoff

### User's original ask (verbatim)
> using krponite, lets make it so that this extension stores where you are in a specific zoom video, lets also make it so that it remembers what speed you want the zoom video to be, let's also add more options for speed, right now there is no 1.75x or 3x

(Plus a follow-up addition before plan-writing: "make j go back 15 seconds on the zoom video, make k pause, make l put the video 15 seconds ahead.")

### Goal
Add per-video resume, a remembered global playback speed, 1.75x / 3x speed options, and `j`/`k`/`l` playback shortcuts to the Super Zoom Chrome extension's Zoom recording playback page.

### Architecture
Two new modules (`lib/playback.js`, `lib/speed-menu.js`) plus extensions to the existing `lib/storage.js`, all wired through `content/main.js`. The video-ID regex helper and the `j`/`k`/`l` keyboard handler live inline in `content/main.js` (next to the existing `t` handler) — small enough that promoting them to modules would be ceremony. Persistence stays in `localStorage` (per Zoom subdomain, no new permissions). A MutationObserver waits for the `<video>` element to appear; once it does, saved speed is applied, position is restored on `loadedmetadata`, and listeners persist subsequent changes.

### Components
- **`lib/storage.js` (extended)**: add speed pref + per-video position with 7-day expiry and opportunistic GC.
- **`lib/playback.js`**: locate the `<video>`; on `loadedmetadata` apply saved speed and seek to saved position (only if `< 95%` of duration, else clear); throttled `timeupdate` save every ~2s, skipping when `currentTime < 10s`; persist global speed on `ratechange`; clear saved position on `ended`. Renders the resume toast.
- **`lib/speed-menu.js`**: try to inject `1.75x` and `3x` into Zoom's existing Video.js speed menu; if injection fails, build our own dropdown next to the theater button offering `0.5 / 0.75 / 1 / 1.25 / 1.5 / 1.75 / 2 / 3`. Both paths drive `video.playbackRate` directly.
- **`content/main.js` (extended)**: extracts the video ID from `window.location` (inline regex helper), runs `gcExpiredPositions()` once on load, wires the new modules in alongside existing theater/download injection, and adds `j`/`k`/`l` to the existing keydown handler.
- **`content.css` (extended)**: small "Resumed at MM:SS" toast (top-right, ~3s, click-to-dismiss) and styling for the fallback speed dropdown.

### Decisions reached
- Resume behavior: silent auto-seek with a small "Resumed at MM:SS" toast.
- Speed preference scope: a single global preference applied to every Zoom recording.
- Speed UI: try to inject into Zoom's existing speed menu; fall back to our own Super Zoom dropdown if injection fails (one menu shown, not both).
- End-of-video handling: skip restore (and clear the saved position) if `currentTime ≥ 95%` of duration.
- Don't-save floor: skip writes while `currentTime < 10s`.
- Save throttle: persist position roughly every 2 seconds while playing.
- Position storage shape: `{ time, savedAt }` with read-time expiry; entries older than 7 days are deleted on access and via opportunistic GC at load time.
- Persistence layer: continue using `localStorage`, no new extension permissions.
- Playback shortcuts: `j` = seek backward 15s, `k` = toggle play/pause (YouTube convention), `l` = seek forward 15s. Same input-field guard as `t`. No modifier keys.

### Alternatives rejected
- Resume prompt pill ("Resume at 12:34?"): rejected in favor of silent auto-seek.
- Per-video or "global with per-video override" speed: rejected — global only is simpler and matches the user's mental model.
- Pure injection into Zoom's menu (no fallback): rejected — too fragile to Zoom DOM changes.
- Pure custom dropdown (ignore Zoom's menu): rejected — native injection feels better when it works.
- Always-restore regardless of finish state: rejected — finishing a video should reset.
- Indefinite position retention: rejected — 7-day expiry caps storage growth.
- `k` as strict pause (no resume): rejected — toggle matches YouTube and is one fewer key to remember.

### Non-goals (explicitly out of scope)
- Per-video speed overrides.
- Cross-device sync (`chrome.storage.sync`).
- A persistent history UI of watched recordings.
- Any change to the existing transcript-download or theater-mode features beyond sharing the storage module and toolbar area.

## Parallelization Map

### Groups

- **Group 1 (parallel):** `lib/storage.js` (extended), `content.css` (extended)
- **Group 2 (depends on Group 1 contracts):** `lib/playback.js`, `lib/speed-menu.js`
- **Group 3 (depends on Group 2 contracts):** `content/main.js` (extended)

### Ownership

| Component | Owner |
|---|---|
| `lib/storage.js` (extended) | storage |
| `content.css` (extended) | styling |
| `lib/playback.js` | playback |
| `lib/speed-menu.js` | speed-menu |
| `content/main.js` (extended) | wiring |

### Inter-group contracts

- **storage → playback:** `storage` publishes `contracts/storage-api.md` documenting the exact signatures and return semantics of `getSpeedPref()`, `setSpeedPref(rate)`, `getPosition(id)`, `setPosition(id, time)`, `clearPosition(id)`, and `gcExpiredPositions()` (including null-on-failure / no-throw guarantees and the 7-day TTL).
- **styling → playback:** `styling` publishes `contracts/resume-toast-css.md` naming the `super-zoom-resume-toast` id/class, the optional `super-zoom-resume-toast--fading` modifier, and the JS contract for adding/removing those.
- **styling → speed-menu:** `styling` publishes `contracts/speed-menu-css.md` naming the fallback DOM contract (`super-zoom-speed-wrapper`, `super-zoom-speed-btn` id/class, `super-zoom-speed-menu`, `super-zoom-speed-menu-item` with `data-rate` and `aria-checked`).
- **playback → wiring:** `playback` publishes `contracts/playback-api.md` documenting `attachPlayback(video, videoId)` — idempotency, side effects, no `detach()`.
- **speed-menu → wiring:** `speed-menu` publishes `contracts/speed-menu-api.md` documenting `trySpeedMenuInjection(video)` — safe to call on every observer tick, idempotent, handles both injection and fallback internally.

### Anti-parallelization warnings

- `content/main.js` is a single-component Group 3 — genuine integration seam, can't parallelize further. Acceptable.
- `content.css` has no JS dependencies but two JS consumers (`playback`, `speed-menu`). Styling must publish its class/id/structural contracts early (Group 1) so Group 2 owners don't have to renegotiate mid-flight.
- Only `wiring` runs `npm run build:content` at the end, but a stale `content.js` will mislead any teammate doing manual verification of their own component before integration.

---

## Component: lib/storage.js (extended)

**Goal:** Add speed-preference and per-video position persistence (with 7-day expiry) to the existing storage module without disturbing the theater-mode pref it already holds.

**Public interface / contract:**
- Existing exports remain unchanged: `getTheaterPref()`, `setTheaterPref(value)`.
- New exports:
  - `getSpeedPref(): number | null` — returns the saved playback rate or `null` if none. Parses with `parseFloat`; returns `null` if the value is missing, non-finite, ≤ 0, or > 16 (sanity bound — Chrome ignores rates outside roughly 0.0625–16).
  - `setSpeedPref(rate: number): void` — writes the rate as a string. Silently no-ops if `rate` is non-finite or ≤ 0.
  - `getPosition(id: string): number | null` — reads `super-zoom:pos:<id>`, parses JSON `{ time, savedAt }`. Returns `null` if missing, malformed, `time` not a finite non-negative number, or `Date.now() - savedAt > 7 days`. **Side effect:** when the entry is malformed or expired, `removeItem` it before returning `null` (read-time GC).
  - `setPosition(id: string, time: number): void` — writes `JSON.stringify({ time, savedAt: Date.now() })`. Silently no-ops if `id` is empty/non-string or `time` is non-finite/negative.
  - `clearPosition(id: string): void` — `removeItem` for `super-zoom:pos:<id>`.
  - `gcExpiredPositions(): void` — iterates `localStorage` keys; for any starting with `super-zoom:pos:`, if `Date.now() - savedAt > 7 days` (or the entry is malformed JSON), `removeItem` it.
- Side effects: `localStorage` reads/writes only. All entry points wrap access in `try/catch` and silently no-op on failure (matches existing module behavior — private mode / quota exceeded must not throw).
- Error modes: never throw to callers.

**Touches files:** `lib/storage.js`

**Dependencies:** None (browser `localStorage` only).

**Implementation notes:**
- Add module-level constants `SPEED_KEY = 'super-zoom:speed'`, `POSITION_KEY_PREFIX = 'super-zoom:pos:'`, `POSITION_TTL_MS = 7 * 24 * 60 * 60 * 1000`.
- Keep the existing `KEY` (theater) constant; do not rename it — `content.js` references it indirectly through the existing exports and the popup may also depend on it via this module.
- For `gcExpiredPositions`, snapshot keys first (`Object.keys(localStorage)`) before deleting — mutating during a `for (i; i < length; i++)` iteration over `localStorage.key(i)` is unreliable across browsers.
- Validate `JSON.parse` results with an explicit object guard *and* property type checks: `obj && typeof obj === 'object' && !Array.isArray(obj) && typeof obj.time === 'number' && Number.isFinite(obj.time) && obj.time >= 0 && typeof obj.savedAt === 'number' && Number.isFinite(obj.savedAt)`. The object-guard prefix matters because `JSON.parse('null')` returns `null` and `JSON.parse('[1,2]')` returns an array — both would throw on naive property access. Treat any failure as "missing" and GC the key.
- Use `Date.now()` directly — no need to inject a clock for this scope.

**Verification:**
- Build succeeds: `npm run build:content` exits 0 and produces a non-empty `content.js`.
- Smoke check in DevTools console after loading the extension on a Zoom recording page:
  - `localStorage.setItem('super-zoom:pos:test', JSON.stringify({ time: 60, savedAt: Date.now() - 8*24*60*60*1000 }))` then reload — confirm the key is gone (GC'd as expired).
  - Set `super-zoom:speed` to `1.5`, reload — confirm `getSpeedPref()` returns `1.5` (probe via the playback module's behavior; see playback verification).
- Theater pref still round-trips (regression check).

**Risk flags:**
- `localStorage` quota is per-origin and shared with Zoom's own usage. Our footprint is tiny (one entry per video, ~80 bytes), but `setItem` can throw — keep the existing `try/catch`.
- `JSON.parse` on attacker-controlled values is safe (no eval), but malformed entries from older versions of the extension must not crash startup — `gcExpiredPositions` runs first thing on load.

---

## Component: lib/playback.js

**Goal:** When a `<video>` element is present on the page, restore the user's saved speed and position, then keep both up to date as the user watches and adjusts.

**Public interface / contract:**
- `attachPlayback(video: HTMLVideoElement, videoId: string): void`
  - Idempotent per video element: a `WeakMap<HTMLVideoElement, true>` guard makes the second call a no-op.
  - On call: applies `getSpeedPref()` to `video.playbackRate` immediately if the pref is set (so even if `loadedmetadata` already fired, speed lands quickly).
  - On `loadedmetadata` (or immediately if `video.readyState >= 1` and `duration` is finite): looks up `getPosition(videoId)`. If the saved time is `>= duration * 0.95`, calls `clearPosition(videoId)` and returns. Otherwise sets `video.currentTime = saved` and shows the "Resumed at MM:SS" toast.
  - On `timeupdate`: throttled — at most one write per `SAVE_THROTTLE_MS` (2000). Skips the write entirely when `video.currentTime < MIN_SAVE_TIME_S` (10) or when `video.paused` (defensive — `timeupdate` typically only fires while playing, but let's not save while scrubbing-paused).
  - On `ratechange`: persists `video.playbackRate` via `setSpeedPref`. No throttle — `ratechange` is user-driven, not high-frequency.
  - On `ended`: `clearPosition(videoId)`.
  - No `detach()` — there's no caller for it. Listeners die with the `<video>` element if Zoom ever swaps it; the WeakMap idempotency guard prevents double-attach when `tryAttachVideo` re-runs.
- The toast is rendered into `document.body` as a single element with id `super-zoom-resume-toast`. Class: `super-zoom-resume-toast`. Auto-removes after 3000 ms; clicking it removes it immediately. **No other module touches this id/class.**

**Touches files:** `lib/playback.js` (new)

**Dependencies:**
- `lib/storage.js` — `getSpeedPref`, `setSpeedPref`, `getPosition`, `setPosition`, `clearPosition`.

**Implementation notes:**
- Use `WeakMap<HTMLVideoElement, true>` to enforce idempotency. First call sets the entry and proceeds; subsequent calls early-return.
- Throttle pattern: closure-local `lastSaveAt = 0`; on `timeupdate`, if `now - lastSaveAt >= SAVE_THROTTLE_MS`, call `setPosition(videoId, video.currentTime)` and update `lastSaveAt`. Don't use `setTimeout` — straight time-comparison gating is simpler and has no stranded timers.
- Speed application order: read pref once at attach time. If the video already fired `loadedmetadata` (`video.readyState >= 1`), apply the seek immediately. Otherwise listen for `loadedmetadata` with `{ once: true }`.
- Echo-write avoidance on `ratechange`: cache `lastAppliedRate` in the closure (set to whatever we wrote when applying the pref). On `ratechange`, if `video.playbackRate === lastAppliedRate`, skip the persist; otherwise call `setSpeedPref(video.playbackRate)` and update `lastAppliedRate`. (Closure-local cache rather than re-reading `localStorage` on every `ratechange`.)
- Toast contents are written via `textContent` only (never `innerHTML`) — see security advisory.
- For the "Resumed at" toast: format as `MM:SS` (or `HH:MM:SS` if the saved time is ≥ 3600 s). Helper inline in this module — no date lib needed.
- ARIA: toast has `role="status"` so screen readers announce it; no `aria-live="assertive"` (would be annoying).

**Verification:**
- Build succeeds.
- Manual on a real Zoom recording:
  - Play to ~1:00, reload → resumes at ~1:00, toast briefly appears.
  - Play to within ~5 s of the end, let it `ended`, reload → starts at 0, no toast.
  - Click an item in the speed menu (1.5x), reload → video plays at 1.5x.
  - Change speed via the speed menu twice quickly → both writes land (no throttle on `ratechange`).
  - **No-write-while-paused probe:** record `JSON.parse(localStorage.getItem('super-zoom:pos:<id>')).savedAt`, pause for 30 s, re-read — `savedAt` is unchanged.

**Risk flags:**
- Setting `currentTime` before `loadedmetadata` is a no-op in some browsers — guard with the `readyState` check.
- If Zoom swaps the `<video>` element (unobserved so far), the old listeners die with the removed node and the WeakMap entry becomes unreachable — the new element gets a fresh attach via `tryAttachVideo`. No leak.

---

## Component: lib/speed-menu.js

**Goal:** Make 1.75x and 3x reachable from the player UI, preferring native-looking integration with Zoom's own speed menu and falling back to a Super Zoom-owned dropdown when integration isn't possible.

**Public interface / contract:**
- `attachSpeedMenu(video: HTMLVideoElement): void`
  - Idempotent per video element (`WeakMap<HTMLVideoElement, true>` guard, same as `playback.js`).
  - Tries the **injection path** first: locates Zoom's speed menu (concrete selectors below) and inserts two `<li>` items — `1.75x` between `1.5x` and `2.0x`, and `3x` after `2.0x` — by cloning an existing menu item, setting its `<span>` text via `textContent`, and attaching our own click handler that sets `video.playbackRate`. Marked with `data-super-zoom="1"` so we can detect and skip re-injection on Vue re-renders.
  - If injection isn't possible within `INJECTION_DEADLINE_MS` (5000) — measured from the first probe attempt — builds the **fallback dropdown** alongside the theater button inside `.vjs-extend-control`. Dropdown items: `0.75 / 1 / 1.25 / 1.5 / 1.75 / 2 / 3` (matches Zoom's existing set + our two additions; we deliberately do not add `0.5x` since Zoom's own menu omits it). Selecting an item sets `video.playbackRate` and closes the menu.
  - On `ratechange`: keeps our injected items' `selected` class and `<i>` checkmark `display` in sync with `video.playbackRate` (so flipping speed from any source updates the visible UI). For the fallback, also updates the button label and the active item's `aria-checked`.
  - Single path is active per session — once injection succeeds, the fallback is never built; once the fallback is built (deadline expired), injection probing stops.
  - No `detach()` — same reasoning as `playback.js`: nothing calls it.

**Touches files:** `lib/speed-menu.js` (new), `content.css` (styles for the fallback dropdown — see CSS component).

**Dependencies:** None on other lib modules. Reads/writes `video.playbackRate` only.

**Implementation notes:**

**Concrete DOM contract** (verified live against an `osu.zoom.us` recording during planning):

```
.vjs-extend-control
  > .vjs-speed-control
    > button.vjs-control                        // "Speed" button (opens menu)
    > .vjs-pop-menu                             // popover container
      > ul.list[role="menu"][data-v-b59f94be]   // the menu UL (data-v-* is Vue scoped CSS)
        > li[role="menuitemradio"][data-v-b59f94be][id="vjs-pop-menu-item-N"]
            class="" or class="selected" (active item)
            style="padding-left: 30px;" (inline)
          > i.zm-icon-ok[data-v-b59f94be][style="display: none;"]   // checkmark, shown only when selected
          > span[data-v-b59f94be]                                    // visible label, e.g. "1.5x" / "Normal" / "2.0x"
```

Existing items, in order: `0.75x`, `Normal` (= 1×), `1.25x`, `1.5x`, `2.0x`. The active item has `class="selected"` and `aria-checked="true"`.

Confirmed behavior: clicking an existing item synchronously sets `video.playbackRate` to the parsed numeric value. Vue's own `selected`-class refresh runs on the next render tick (still showed "Normal" immediately after clicking `1.5x` — verified in DevTools).

**Injection algorithm:**
1. Probe for `.vjs-speed-control .vjs-pop-menu ul.list`. Bail if absent (will retry next observer tick).
2. Find the existing items: `ul.querySelectorAll('li[role="menuitemradio"]:not([data-super-zoom])')`. Bail unless ≥ 2 are present (sanity check).
3. Skip if `ul.querySelector('li[data-super-zoom="1"]')` exists — already injected.
4. For each new rate in `[{ rate: 1.75, text: '1.75x', insertAfterText: '1.5x' }, { rate: 3, text: '3x', insertAfterText: '2.0x' }]`:
   a. Pick a template `<li>` (any existing item — `cloneNode(true)` will preserve the Vue scoped attribute and inline styles).
   b. Clone deep, then: remove the cloned `id` attribute (it would collide with the original); set `data-super-zoom="1"`; replace the `<span>` text via `textContent = text`; ensure the `<i>` icon style is `display: none` (will be toggled by `ratechange` handler).
   c. Find the sibling whose span text equals `insertAfterText`; insert the clone after it via `parentNode.insertBefore(clone, sibling.nextSibling)`.
   d. Attach a click listener: `e => { video.playbackRate = rate; }` — no `stopPropagation` needed (cloned `<li>` doesn't carry Vue's listener; Vue's own delegation keys off Vue-internal state, not DOM clicks).
5. Set module-state `injected = true`, stop probing.

**Probe loop:** add a `trySpeedMenuInjection(video)` function alongside `tryInjectDownloadButton` / `tryInjectTheaterButton` in `content/main.js`'s `injectAll()`. Speed-menu module exposes this as a top-level export so `content/main.js` can call it on every observer tick. Module state tracks `injected` (bool) and `probeStartedAt` (`performance.now()` of first probe). Once `injected === true`, the function early-returns. Once `performance.now() - probeStartedAt > INJECTION_DEADLINE_MS` and not injected, the function calls `buildFallback(video)` (also idempotent via `document.getElementById('super-zoom-speed-btn')`).

**Vue re-render robustness:** if Vue diffs and removes our injected `<li>`s on a re-render, `injected` stays `true` but `ul.querySelector('li[data-super-zoom="1"]')` returns `null`. Adjust the early-return: `if (injected && ul.querySelector('li[data-super-zoom="1"]')) return;` — if our markers vanished, re-run the injection algorithm. (`injected` becomes "have we attempted injection successfully at least once" rather than "is there nothing to do.")

**Active-state sync (`ratechange` handler):**
- Walk `ul.querySelectorAll('li[data-super-zoom="1"]')`. For each, parse the span text → numeric rate. If `video.playbackRate === rate`, add `class="selected"`, set the inner `<i>` `style.display = ''`. Otherwise remove the `selected` class and set `style.display = 'none'`.
- Don't touch Zoom's own (non-`data-super-zoom`) items — Vue manages them. Acceptable side effect: when our `1.75x` is active, Zoom's own items will all show as unselected (correct); when one of Zoom's items is active, our items show as unselected (correct).

**Fallback UI structure** (only built if injection deadline expires):
- Wrapper `<div class="super-zoom-speed-wrapper">` for relative positioning of the menu.
- Button `<button id="super-zoom-speed-btn" class="super-zoom-speed-btn" type="button">` whose label is the current rate, set via `textContent` (never `innerHTML`).
- Menu `<ul class="super-zoom-speed-menu" hidden role="menu">` with one `<li class="super-zoom-speed-menu-item" role="menuitemradio" data-rate="0.75">…</li>` per rate in `[0.75, 1, 1.25, 1.5, 1.75, 2, 3]`. Active item: `aria-checked="true"`.
- Toggle on button click. Close on outside click (`document.addEventListener('click', closeIfOutside, true)` while open) and on `Escape`.
- Append the wrapper into `.vjs-extend-control` (same host as the theater button).

**Rate label format:** `0.75×`, `1×`, `1.75×`, `3×` for the fallback button label and menu items (multiplication sign `×`, U+00D7) — matches the codebase's non-ASCII convention (e.g. `—` em dash in `markdown.js`). For the **injected** items, use Zoom's format (`1.75x`, `3x` with lowercase `x`) so they look native.

**Verification:**
- Build succeeds.
- Manual on a real Zoom recording:
  - Open the speed menu — `1.75x` (between `1.5x` and `2.0x`) and `3x` (after `2.0x`) are present and clickable.
  - Click `1.75x` → `video.playbackRate === 1.75`, `<i>` checkmark shows on our `1.75x` item.
  - Click `3x` → `video.playbackRate === 3`, checkmark moves to `3x`.
  - Click an existing Zoom item (e.g. `1.5x`) → our items lose their checkmark; Zoom's own selected state takes over on next Vue tick.
  - Reload page → speed pref persists (cross-component check with `playback.js`).
- **Fallback exercised by deterministic toggle:** in DevTools console, run `window.__superZoomForceFallback = true` *before* extension load (e.g. add it via a userscript or set in console then reload with the flag preserved via `localStorage`). The module honors this flag and skips injection. Confirm the fallback dropdown appears next to the theater button, opens above it, items are clickable, outside-click and Escape close it. (See "Test affordance" implementation note below.)
- DevTools storage check: after selecting `3x`, `localStorage.getItem('super-zoom:speed') === '3'`.

**Test affordance:** the module honors a `localStorage` flag `super-zoom:force-fallback === '1'` to deterministically skip injection (for testing the fallback path without DOM surgery). Add this guard at the top of `trySpeedMenuInjection`. It's a single conditional, costs nothing, and replaces the harder-to-reproduce "remove `.vjs-speed-control` from the DOM" approach.

**Risk flags:**
- Injection selectors are concrete but specific to Zoom's current build. If Zoom rewrites the speed control (e.g., switches to standard Video.js `.vjs-playback-rate`), the fallback path keeps the feature working.
- If Vue re-renders the menu UL contents on every open/close, our injected items might be wiped on each open. The probe-on-every-mutation + `ul.querySelector('li[data-super-zoom]')` re-injection check handles this.
- The fallback dropdown lives in `.vjs-extend-control` and may shift other sibling controls slightly. Visually verify with the existing theater button still aligned.

---

## Component: content/main.js (extended)

**Goal:** Wire the two new modules into the existing content-script bootstrap, inline the small video-ID helper and the `j`/`k`/`l` keyboard shortcuts, and run the position-store GC on load — without disturbing transcript-download or theater-mode behavior.

**Public interface / contract:** No exported interface — this is the entry file. Must remain compatible with `esbuild --bundle --format=iife` (no top-level `await`).

**Touches files:** `content/main.js`

**Dependencies:**
- `lib/storage.js` — adds `gcExpiredPositions` to the existing imports.
- `lib/playback.js` — new import: `attachPlayback`.
- `lib/speed-menu.js` — new import: `trySpeedMenuInjection` (named so it slots into `injectAll()` with the existing `tryInject*` functions).

**Implementation notes:**

**Inline `extractVideoId` helper** (no separate module — too small):
```js
function extractVideoId(loc) {
  try {
    const m = new URL(loc.href ?? loc).pathname.match(/^\/rec\/(?:play|share)\/([^\/?#]+)/);
    if (!m) return null;
    const id = m[1].trim();
    if (!id || id.length > 256) return null;  // reject empty / abnormally long IDs (security advisory: cap localStorage key suffix)
    return id;
  } catch {
    return null;
  }
}
```

Sample expected results (verify in console after build):
- `extractVideoId({ href: 'https://us02web.zoom.us/rec/play/abc123def?pwd=x' })` → `'abc123def'`
- `extractVideoId({ href: 'https://us02web.zoom.us/rec/share/xyz_456/' })` → `'xyz_456'`
- `extractVideoId({ href: 'https://zoom.us/some/other/path' })` → `null`
- `extractVideoId({ href: 'not a url' })` → `null`

**Module-eval-time wiring** (just after the existing `if (getTheaterPref()) enableTheater();` line):
- Call `gcExpiredPositions()` once.
- `const videoId = extractVideoId(window.location);` — module-level `const`.

**`tryAttachVideo()`** (added alongside `tryInjectDownloadButton` / `tryInjectTheaterButton`):
- Returns early if `!videoId` (URL didn't match the recording pattern — nothing to attach).
- `const video = document.querySelector('video');` — return early if `!video`.
- Calls `attachPlayback(video, videoId)` and `trySpeedMenuInjection(video)`. Both are idempotent internally; `tryAttachVideo` itself doesn't need an outer guard.
- Add `tryAttachVideo()` to `injectAll()`.

**Inline `j`/`k`/`l` keyboard handler** — extend the existing `t`-handler `keydown` listener (don't add a second listener; one switch is cleaner):

```js
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (!['t', 'j', 'k', 'l'].includes(key)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;

  if (key === 't') { e.preventDefault(); toggleAndPersist(); return; }

  // j/k/l need the video element
  const video = document.querySelector('video');
  if (!video) return;
  if (key === 'j') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 15); return; }
  if (key === 'l') { e.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 15); return; }
  if (key === 'k') { e.preventDefault(); (video.paused ? video.play() : video.pause())?.catch?.(() => {}); return; }
}, true);  // capture phase — beats Video.js / Zoom's own handlers
```

Notes:
- The existing handler at the bottom of `content/main.js` already uses capture phase for `t`. Replace it with the unified switch above. The `t` branch behavior (`toggleAndPersist`) is preserved exactly.
- The two listeners (`t` and `j/k/l`) are intentionally unified into one — saves a redundant `keydown` traversal and keeps all keyboard shortcuts in one readable block.
- `e.key.toLowerCase()` (not `e.code`) — works on non-QWERTY layouts.
- `?.catch?.(() => {})` swallows the autoplay-policy rejection on `play()`. The optional-chains are defensive: `video.pause()` returns `undefined` (no `.catch`).

**Verification:**
- Build succeeds: `npm run build:content` produces `content.js` with the new imports inlined.
- Reload the extension, open a Zoom recording, open DevTools console — no errors logged.
- Existing features still work: download transcript button, theater toggle (`t` shortcut still toggles theater).
- Press `j` while playing → seeks back 15 s (or 0 near start).
- Press `l` → seeks forward 15 s.
- Press `k` → pauses; press `k` again → plays.
- Click into a `<input>` (e.g. transcript search) and press `k` → no pause (input-field guard).
- Press Cmd+L → address bar focuses (modifier guard).

**Risk flags:**
- `content.js` is the bundled artifact and is committed (per `README.md`: "The repo ships with a pre-built `content.js`"). After every source change run `npm run build:content` and stage the regenerated `content.js` — otherwise the loaded extension runs the old code.
- Unifying the keydown handler is a deliberate edit to existing code. The `t` branch must produce the same `toggleAndPersist()` call with the same input-field guard — visually diff before committing.

---

## Component: content.css (extended)

**Goal:** Style the resume toast and the fallback speed dropdown to match the existing Super Zoom button styling.

**Public interface / contract:** Plain CSS appended to `content.css`. No imports anywhere else need changing.

**Touches files:** `content.css`

**Dependencies:** None.

**Implementation notes:**
- Resume toast:
  - Class `.super-zoom-resume-toast`. Position fixed, top-right of viewport (`top: 16px; right: 16px`), `z-index: 2147483647` (max — sits above Zoom's own modals).
  - Background `rgba(0, 0, 0, 0.85)`, color `#fff`, padding `8px 12px`, border-radius `4px`, font matches the download button.
  - `cursor: pointer` (it's click-to-dismiss).
  - Optional fade-out via `opacity` transition over 200 ms — toggled by JS adding a `.super-zoom-resume-toast--fading` class before removal.
- Fallback speed dropdown:
  - `.super-zoom-speed-wrapper` — `position: relative`, `display: inline-flex`, sits inside `.vjs-extend-control` next to the theater button.
  - `.super-zoom-speed-btn` — same width/height/styling as `.super-zoom-theater-btn` (32×32, transparent background, color `#87b8ff`, hover `#2D8CFF`). Text label is the current rate (e.g. `1.5×`); use `font-size: 12px; font-weight: 600` to fit.
  - `.super-zoom-speed-menu` — `position: absolute`, anchored above the button (`bottom: 100%; right: 0`), background `#1f2937` (dark to match Video.js chrome), border-radius `4px`, padding `4px 0`, list-style none, `min-width: 64px`, `box-shadow: 0 4px 12px rgba(0,0,0,0.4)`.
  - `.super-zoom-speed-menu[hidden]` — uses the native `hidden` attribute, no extra CSS needed.
  - `.super-zoom-speed-menu-item` — `padding: 6px 12px`, `cursor: pointer`, `color: #fff`. Hover background `rgba(255,255,255,0.1)`. (Seven items: `0.75 / 1 / 1.25 / 1.5 / 1.75 / 2 / 3` — matches Zoom's own set + our two additions; no `0.5x`.)
  - `.super-zoom-speed-menu-item[aria-checked="true"]::before` — `content: "✓ "; color: #2D8CFF` (visible check on the active rate).

**Verification:**
- Build is unaffected by CSS changes — visually verify in the browser.
- Resume toast appears top-right, fades out, click dismisses immediately.
- Fallback dropdown (when triggered for testing) sits next to the theater button, opens above it, items are clickable.

**Risk flags:** `z-index: 2147483647` on the toast is intentional but worth flagging — if Zoom's own modals collide with it, the toast wins by design (it auto-dismisses in 3 s).

---

## Cross-cutting verification

After all components land:

1. **Build:** `npm run build:content` exits 0; `content.js` size grows by a few KB but stays under 50 KB (current is ~10 KB; a 5× growth ceiling catches stray dependencies).
2. **Extension reload:** load the unpacked extension in `chrome://extensions`, reload it.
3. **Manual smoke on a real Zoom recording** (`*.zoom.us/rec/play/...`):
   - Existing features still work: download transcript button, theater toggle, `t` shortcut.
   - New features:
     - Play to ~1:00, reload → resumes at ~1:00 with toast.
     - Play near end (>95%), reload → starts at 0.
     - Set speed to 1.5x, reload a different recording → loads at 1.5x.
     - Speed menu shows 1.75x and 3x (or fallback dropdown does).
     - `j` / `k` / `l` work; modifier keys are not hijacked; typing in the transcript search box doesn't trigger them.
4. **DevTools storage check:** `super-zoom:speed` and `super-zoom:pos:<id>` keys are present and well-formed; entries older than 7 days are GC'd on the next load.
5. **Console:** no errors from `[super-zoom]` or unhandled exceptions during the flows above.
