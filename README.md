# Super Zoom

Chrome extension that downloads Zoom cloud recording transcripts as Markdown.

<!-- Add a screenshot of the in-page button or a short GIF of a download here -->

## About

When viewing a Zoom recording you didn't host, the official "Download" button on the transcript is often disabled — even though the full text is rendered alongside the video. Super Zoom reads the rendered transcript directly from the DOM and saves it as Markdown: speakers grouped, timestamps preserved, file named after the meeting.

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

## How to use

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
