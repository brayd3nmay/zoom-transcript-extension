// CRITICAL: scrapeZoomTranscript must have ZERO free variables.
// It is serialized via Function.prototype.toString() and re-parsed in a Zoom page's
// main world by chrome.scripting.executeScript({ func }). Any reference to a
// module-scope identifier (import, top-level const, helper function declared
// outside this function body) will throw ReferenceError in the page world.
// Helpers MUST be nested function declarations inside scrapeZoomTranscript.

export function scrapeZoomTranscript() {
  // --- helper: parse aria-label using time-pattern as anchor ---
  function parseAriaLabel(label) {
    if (!label) return null;
    // Format: "<speaker>, X minutes Y seconds, <text>" or "<speaker>, X seconds, <text>"
    const re = /^(.+?), (?:(\d+) minutes?\s+)?(\d+) seconds?, ([\s\S]*)$/;
    const m = label.match(re);
    if (!m) return null;
    return { speaker: m[1], text: m[4] };
  }

  // --- helper: get title with fallback chain ---
  function getTitle() {
    const topicEl = document.querySelector('.topic');
    if (topicEl && topicEl.textContent && topicEl.textContent.trim()) {
      return topicEl.textContent.trim();
    }
    if (document.title) {
      return document.title.replace(/ - Zoom$/, '').trim() || 'zoom-transcript';
    }
    return 'zoom-transcript';
  }

  // --- main ---
  const list = document.querySelector('ul.transcript-list');
  if (!list) {
    return { error: 'no_transcript' };
  }

  const items = list.querySelectorAll('li.transcript-list-item');
  const lines = [];
  let previousSpeaker = null;

  for (const li of items) {
    const textEl = li.querySelector('div.text');
    const text = textEl ? textEl.textContent.trim() : '';
    if (!text) continue;

    const timeEl = li.querySelector('span.time');
    const time = timeEl ? timeEl.textContent.trim() : '';

    const nameEl = li.querySelector('span.user-name-span');
    let speaker = nameEl ? nameEl.textContent.trim() : '';

    if (!speaker) {
      // Try aria-label first (handles "Doe, Jane" with comma names)
      const aria = li.getAttribute('aria-label');
      const parsed = parseAriaLabel(aria);
      if (parsed && parsed.speaker) {
        speaker = parsed.speaker;
      } else if (previousSpeaker) {
        speaker = previousSpeaker;
      } else {
        speaker = 'Unknown';
      }
    }

    lines.push({ speaker, time, text });
    previousSpeaker = speaker;
  }

  if (lines.length === 0) {
    return { error: 'empty' };
  }

  return { title: getTitle(), lines };
}
