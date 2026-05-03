(() => {
  // lib/scrape.js
  function scrapeZoomTranscript() {
    function parseAriaLabel(label) {
      if (!label) return null;
      const re = /^(.+?), (?:(\d+) minutes?\s+)?(\d+) seconds?, ([\s\S]*)$/;
      const m = label.match(re);
      if (!m) return null;
      return { speaker: m[1], text: m[4] };
    }
    function getTitle() {
      const topicEl = document.querySelector(".topic");
      if (topicEl && topicEl.textContent && topicEl.textContent.trim()) {
        return topicEl.textContent.trim();
      }
      if (document.title) {
        return document.title.replace(/ - Zoom$/, "").trim() || "zoom-transcript";
      }
      return "zoom-transcript";
    }
    const list = document.querySelector("ul.transcript-list");
    if (!list) {
      return { error: "no_transcript" };
    }
    const items = list.querySelectorAll("li.transcript-list-item");
    const lines = [];
    let previousSpeaker = null;
    for (const li of items) {
      const textEl = li.querySelector("div.text");
      const text = textEl ? textEl.textContent.trim() : "";
      if (!text) continue;
      const timeEl = li.querySelector("span.time");
      const time = timeEl ? timeEl.textContent.trim() : "";
      const nameEl = li.querySelector("span.user-name-span");
      let speaker = nameEl ? nameEl.textContent.trim() : "";
      if (!speaker) {
        const aria = li.getAttribute("aria-label");
        const parsed = parseAriaLabel(aria);
        if (parsed && parsed.speaker) {
          speaker = parsed.speaker;
        } else if (previousSpeaker) {
          speaker = previousSpeaker;
        } else {
          speaker = "Unknown";
        }
      }
      lines.push({ speaker, time, text });
      previousSpeaker = speaker;
    }
    if (lines.length === 0) {
      return { error: "empty" };
    }
    return { title: getTitle(), lines };
  }

  // lib/markdown.js
  function buildMarkdown({ title, lines }) {
    const out = [`# ${escapeTitle(title)}`];
    if (!Array.isArray(lines) || lines.length === 0) {
      return out.join("\n") + "\n";
    }
    let currentSpeaker = null;
    let paragraph = [];
    const flush = () => {
      if (paragraph.length > 0) {
        out.push("");
        out.push(paragraph.join(" "));
        paragraph = [];
      }
    };
    for (const line of lines) {
      if (line.speaker !== currentSpeaker) {
        flush();
        out.push("");
        out.push(`## ${line.speaker} \u2014 ${line.time}`);
        currentSpeaker = line.speaker;
        paragraph.push(escapeBody(
          line.text,
          /* isFirstInPara */
          true
        ));
      } else {
        paragraph.push(escapeBody(line.text, false));
      }
    }
    flush();
    return out.join("\n") + "\n";
  }
  function escapeTitle(title) {
    return String(title).replace(/[\[\]\*_`]/g, (m) => "\\" + m);
  }
  function escapeBody(text, isFirstInPara) {
    let s = String(text).replace(/`/g, "'");
    if (isFirstInPara) {
      s = s.replace(/^(\s*)([#\->*]|\d+[.)])/, (_, ws, marker) => `${ws}\\${marker}`);
    }
    return s;
  }

  // lib/filename.js
  var ILLEGAL_CHARS = /[\/\\:*?"<>|]/g;
  var CONTROL_CHARS = /[\x00-\x08\x0E-\x1F\x7F]/g;
  var FALLBACK = "zoom-transcript";
  var MAX_BYTES = 200;
  function sanitizeFilename(title) {
    if (typeof title !== "string") return FALLBACK;
    let s = title;
    s = s.replace(CONTROL_CHARS, "");
    s = s.replace(ILLEGAL_CHARS, "-");
    s = s.replace(/-{2,}/g, "-");
    s = s.replace(/\s+/g, " ");
    s = s.replace(/^[\s.\-]+|[\s.\-]+$/g, "");
    s = capUtf8Bytes(s, MAX_BYTES);
    if (s.length === 0) return FALLBACK;
    return s;
  }
  var ENCODER = new TextEncoder();
  var DECODER = new TextDecoder("utf-8");
  function capUtf8Bytes(s, maxBytes) {
    const buf = ENCODER.encode(s);
    if (buf.length <= maxBytes) return s;
    let cut = maxBytes;
    while (cut > 0 && (buf[cut] & 192) === 128) cut--;
    return DECODER.decode(buf.subarray(0, cut));
  }

  // lib/download.js
  var BLOB_REVOKE_DELAY_MS = 1e3;
  function triggerDownload({ markdown, filename }) {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_DELAY_MS);
  }
  function downloadTranscript({ title, lines }) {
    const markdown = buildMarkdown({ title, lines });
    const filename = sanitizeFilename(title) + ".md";
    triggerDownload({ markdown, filename });
  }

  // lib/theater.js
  var CLASS_NAME = "super-zoom-theater";
  function enableTheater() {
    document.documentElement.classList.add(CLASS_NAME);
  }
  function disableTheater() {
    document.documentElement.classList.remove(CLASS_NAME);
  }
  function isTheaterEnabled() {
    return document.documentElement.classList.contains(CLASS_NAME);
  }
  function toggleTheater() {
    if (isTheaterEnabled()) {
      disableTheater();
      return false;
    }
    enableTheater();
    return true;
  }

  // lib/storage.js
  var KEY = "super-zoom:theater";
  function getTheaterPref() {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  }
  function setTheaterPref(value) {
    try {
      localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
    }
  }

  // content/main.js
  var BUTTON_ID = "super-zoom-download-btn";
  var THEATER_BUTTON_ID = "super-zoom-theater-btn";
  var SUCCESS_RESET_MS = 2e4;
  var ERROR_RESET_MS = 5e3;
  if (getTheaterPref()) {
    enableTheater();
  }
  function buildButton() {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.className = "super-zoom-download-btn";
    btn.type = "button";
    btn.dataset.state = "idle";
    btn.setAttribute("aria-label", "Download transcript as Markdown");
    btn.textContent = "Download Transcript";
    btn.addEventListener("click", handleClick);
    return btn;
  }
  function setState(btn, state, label) {
    btn.dataset.state = state;
    btn.textContent = label;
    btn.disabled = state !== "idle";
  }
  function resetAfter(btn, ms) {
    setTimeout(() => {
      if (!btn.isConnected) return;
      setState(btn, "idle", "Download Transcript");
    }, ms);
  }
  function failWith(btn, label) {
    setState(btn, "error", label);
    resetAfter(btn, ERROR_RESET_MS);
  }
  function handleClick(event) {
    const btn = event.currentTarget;
    setState(btn, "reading", "Reading\u2026");
    let result;
    try {
      result = scrapeZoomTranscript();
    } catch (err) {
      console.error("[super-zoom] scrape threw:", err);
      return failWith(btn, "Failed");
    }
    if (!result || result.error === "no_transcript") return failWith(btn, "No transcript");
    if (result.error === "empty") return failWith(btn, "Empty");
    try {
      downloadTranscript(result);
    } catch (err) {
      console.error("[super-zoom] downloadTranscript threw:", err);
      return failWith(btn, "Failed");
    }
    setState(btn, "success", "Downloaded");
    resetAfter(btn, SUCCESS_RESET_MS);
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  var THEATER_ICON_PATHS = [
    "M12 4.5C15.0776 4.5 17.8526 3.77588 19.8097 2.61579C19.9349 2.54155 20.0772 2.5 20.2228 2.5C20.652 2.5 21 2.84797 21 3.27722V9.5C21 16.5 16.5 21.5 12 21.5C7.5 21.5 3 16.5 3 9.5V3.27722C3 2.84797 3.34797 2.5 3.77722 2.5C3.92281 2.5 4.06506 2.54155 4.1903 2.61579C6.14736 3.77588 8.92241 4.5 12 4.5Z",
    "M6.5 9.5C6.86849 9.19313 7.40399 9 8 9C8.59601 9 9.13151 9.19313 9.5 9.5",
    "M12 15.2C13.192 15.2 14.263 14.9296 15 14.5C15 14.5 14.5 17.5 12 17.5C9.5 17.5 9 14.5 9 14.5C9.73698 14.9296 10.808 15.2 12 15.2Z",
    "M14.5 9.5C14.8685 9.19313 15.404 9 16 9C16.596 9 17.1315 9.19313 17.5 9.5"
  ];
  function makeTheaterIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of THEATER_ICON_PATHS) {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    return svg;
  }
  function setTheaterButtonState(btn, enabled) {
    const label = enabled ? "Exit theater mode" : "Enter theater mode";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    if (!btn.firstChild) {
      btn.appendChild(makeTheaterIcon());
    }
  }
  function buildTheaterButton() {
    const btn = document.createElement("button");
    btn.id = THEATER_BUTTON_ID;
    btn.type = "button";
    btn.className = "super-zoom-theater-btn";
    setTheaterButtonState(btn, isTheaterEnabled());
    btn.addEventListener("click", toggleAndPersist);
    return btn;
  }
  function toggleAndPersist() {
    const enabled = toggleTheater();
    setTheaterPref(enabled);
    const btn = document.getElementById(THEATER_BUTTON_ID);
    if (btn) setTheaterButtonState(btn, enabled);
  }
  function tryInjectTheaterButton() {
    if (document.getElementById(THEATER_BUTTON_ID)) return;
    const host = document.querySelector(".vjs-extend-control");
    if (!host) return;
    host.appendChild(buildTheaterButton());
  }
  function tryInjectDownloadButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const panel = document.querySelector("#transcript-tab");
    if (!panel) return;
    panel.insertBefore(buildButton(), panel.firstChild);
  }
  function injectAll() {
    tryInjectDownloadButton();
    tryInjectTheaterButton();
  }
  var observer = new MutationObserver(injectAll);
  observer.observe(document.body, { childList: true, subtree: true });
  injectAll();
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "t") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
      return;
    }
    e.preventDefault();
    toggleAndPersist();
  }, true);
})();
