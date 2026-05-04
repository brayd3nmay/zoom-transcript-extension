// Synchronous localStorage wrapper for Super Zoom prefs.
// localStorage is per-origin, so prefs are remembered per Zoom subdomain.
//
// All entry points wrap localStorage access in try/catch and silently no-op on
// failure (private mode / quota exceeded must not throw to callers).

const KEY = 'super-zoom:theater';
const SPEED_KEY = 'super-zoom:speed';
const POSITION_KEY_PREFIX = 'super-zoom:pos:';
const POSITION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_SPEED = 16; // Chrome ignores rates outside ~0.0625–16; treat above as missing.

// --- Theater pref (existing) ---

export function getTheaterPref() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setTheaterPref(value) {
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // private mode / quota exceeded — silently ignore
  }
}

// --- Speed pref ---

export function getSpeedPref() {
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

export function setSpeedPref(rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return;
  try {
    localStorage.setItem(SPEED_KEY, String(rate));
  } catch {
    // private mode / quota exceeded — silently ignore
  }
}

// --- Per-video position ---

function isValidEnvelope(obj) {
  return (
    obj != null &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    typeof obj.time === 'number' &&
    Number.isFinite(obj.time) &&
    obj.time >= 0 &&
    typeof obj.savedAt === 'number' &&
    Number.isFinite(obj.savedAt)
  );
}

export function getPosition(id) {
  if (typeof id !== 'string' || id === '') return null;
  const key = POSITION_KEY_PREFIX + id;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      // malformed JSON — GC and return null
      try { localStorage.removeItem(key); } catch {}
      return null;
    }
    if (!isValidEnvelope(obj)) {
      try { localStorage.removeItem(key); } catch {}
      return null;
    }
    if (Date.now() - obj.savedAt > POSITION_TTL_MS) {
      try { localStorage.removeItem(key); } catch {}
      return null;
    }
    return obj.time;
  } catch {
    return null;
  }
}

export function setPosition(id, time) {
  if (typeof id !== 'string' || id === '') return;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) return;
  try {
    localStorage.setItem(POSITION_KEY_PREFIX + id, JSON.stringify({ time, savedAt: Date.now() }));
  } catch {
    // private mode / quota exceeded — silently ignore
  }
}

export function clearPosition(id) {
  if (typeof id !== 'string' || id === '') return;
  try {
    localStorage.removeItem(POSITION_KEY_PREFIX + id);
  } catch {
    // silently ignore
  }
}

export function gcExpiredPositions() {
  let keys;
  try {
    // Snapshot first — mutating localStorage during keyed iteration is unreliable.
    keys = Object.keys(localStorage);
  } catch {
    return;
  }
  const now = Date.now();
  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(POSITION_KEY_PREFIX)) continue;
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
      try { localStorage.removeItem(key); } catch {}
    }
  }
}
