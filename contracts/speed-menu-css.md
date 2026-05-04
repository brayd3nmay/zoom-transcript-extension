# Speed-menu (fallback dropdown) CSS contract

Owner: `styling`
Consumer: `speed-menu`

The `styling` teammate appends styles to `content.css` for the **fallback**
speed dropdown that `speed-menu` builds when injection into Zoom's native
Video.js menu isn't possible within the deadline. The native-injection path
does NOT use these classes — it clones existing Vue/Video.js DOM and is styled
by Zoom.

## DOM contract (fallback only)

```html
<div class="super-zoom-speed-wrapper">
  <button id="super-zoom-speed-btn"
          class="super-zoom-speed-btn"
          type="button"
          aria-haspopup="menu"
          aria-expanded="false">1×</button>
  <ul class="super-zoom-speed-menu" hidden role="menu">
    <li class="super-zoom-speed-menu-item" role="menuitemradio" data-rate="0.75" aria-checked="false">0.75×</li>
    <li class="super-zoom-speed-menu-item" role="menuitemradio" data-rate="1"    aria-checked="true">1×</li>
    <li class="super-zoom-speed-menu-item" role="menuitemradio" data-rate="1.25" aria-checked="false">1.25×</li>
    <li class="super-zoom-speed-menu-item" role="menuitemradio" data-rate="1.5"  aria-checked="false">1.5×</li>
    <li class="super-zoom-speed-menu-item" role="menuitemradio" data-rate="1.75" aria-checked="false">1.75×</li>
    <li class="super-zoom-speed-menu-item" role="menuitemradio" data-rate="2"    aria-checked="false">2×</li>
    <li class="super-zoom-speed-menu-item" role="menuitemradio" data-rate="3"    aria-checked="false">3×</li>
  </ul>
</div>
```

### Wrapper
- Tag: `<div>` with class `super-zoom-speed-wrapper` (no id).
- Holds both the button and the menu so the menu can be absolutely positioned
  relative to the button.
- Appended into `.vjs-extend-control` (the same toolbar host as the existing
  `.super-zoom-theater-btn`). Ordering inside `.vjs-extend-control` is up to
  the consumer; CSS is order-agnostic.

### Trigger button
- Tag: `<button>` with `type="button"` (no form-submission).
- Id: `super-zoom-speed-btn` (stable, single instance — used as the
  fallback-built guard via `document.getElementById('super-zoom-speed-btn')`).
- Class: `super-zoom-speed-btn`.
- Visible label: the current playback rate, set via `textContent`. Use the
  multiplication sign `×` (U+00D7) per the plan: `0.75×`, `1×`, `1.25×`,
  `1.5×`, `1.75×`, `2×`, `3×`. The label is updated on every `ratechange`.
- Recommended ARIA: `aria-haspopup="menu"` and `aria-expanded` toggled between
  `"true"` and `"false"` to reflect menu open state. Not strictly required by
  CSS but improves a11y; CSS does not depend on these attributes.

### Menu
- Tag: `<ul>` with class `super-zoom-speed-menu`, attribute `role="menu"`, and
  the native `hidden` attribute when closed. CSS uses the native `hidden`
  attribute (no `.super-zoom-speed-menu--open` class) — toggling visibility is
  done via `menu.hidden = true|false`.
- Position: anchored above the button (CSS handles positioning; consumer just
  needs to make sure the wrapper is in the layout flow).

### Menu items
- Tag: `<li>` with class `super-zoom-speed-menu-item`, `role="menuitemradio"`.
- `data-rate` attribute is the canonical rate as a string, used by the click
  handler to read which rate was selected: `data-rate="0.75"`, `"1"`, `"1.25"`,
  `"1.5"`, `"1.75"`, `"2"`, `"3"`.
- Visible label: the same rate formatted with `×` (e.g. `0.75×`, `1×`, `3×`),
  set via `textContent`.
- Active item: `aria-checked="true"`. CSS draws a `✓ ` glyph before the label
  for the active item via the `[aria-checked="true"]::before` selector. All
  other items have `aria-checked="false"` (or no attribute, but explicit
  `"false"` is preferred for screen readers).
- **Order is fixed**: `0.75, 1, 1.25, 1.5, 1.75, 2, 3`. Note the deliberate
  omission of `0.5` — matches Zoom's own menu.

## Behavior contract (what `speed-menu` does)

The styling does NOT enforce these — they're documented here so the consumer
and the styling stay in sync.

1. **Toggle on button click:** flip `menu.hidden`; update the button's
   `aria-expanded` accordingly.
2. **Outside-click close:** while open, listen on
   `document.addEventListener('click', closeIfOutside, true)`; on click outside
   the wrapper, set `menu.hidden = true` and remove the listener.
3. **Escape close:** while open, listen for `keydown` `Escape` and close.
4. **Item click:** parse `e.currentTarget.dataset.rate` as a float, set
   `video.playbackRate = rate`, set `menu.hidden = true`. The `ratechange`
   handler then updates the active state.
5. **`ratechange` sync:** for every menu item, set
   `aria-checked = String(parseFloat(item.dataset.rate) === video.playbackRate)`,
   and update the trigger button's `textContent` to the new rate label.

## Visual / styling notes (informational; not part of the contract)

- `.super-zoom-speed-btn` matches `.super-zoom-theater-btn` sizing (32×32) and
  color (`#87b8ff`, hover `#2D8CFF`). Label uses `font-size: 12px;
  font-weight: 600` to fit the rate text in 32 px.
- Menu is dark (`#1f2937` background) with a subtle drop shadow, rendered
  above the button (`bottom: 100%`).
- Active item shows a `✓ ` prefix in `#2D8CFF`.
- `.super-zoom-speed-menu[hidden]` is hidden via the browser's default
  `hidden` styling — CSS does not need to redeclare `display: none`.

## Anti-contract (things the consumer must NOT do)

- Do NOT use a class to hide/show the menu. Use the native `hidden` attribute.
- Do NOT set `innerHTML` on labels or items. `textContent` only.
- Do NOT add additional rates or reorder the existing ones without
  coordinating with `styling`. (Adding e.g. `0.5` would leave a gap with
  Zoom's native menu.)
- Do NOT inline `style` for color/sizing — let CSS handle it.
- Do NOT inject more than one wrapper at a time — guard via
  `document.getElementById('super-zoom-speed-btn')`.
