# Resume toast CSS contract

Owner: `styling`
Consumer: `playback`

The `styling` teammate appends styles to `content.css` for a single resume-toast
element. The `playback` module is responsible for creating, updating, and
removing the element. There is at most ONE resume toast in the DOM at a time
(playback removes any existing toast before adding a new one).

## DOM contract

```html
<div id="super-zoom-resume-toast"
     class="super-zoom-resume-toast"
     role="status">Resumed at MM:SS</div>
```

- Tag: `<div>`.
- Id: `super-zoom-resume-toast` (stable, single instance, used as the uniqueness
  guard — `document.getElementById('super-zoom-resume-toast')` is the canonical
  way to find it).
- Class: `super-zoom-resume-toast` (always present in the visible state).
- Role: `role="status"` so screen readers announce the toast politely. Do NOT
  use `aria-live="assertive"`.
- Inserted into: `document.body` (top-level), so the CSS `position: fixed`
  positioning works regardless of Zoom's player layout.
- Text content: written via `textContent` only — never `innerHTML`. The
  `playback` module formats the saved time as `MM:SS` (or `HH:MM:SS` when the
  saved time is ≥ 3600 s) and prefixes it with the literal string
  `"Resumed at "`. Example: `Resumed at 12:34`.

## Visual states

The CSS provides two states, controlled entirely by the presence/absence of an
optional modifier class:

| State          | Classes                                                              | Visual           |
|----------------|----------------------------------------------------------------------|------------------|
| Visible        | `super-zoom-resume-toast`                                            | opacity 1        |
| Fading out     | `super-zoom-resume-toast super-zoom-resume-toast--fading`            | opacity 0 (200 ms transition) |

The CSS declares a `transition: opacity 200ms ease` on the base class, so
toggling the `--fading` modifier triggers a smooth fade. There is no
`.super-zoom-resume-toast--hidden` — the element is removed from the DOM rather
than hidden via CSS.

## JS contract (what `playback` does)

The `playback` module is expected to:

1. Build the element with `document.createElement('div')`, set
   `el.id = 'super-zoom-resume-toast'`, `el.className = 'super-zoom-resume-toast'`,
   `el.setAttribute('role', 'status')`, and
   `el.textContent = 'Resumed at ' + formatTime(savedTime)`.
2. Before inserting, remove any existing toast: e.g.
   `document.getElementById('super-zoom-resume-toast')?.remove()`.
3. Append to `document.body`.
4. Wire a `click` listener on the element that removes it immediately
   (click-to-dismiss).
5. Schedule auto-removal:
   - At ~2800 ms: add the `super-zoom-resume-toast--fading` class to start the
     200 ms opacity fade. (Optional but recommended — without it the toast pops
     out abruptly.)
   - At ~3000 ms: `el.remove()`.
   - Use a single closure-captured timer or two `setTimeout`s; either is fine.

The CSS does NOT animate `display`, `transform`, or anything else — only
`opacity`. Removing the element is the responsibility of JS; CSS only handles
the fade.

## Visual / styling notes (informational; not part of the contract)

These match the Theater button's color family for visual consistency. They are
NOT part of the contract — the consumer should not depend on specific values.

- Position: `fixed`, top-right of the viewport (~16 px from each edge).
- Background: `rgba(0, 0, 0, 0.85)`, color `#fff`, padding `8px 12px`,
  border-radius `4px`.
- `z-index: 2147483647` (max — sits above Zoom's own modals; auto-dismisses in
  3 s so collisions are bounded).
- `cursor: pointer` (it's click-to-dismiss).
- Font matches the existing download button's family/size.

## Anti-contract (things the consumer must NOT do)

- Do NOT inject more than one toast at a time — always remove the existing one
  first.
- Do NOT set `innerHTML` — `textContent` only (no markup, no entities).
- Do NOT add additional class modifiers beyond `super-zoom-resume-toast--fading`
  without coordinating with `styling`.
- Do NOT mutate inline `style` to control opacity; use the `--fading` class so
  the transition is consistent.
