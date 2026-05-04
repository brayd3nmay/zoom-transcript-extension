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
  var SPEED_KEY = "super-zoom:speed";
  var POSITION_KEY_PREFIX = "super-zoom:pos:";
  var POSITION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  var MAX_SPEED = 16;
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
  function getSpeedPref() {
    try {
      const raw = localStorage.getItem(SPEED_KEY);
      if (raw == null) return null;
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return null;
      if (n <= 0 || n > MAX_SPEED) return null;
      return n;
    } catch {
      return null;
    }
  }
  function setSpeedPref(rate) {
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return;
    try {
      localStorage.setItem(SPEED_KEY, String(rate));
    } catch {
    }
  }
  function isValidEnvelope(obj) {
    return obj != null && typeof obj === "object" && !Array.isArray(obj) && typeof obj.time === "number" && Number.isFinite(obj.time) && obj.time >= 0 && typeof obj.savedAt === "number" && Number.isFinite(obj.savedAt);
  }
  function getPosition(id) {
    if (typeof id !== "string" || id === "") return null;
    const key = POSITION_KEY_PREFIX + id;
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return null;
      let obj;
      try {
        obj = JSON.parse(raw);
      } catch {
        try {
          localStorage.removeItem(key);
        } catch {
        }
        return null;
      }
      if (!isValidEnvelope(obj)) {
        try {
          localStorage.removeItem(key);
        } catch {
        }
        return null;
      }
      if (Date.now() - obj.savedAt > POSITION_TTL_MS) {
        try {
          localStorage.removeItem(key);
        } catch {
        }
        return null;
      }
      return obj.time;
    } catch {
      return null;
    }
  }
  function setPosition(id, time) {
    if (typeof id !== "string" || id === "") return;
    if (typeof time !== "number" || !Number.isFinite(time) || time < 0) return;
    try {
      localStorage.setItem(POSITION_KEY_PREFIX + id, JSON.stringify({ time, savedAt: Date.now() }));
    } catch {
    }
  }
  function clearPosition(id) {
    if (typeof id !== "string" || id === "") return;
    try {
      localStorage.removeItem(POSITION_KEY_PREFIX + id);
    } catch {
    }
  }
  function gcExpiredPositions() {
    let keys;
    try {
      keys = Object.keys(localStorage);
    } catch {
      return;
    }
    const now = Date.now();
    for (const key of keys) {
      if (typeof key !== "string" || !key.startsWith(POSITION_KEY_PREFIX)) continue;
      let raw;
      try {
        raw = localStorage.getItem(key);
      } catch {
        continue;
      }
      if (raw == null) continue;
      let obj = null;
      let malformed = false;
      try {
        obj = JSON.parse(raw);
      } catch {
        malformed = true;
      }
      const expired = !malformed && isValidEnvelope(obj) && now - obj.savedAt > POSITION_TTL_MS;
      const badShape = !malformed && !isValidEnvelope(obj);
      if (malformed || badShape || expired) {
        try {
          localStorage.removeItem(key);
        } catch {
        }
      }
    }
  }

  // lib/playback.js
  var SAVE_THROTTLE_MS = 2e3;
  var MIN_SAVE_TIME_S = 10;
  var RESUME_THRESHOLD = 0.95;
  var TOAST_FADE_MS = 2800;
  var TOAST_REMOVE_MS = 3e3;
  var TOAST_ID = "super-zoom-resume-toast";
  var TOAST_CLASS = "super-zoom-resume-toast";
  var TOAST_FADING_CLASS = "super-zoom-resume-toast--fading";
  var attached = /* @__PURE__ */ new WeakMap();
  function attachPlayback(video, videoId2) {
    if (!video || typeof video.addEventListener !== "function") return;
    if (typeof videoId2 !== "string" || videoId2.length === 0) return;
    if (attached.has(video)) return;
    attached.set(video, true);
    let lastAppliedRate = null;
    const savedRate = getSpeedPref();
    if (savedRate != null) {
      video.playbackRate = savedRate;
      lastAppliedRate = savedRate;
    }
    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      restorePosition(video, videoId2);
    } else {
      video.addEventListener("loadedmetadata", () => {
        restorePosition(video, videoId2);
      }, { once: true });
    }
    let lastSaveAt = Number.NEGATIVE_INFINITY;
    video.addEventListener("timeupdate", () => {
      if (video.paused) return;
      if (video.currentTime < MIN_SAVE_TIME_S) return;
      const now = Date.now();
      if (now - lastSaveAt < SAVE_THROTTLE_MS) return;
      lastSaveAt = now;
      setPosition(videoId2, video.currentTime);
    });
    video.addEventListener("ratechange", () => {
      const rate = video.playbackRate;
      if (rate === lastAppliedRate) return;
      lastAppliedRate = rate;
      setSpeedPref(rate);
    });
    video.addEventListener("ended", () => {
      clearPosition(videoId2);
    });
  }
  function restorePosition(video, videoId2) {
    const saved = getPosition(videoId2);
    if (saved == null) return;
    if (Number.isFinite(video.duration) && saved >= video.duration * RESUME_THRESHOLD) {
      clearPosition(videoId2);
      return;
    }
    video.currentTime = saved;
    showResumeToast(saved);
  }
  function showResumeToast(seconds) {
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = TOAST_ID;
    el.className = TOAST_CLASS;
    el.setAttribute("role", "status");
    el.textContent = "Resumed at " + formatTime(seconds);
    el.addEventListener("click", () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => {
      if (!document.getElementById(TOAST_ID)) return;
      el.className = TOAST_CLASS + " " + TOAST_FADING_CLASS;
    }, TOAST_FADE_MS);
    setTimeout(() => {
      el.remove();
    }, TOAST_REMOVE_MS);
  }
  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor(s % 3600 / 60);
    const ss = s % 60;
    const pad = (n) => n < 10 ? "0" + n : "" + n;
    if (hh > 0) return pad(hh) + ":" + pad(mm) + ":" + pad(ss);
    return pad(mm) + ":" + pad(ss);
  }

  // lib/speed-menu.js
  var MENU_SELECTOR = ".vjs-speed-control .vjs-pop-menu ul.list";
  var HOST_SELECTOR = ".vjs-extend-control";
  var FALLBACK_BTN_ID = "super-zoom-speed-btn";
  var FORCE_FALLBACK_KEY = "super-zoom:force-fallback";
  var INJECTION_DEADLINE_MS = 5e3;
  var INJECTED_RATES = [
    { rate: 1.75, text: "1.75x", insertAfterText: "1.5x" },
    { rate: 3, text: "3x", insertAfterText: "2.0x" }
  ];
  var FALLBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 3];
  var injected = false;
  var fallbackBuilt = false;
  var probeStartedAt = null;
  var injectedWired = /* @__PURE__ */ new WeakMap();
  function trySpeedMenuInjection(video) {
    if (forceFallback()) {
      if (!fallbackBuilt) buildFallback(video);
      return;
    }
    if (fallbackBuilt) return;
    const ul = document.querySelector(MENU_SELECTOR);
    if (ul) {
      if (injected && ul.querySelector('li[data-super-zoom="1"]')) return;
      runInjection(ul, video);
      return;
    }
    if (probeStartedAt === null) probeStartedAt = Date.now();
    if (Date.now() - probeStartedAt > INJECTION_DEADLINE_MS) {
      buildFallback(video);
    }
  }
  function forceFallback() {
    try {
      return localStorage.getItem(FORCE_FALLBACK_KEY) === "1";
    } catch {
      return false;
    }
  }
  function runInjection(ul, video) {
    const existing = ul.querySelectorAll('li[role="menuitemradio"]:not([data-super-zoom])');
    if (existing.length < 2) return;
    const template = existing[0];
    for (const { rate, text, insertAfterText } of INJECTED_RATES) {
      const sibling = Array.from(existing).find(
        (li) => li.querySelector("span")?.textContent === insertAfterText
      );
      if (!sibling) continue;
      const clone = template.cloneNode(true);
      clone.removeAttribute("id");
      clone.setAttribute("data-super-zoom", "1");
      clone.classList.remove("selected");
      clone.removeAttribute("aria-checked");
      const span = clone.querySelector("span");
      if (span) span.textContent = text;
      const icon = clone.querySelector("i.zm-icon-ok");
      if (icon) icon.style.display = "none";
      clone.addEventListener("click", () => {
        video.playbackRate = rate;
      });
      sibling.parentNode.insertBefore(clone, sibling.nextSibling);
    }
    injected = true;
    if (!injectedWired.has(video)) {
      injectedWired.set(video, true);
      video.addEventListener("ratechange", () => syncInjectedActiveState(video));
    }
    syncInjectedActiveState(video);
  }
  function syncInjectedActiveState(video) {
    const ul = document.querySelector(MENU_SELECTOR);
    if (!ul) return;
    const items = ul.querySelectorAll('li[data-super-zoom="1"]');
    for (const li of items) {
      const span = li.querySelector("span");
      const rate = span ? parseFloat(span.textContent) : NaN;
      const active = Number.isFinite(rate) && rate === video.playbackRate;
      li.classList.toggle("selected", active);
      if (active) {
        li.setAttribute("aria-checked", "true");
      } else {
        li.removeAttribute("aria-checked");
      }
      const icon = li.querySelector("i.zm-icon-ok");
      if (icon) icon.style.display = active ? "" : "none";
    }
  }
  function buildFallback(video) {
    if (document.getElementById(FALLBACK_BTN_ID)) {
      fallbackBuilt = true;
      return;
    }
    const host = document.querySelector(HOST_SELECTOR);
    if (!host) return;
    const wrapper = document.createElement("div");
    wrapper.className = "super-zoom-speed-wrapper";
    const btn = document.createElement("button");
    btn.id = FALLBACK_BTN_ID;
    btn.className = "super-zoom-speed-btn";
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = formatRate(video.playbackRate);
    const menu = document.createElement("ul");
    menu.className = "super-zoom-speed-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    for (const rate of FALLBACK_RATES) {
      const item = document.createElement("li");
      item.className = "super-zoom-speed-menu-item";
      item.setAttribute("role", "menuitemradio");
      item.dataset.rate = String(rate);
      item.setAttribute("aria-checked", rate === video.playbackRate ? "true" : "false");
      item.textContent = formatRate(rate);
      item.addEventListener("click", () => {
        video.playbackRate = rate;
        closeMenu();
      });
      menu.appendChild(item);
    }
    wrapper.appendChild(btn);
    wrapper.appendChild(menu);
    host.appendChild(wrapper);
    let outsideHandler = null;
    let escapeHandler = null;
    function openMenu() {
      if (!menu.hidden) return;
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      outsideHandler = (e) => {
        if (!wrapper.contains(e.target)) closeMenu();
      };
      escapeHandler = (e) => {
        if (e.key === "Escape") closeMenu();
      };
      document.addEventListener("click", outsideHandler, true);
      document.addEventListener("keydown", escapeHandler, true);
    }
    function closeMenu() {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (outsideHandler) {
        document.removeEventListener("click", outsideHandler, true);
        outsideHandler = null;
      }
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler, true);
        escapeHandler = null;
      }
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menu.hidden) openMenu();
      else closeMenu();
    });
    video.addEventListener("ratechange", () => syncFallbackActiveState(video));
    syncFallbackActiveState(video);
    fallbackBuilt = true;
  }
  function syncFallbackActiveState(video) {
    const btn = document.getElementById(FALLBACK_BTN_ID);
    if (!btn) return;
    btn.textContent = formatRate(video.playbackRate);
    const items = document.querySelectorAll(".super-zoom-speed-menu-item");
    for (const li of items) {
      const rate = parseFloat(li.dataset.rate);
      li.setAttribute(
        "aria-checked",
        Number.isFinite(rate) && rate === video.playbackRate ? "true" : "false"
      );
    }
  }
  function formatRate(rate) {
    if (!Number.isFinite(rate)) return "1\xD7";
    return `${rate}\xD7`;
  }

  // content/main.js
  var BUTTON_ID = "super-zoom-download-btn";
  var THEATER_BUTTON_ID = "super-zoom-theater-btn";
  var SUCCESS_RESET_MS = 2e4;
  var ERROR_RESET_MS = 5e3;
  if (getTheaterPref()) {
    enableTheater();
  }
  gcExpiredPositions();
  var videoId = extractVideoId(window.location);
  function extractVideoId(loc) {
    try {
      const m = new URL(loc.href ?? loc).pathname.match(/^\/rec\/(?:play|share)\/([^\/?#]+)/);
      if (!m) return null;
      const id = m[1].trim();
      if (!id || id.length > 256) return null;
      return id;
    } catch {
      return null;
    }
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
  function tryAttachVideo() {
    if (!videoId) return;
    const video = document.querySelector("video");
    if (!video) return;
    attachPlayback(video, videoId);
    trySpeedMenuInjection(video);
  }
  function injectAll() {
    tryInjectDownloadButton();
    tryInjectTheaterButton();
    tryAttachVideo();
  }
  var observer = new MutationObserver(injectAll);
  observer.observe(document.body, { childList: true, subtree: true });
  injectAll();
  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (!["t", "j", "k", "l"].includes(key)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
    if (key === "t") {
      e.preventDefault();
      toggleAndPersist();
      return;
    }
    const video = document.querySelector("video");
    if (!video) return;
    if (key === "j") {
      e.preventDefault();
      video.currentTime = Math.max(0, video.currentTime - 15);
      return;
    }
    if (key === "l") {
      e.preventDefault();
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 15);
      return;
    }
    if (key === "k") {
      e.preventDefault();
      (video.paused ? video.play() : video.pause())?.catch?.(() => {
      });
      return;
    }
  }, true);
})();
