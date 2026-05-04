# Playback API contract

Owner: `playback`
Consumer: `wiring`

The `playback` module owns saved-position restore/persist and saved-speed
restore/persist for a single Zoom recording's `<video>` element. It is wired in
by `content/main.js` once both a `videoId` (extracted from the URL) and a
`<video>` element are available.

Module: `lib/playback.js`. Pure ESM. No side effects at import time.

## Exports

### `attachPlayback(video: HTMLVideoElement, videoId: string): void`

Attach playback save/restore behavior to `video`. Idempotent per element.

**Arguments**

| Name      | Type                | Notes                                                                                  |
|-----------|---------------------|----------------------------------------------------------------------------------------|
| `video`   | `HTMLVideoElement`  | The Zoom player's `<video>` element. Required.                                         |
| `videoId` | `string`            | Opaque, non-empty video identifier. Used as the `<id>` segment of `super-zoom:pos:<id>`. |

**Return value**: none (`void`).

**Idempotency**: A module-private `WeakMap<HTMLVideoElement, true>` records
which elements have already been attached. The second `attachPlayback(sameVideo, …)`
call is a no-op (does not add duplicate listeners, does not re-restore position,
does not re-show the toast). Calling with a *different* `<video>` element after
Zoom swaps the player attaches fresh listeners — old listeners die with the
removed element and the WeakMap entry becomes unreachable (no leak, no
detach needed).

**Bad input handling**: If `video` is falsy or not an `HTMLVideoElement`, or if
`videoId` is not a non-empty string, the function returns immediately without
side effects. It does not throw.

## Side effects

`attachPlayback` may, over the lifetime of the page:

1. **Set `video.playbackRate`** once at attach time, to the value returned by
   `getSpeedPref()` (skipped if `getSpeedPref()` returns `null`).
2. **Seek `video.currentTime`** once, to the value returned by
   `getPosition(videoId)`, *only if* the saved time is `< duration * 0.95`.
   The seek is deferred to `loadedmetadata` if `video.readyState < 1` or
   `!Number.isFinite(video.duration)` at attach time.
3. **Insert a single `<div id="super-zoom-resume-toast">`** into
   `document.body` per the resume-toast CSS contract — only when a seek
   actually happens (step 2). Any pre-existing toast is removed first. The
   toast auto-removes after ~3000 ms (with a `--fading` modifier added at
   ~2800 ms to drive the CSS opacity transition) or immediately on click.
4. **Register listeners on `video`**:
   - `loadedmetadata` (with `{ once: true }`) — only registered if metadata
     wasn't already loaded at attach time.
   - `timeupdate` — throttled write to `setPosition(videoId, video.currentTime)`,
     at most one write per 2000 ms. Skipped while
     `video.currentTime < 10` or `video.paused`.
   - `ratechange` — calls `setSpeedPref(video.playbackRate)`, with an internal
     `lastAppliedRate` echo-write guard so the rate we just applied doesn't
     cause a redundant write back. Not throttled.
   - `ended` — calls `clearPosition(videoId)`.
5. **Calls into `lib/storage.js`**: `getSpeedPref`, `setSpeedPref`,
   `getPosition`, `setPosition`, `clearPosition`. All inherit storage's
   never-throw / silent-no-op semantics.

## Explicit non-API

- **No `detach()` is exported.** There is no caller for it. Listeners die with
  the `<video>` element if Zoom ever removes it; the WeakMap entry becomes
  unreachable (garbage collected). The wiring layer must not rely on cleanup —
  it should call `attachPlayback` again on every observer tick (idempotent
  guard makes this cheap and safe).

- **No promise / async return.** `attachPlayback` is synchronous. The actual
  position seek may happen on the `loadedmetadata` listener firing after
  return, but the function itself does not return anything to await.

- **No event emitter / callback parameter.** Consumers cannot observe
  internal events (save, restore, toast shown). If those are ever needed,
  the contract will be extended — do not reach into module internals.

- **No `throw`.** Bad inputs and storage failures are silently no-op'd.
  Callers do not need to wrap `attachPlayback` in `try/catch`.

## Constants (informational, not part of the API)

These live module-private and may change without bumping the contract:

| Constant            | Value      | Purpose                                  |
|---------------------|------------|------------------------------------------|
| `SAVE_THROTTLE_MS`  | `2000`     | Min interval between `setPosition` writes |
| `MIN_SAVE_TIME_S`   | `10`       | Don't save while `currentTime <` this     |
| `RESUME_THRESHOLD`  | `0.95`     | Skip restore if `saved >= duration * this`|
| `TOAST_FADE_MS`     | `2800`     | Add `--fading` class at this point        |
| `TOAST_REMOVE_MS`   | `3000`     | `el.remove()` at this point               |

## Anti-contract (things wiring must NOT do)

- Do NOT call `attachPlayback` with a `videoId` derived from anything but the
  caller-supplied opaque ID. Storage does not validate the ID; passing
  unbounded user input would create unbounded `localStorage` keys. Wiring
  should validate / cap length before calling (the plan's `extractVideoId`
  rejects IDs longer than 256 chars — that suffices).
- Do NOT touch `#super-zoom-resume-toast` from outside this module — it owns
  the lifecycle.
- Do NOT call `attachPlayback` before a `<video>` element exists. The
  function defends against bad input but `null` is still bad input.
- Do NOT expect the saved position to update while paused — that's
  intentional (avoids overwriting the saved time during scrubbing).
