# Super Zoom

Chrome extension for Zoom cloud recording playback. Download the transcript as Markdown, toggle a wide-video theater mode, resume where you left off, remember your preferred speed (with extra options), and drive playback from the keyboard.

<!-- Add a screenshot of the in-page button or a short GIF of a download here -->

## About

When viewing a Zoom recording you didn't host, the official "Download" button on the transcript is often disabled — even though the full text is rendered alongside the video. Super Zoom reads the rendered transcript directly from the DOM and saves it as Markdown: speakers grouped, timestamps preserved, file named after the meeting.

It also adds a **theater mode** that widens the video to fill most of the viewport and stacks the transcript directly below — useful on wide monitors where the default Zoom layout leaves the video small and the transcript squeezed into a narrow sidebar.

Beyond that, the extension remembers where you stopped watching each recording (per-video, 7-day expiry), remembers your preferred playback speed across recordings, adds the missing **1.75×** and **3×** options to Zoom's speed menu, and binds YouTube-style keyboard shortcuts (`j`/`k`/`l`/`f`).

The extension declares only the `scripting` permission plus host permissions scoped to Zoom recording URLs (`*.zoom.us/rec/play/*` and `*.zoom.us/rec/share/*`). No network calls, no telemetry.

## Setup

1. Clone the repo:
   ```sh
   git clone https://github.com/brayd3nmay/super-zoom.git
   ```
2. Open [chrome://extensions](chrome://extensions) and enable **Developer mode**.
3. Click **Load unpacked** and select the cloned folder.
4. (Optional) Pin the extension from the Chrome toolbar's puzzle-piece menu.

The repo ships with a pre-built `content.js`. To rebuild after editing `content/main.js` or anything in `lib/`, run `npm install && npm run build:content`.

## Downloading a transcript

1. Open a Zoom cloud recording playback page (URL matches `*.zoom.us/rec/play/...` or `/rec/share/...`).
2. Open the **Audio Transcript** panel — the transcript list must be rendered.
3. Click **Download Transcript** — either the blue button injected into the transcript panel, or the same-named button in the toolbar popup.

The Markdown file lands in the default downloads folder, named after the meeting title. Consecutive utterances from the same speaker are grouped into one paragraph under a `## Speaker — MM:SS` heading:

```markdown
# Engineering Economics — Final Exam Review

## Hannah Meckstroth — 00:02

Okay. So, here, again, we have the final exam extra credit quiz, and we just have some review problems...

## Bob Smith — 03:47

Question about problem two.
```

If the in-page button reports "No transcript" or the popup says the same, scroll the transcript panel into view so it actually renders, then try again — the extension reads the panel's DOM, not any cached data.

## Theater mode

To toggle theater mode:

- **Click** the small theater icon in the video's control bar, next to *Speed / CC / Fullscreen*.
- **Or press `T`** while the page has focus (ignored when you're typing in a text field, and `Cmd+T` / `Ctrl+T` still opens a new tab).

When on, the video grows to ~98 vw and the transcript drops directly below it. The preference is saved via `localStorage` (per Zoom subdomain) and restored automatically on reload.

## Resume position

Watch part of a recording, close the tab or reload — the next time you open the same recording, it silently jumps back to where you left off and a small "Resumed at MM:SS" toast appears top-right (auto-dismisses after ~3 s, click to dismiss sooner).

- Position is keyed per recording (the ID Zoom puts in the URL path).
- Saved entries expire after **7 days**, so a recording you've forgotten about doesn't keep resuming forever.
- If you finished the recording (≥ 95 % of duration), the saved position is cleared and the next visit starts at 0.

## Remembered playback speed

The speed you pick is remembered globally and applied automatically the next time you open any Zoom recording.

The extension also adds the speeds Zoom's own menu is missing — **1.75×** and **3×** — directly into Zoom's existing Speed dropdown. If injection ever fails (e.g. Zoom restructures their player), Super Zoom falls back to its own dropdown next to the theater button with the full ladder `0.75× / 1× / 1.25× / 1.5× / 1.75× / 2× / 3×`.

## Keyboard shortcuts

All shortcuts use the bare key (no modifier). They're ignored while you're typing in an input/textarea, and modified versions (`Cmd+L` / `Ctrl+L` etc.) keep their normal browser meaning.

| Key | Action |
|---|---|
| `j` | Seek back 15 s |
| `k` | Toggle play/pause |
| `l` | Seek forward 15 s |
| `f` | Toggle fullscreen |
| `t` | Toggle theater mode |

`j` and `l` show a brief "15 seconds" indicator in the center of the player.
