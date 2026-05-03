// Synchronous localStorage wrapper for the theater-mode preference.
// localStorage is per-origin, so the pref is remembered per Zoom subdomain.

const KEY = 'super-zoom:theater';

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
