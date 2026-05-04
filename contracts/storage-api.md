# Storage API Contract

Owner: **storage** teammate. Consumers: **playback** (and any future module needing persistence).

Module: `lib/storage.js`. All functions are synchronous, never throw, and silently no-op on `localStorage` failure (private mode / quota exceeded).

## Storage keys

| Key | Shape | TTL |
|---|---|---|
| `super-zoom:theater` | `'1'` or `'0'` (string) | none (existing) |
| `super-zoom:speed` | numeric string, e.g. `'1.5'` | none |
| `super-zoom:pos:<id>` | JSON envelope `{ time: number, savedAt: number }` | 7 days from `savedAt` |

`<id>` is the caller-supplied opaque video ID. Storage does not validate `<id>` format beyond non-empty / non-string rejection.

`POSITION_TTL_MS = 7 * 24 * 60 * 60 * 1000` (7 days).

## Existing exports (retained, unchanged)

### `getTheaterPref(): boolean`
Returns `true` iff `localStorage` value at `super-zoom:theater` is `'1'`. Returns `false` on read failure.

### `setTheaterPref(value: boolean): void`
Writes `'1'` or `'0'`. Silently no-ops on write failure.

## New exports

### `getSpeedPref(): number | null`
Reads `super-zoom:speed`, parses with `parseFloat`. Returns `null` if:
- Missing
- Not finite (`NaN`, `±Infinity`)
- `<= 0`
- `> 16` (Chrome ignores rates outside ~0.0625–16; treat out-of-range as missing)
- `localStorage` read fails

Otherwise returns the parsed number.

### `setSpeedPref(rate: number): void`
Writes `String(rate)` to `super-zoom:speed`. Silently no-ops if:
- `rate` is non-finite
- `rate <= 0`
- `localStorage` write fails

No upper-bound rejection on write (callers are trusted; the read-side bound prevents corrupt values from coming back). No throttle.

### `getPosition(id: string): number | null`
Reads `super-zoom:pos:<id>`, parses JSON. Returns `null` if:
- `id` is empty / not a string
- Missing
- `JSON.parse` throws or returns a non-object / array / `null`
- Envelope missing / wrong-typed `time` / non-finite / negative
- Envelope missing / wrong-typed `savedAt` / non-finite
- `Date.now() - savedAt > POSITION_TTL_MS`
- `localStorage` read fails

Otherwise returns `envelope.time`.

**Side effect (read-time GC):** when the entry is malformed or expired, this function calls `localStorage.removeItem('super-zoom:pos:<id>')` before returning `null`. Callers do not need to clean up after a `null` return.

### `setPosition(id: string, time: number): void`
Writes `JSON.stringify({ time, savedAt: Date.now() })` to `super-zoom:pos:<id>`. Silently no-ops if:
- `id` is empty / not a string
- `time` is non-finite
- `time < 0`
- `localStorage` write fails

### `clearPosition(id: string): void`
Calls `localStorage.removeItem('super-zoom:pos:<id>')`. Silently no-ops if `id` is empty / not a string or `removeItem` fails.

### `gcExpiredPositions(): void`
Iterates a snapshot of `localStorage` keys (`Object.keys(localStorage)`). For any key starting with `super-zoom:pos:`:
- If the entry is malformed JSON, `removeItem` it.
- If the envelope is missing/non-object/wrong-typed, `removeItem` it.
- If `Date.now() - savedAt > POSITION_TTL_MS`, `removeItem` it.

The snapshot-first approach is intentional — mutating `localStorage` while iterating `localStorage.key(i)` is unreliable across browsers.

Silently no-ops on read failure.

## Guarantees

- **No throw:** every entry point wraps `localStorage` access in `try/catch`. Errors are swallowed.
- **No console output:** failures are silent — nothing is logged.
- **Idempotent reads:** repeated calls with the same args return the same value (modulo TTL crossings and side-effect GC).
- **Read-time GC:** `getPosition` is the only function with a write side effect on read; it deletes the entry it's reading when that entry is malformed or expired.
