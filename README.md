# Zoom Transcript Downloader

A Chrome extension that saves the audio transcript shown on a Zoom cloud recording playback page as a Markdown file.

<!-- Add a screenshot of the popup or a short GIF of a download here -->

## About

When viewing a Zoom recording you didn't host, the page often disables the official "Download" button on the transcript even though the full text is rendered alongside the video. This extension reads that rendered transcript directly from the DOM and saves it as Markdown — speakers grouped, timestamps preserved, named after the meeting.

The extension declares only the `activeTab`, `scripting`, and `downloads` permissions. No host permissions, no network calls, no telemetry.

## Setup

1. Clone the repo:
   ```sh
   git clone https://github.com/brayd3nmay/zoom-transcript-extension.git
   ```
2. Open `chrome://extensions` in Chrome and enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the cloned folder.
4. Pin the extension from the Chrome toolbar's puzzle-piece menu.

## How to use

1. Open a Zoom cloud recording playback page (URL matches `*.zoom.us/rec/play/...` or `/rec/share/...`).
2. Open the **Audio Transcript** panel — the transcript list must be visible on the page.
3. Click the extension's toolbar icon, then click **Download Transcript**.

The Markdown file lands in your default downloads folder, named after the meeting title. Output groups consecutive utterances from the same speaker into one paragraph, with `## Speaker — MM:SS` headings:

```markdown
# Engineering Economics — Final Exam Review

## Hannah Meckstroth — 00:02

Okay. So, here, again, we have the final exam extra credit quiz, and we just have some review problems...

## Bob Smith — 03:47

Question about problem two.
```

If the popup says "No transcript found on this page," scroll the transcript panel into view on the recording and try again — the extension reads the panel's DOM, so it must be rendered.
