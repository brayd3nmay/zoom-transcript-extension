# Speed-menu API contract

Owner: **speed-menu** teammate. Consumer: **wiring** (`content/main.js`).

Module: `lib/speed-menu.js`. Single named export.

## Signature

```js
export function trySpeedMenuInjection(video: HTMLVideoElement): void
```

That's the entire API surface. There is no `attach`/`detach`, no class, no
options object. The function is the seam between the observer loop in
`content/main.js` and everything speed-menu does.

## Calling convention

Wiring must call `trySpeedMenuInjection(video)` from inside its `injectAll()`
tick (the same loop that calls `tryInjectDownloadButton` /
`tryInjectTheaterButton`). The function is **safe to call on every observer
tick** — it has internal idempotency guards and bails fast on the no-op path.

```js
function tryAttachVideo() {
  if (!videoId) return;
  const video = document.querySelector('video');
  if (!video) return;
  attachPlayback(video, videoId);
  trySpeedMenuInjection(video);
}
```

The function ignores duplicate `video` references via a per-element WeakMap
(for one-time setup such as the `ratechange` listener) AND a marker check on
the DOM (`li[data-super-zoom="1"]` for injection, `#super-zoom-speed-btn` for
fallback) so a fresh page load with the same video element still gets a clean
attach.

## Behavior (what the function does internally)

The function handles **both** the native-injection path AND the fallback
dropdown internally. Wiring does NOT need to choose between them — wiring just
calls this one function on every tick.

1. **Test affordance (single conditional at top):** if
   `localStorage.getItem('super-zoom:force-fallback') === '1'`, skip injection
   and go straight to building the fallback dropdown (idempotent). Used to
   exercise the fallback path deterministically without DOM surgery.
2. **Idempotency early-return:** if injection has already happened
   (`injected === true`) AND our `<li data-super-zoom="1">` markers are still
   present in Zoom's menu, return immediately.
3. **Re-injection robustness:** if `injected === true` but the markers are
   missing (Vue diffed them out on a re-render), the function re-runs the
   injection algorithm so the items reappear.
4. **Injection probe:** locate `.vjs-speed-control .vjs-pop-menu ul.list`. If
   absent, record the first probe time (`probeStartedAt`) and bail — the next
   observer tick retries.
5. **Injection algorithm** (when the menu is found): clone an existing
   `<li role="menuitemradio">`, set the cloned `<span>` text via `textContent`
   (e.g. `'1.75x'`, `'3x'`), remove the cloned `id` attribute (would otherwise
   collide), set `data-super-zoom="1"`, and insert it after the appropriate
   sibling (`1.5x` for `1.75x`; `2.0x` for `3x`). Attach a click listener that
   sets `video.playbackRate = rate`.
6. **Deadline → fallback:** if the menu can't be found within
   `INJECTION_DEADLINE_MS` (5000 ms), the function builds the fallback
   dropdown (`super-zoom-speed-wrapper` etc., per
   `contracts/speed-menu-css.md`) inside `.vjs-extend-control` and stops
   probing. The fallback is also built when the test affordance flag is set.
7. **`ratechange` sync:** on the first tick that wires up the menu (injection
   or fallback), the function attaches a `ratechange` listener on the video.
   The listener keeps the active-state UI (selected class + checkmark for
   injected items; `aria-checked` + button label for fallback) in sync.
8. **Single path per session:** once injection succeeds, the fallback is never
   built. Once the fallback is built (deadline expired or forced via flag),
   the injection probe stops. No double menus.

## Side effects

Calling `trySpeedMenuInjection(video)`:

- May insert cloned `<li data-super-zoom="1">` items into Zoom's
  `.vjs-speed-control .vjs-pop-menu ul.list` (between `1.5x` and `2.0x`, and
  after `2.0x`).
- May insert `<div class="super-zoom-speed-wrapper">…</div>` (containing
  `#super-zoom-speed-btn` and `.super-zoom-speed-menu`) into
  `.vjs-extend-control` if the deadline expires or the force-fallback flag is
  set.
- May attach exactly one `ratechange` listener per video element (guarded by
  a per-element WeakMap).
- May attach `click` / `keydown` listeners on `document` while the fallback
  menu is open (capture phase, removed when the menu closes).
- Reads/writes `video.playbackRate` (writes only on user item-click).
- Reads `localStorage.getItem('super-zoom:force-fallback')`. Does NOT write
  `localStorage` directly — speed persistence is `playback.js`'s job (via the
  shared `ratechange` event on the video).

## Guarantees

- **No throw:** all DOM lookups and listener attachments are wrapped where
  failure would otherwise propagate. Callers can invoke the function on every
  tick without try/catch.
- **No detach:** there is intentionally no teardown function. Listeners die
  with the `<video>` element if Zoom ever swaps it; the WeakMap entry becomes
  unreachable.
- **Idempotent:** repeated calls with the same `video` are a no-op once
  injection or fallback has settled.
- **Single menu shown:** native-injection and fallback are mutually
  exclusive — at most one is active per session.

## Constants (informational)

- `INJECTION_DEADLINE_MS = 5000` — milliseconds from the first probe attempt
  before the fallback is built.
- Rates injected into Zoom's menu: `1.75` (label `1.75x`) and `3` (label
  `3x`). Lowercase `x` matches Zoom's native style.
- Rates in the fallback dropdown: `0.75, 1, 1.25, 1.5, 1.75, 2, 3` — see
  `contracts/speed-menu-css.md` for the fixed order and the deliberate
  omission of `0.5`.

## Anti-contract

- Wiring must NOT call `trySpeedMenuInjection` with a stale or detached
  `video` element. Always re-`querySelector('video')` per tick.
- Wiring must NOT attempt to set up its own speed UI — this module owns it.
- Wiring must NOT remove `<li data-super-zoom="1">` items or the
  `super-zoom-speed-wrapper` element; the module manages their lifecycle.
