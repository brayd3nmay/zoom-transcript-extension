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

  // content/main.js
  var BUTTON_ID = "super-zoom-download-btn";
  var SUCCESS_RESET_MS = 2e4;
  var ERROR_RESET_MS = 5e3;
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
  function tryInject() {
    if (document.getElementById(BUTTON_ID)) return;
    const panel = document.querySelector("#transcript-tab");
    if (!panel) return;
    panel.insertBefore(buildButton(), panel.firstChild);
  }
  var observer = new MutationObserver(tryInject);
  observer.observe(document.body, { childList: true, subtree: true });
  tryInject();
})();
