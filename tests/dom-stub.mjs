// Tiny DOM + HTMLVideoElement stub for unit-testing lib/playback.js in plain
// node. Not a general-purpose JSDOM substitute — only what playback.js touches.

export class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.children = [];
    this._listeners = new Map();
    this._attrs = new Map();
    this._parent = null;
  }
  setAttribute(k, v) { this._attrs.set(k, String(v)); }
  getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
  hasAttribute(k) { return this._attrs.has(k); }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }
  dispatchEvent(ev) {
    const set = this._listeners.get(ev.type);
    if (!set) return;
    for (const fn of [...set]) fn(ev);
  }
  appendChild(child) {
    if (child._parent) child.remove();
    child._parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (!this._parent) return;
    const i = this._parent.children.indexOf(this);
    if (i >= 0) this._parent.children.splice(i, 1);
    this._parent = null;
  }
  click() { this.dispatchEvent({ type: 'click' }); }
}

export function createFakeDocument() {
  const body = new FakeElement('body');
  const findById = (el, id) => {
    if (el.id === id) return el;
    for (const c of el.children) {
      const found = findById(c, id);
      if (found) return found;
    }
    return null;
  };
  return {
    body,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => findById(body, id),
  };
}

// Minimal HTMLVideoElement stand-in. Implements the surface playback.js uses:
// addEventListener / removeEventListener, currentTime, duration, paused,
// playbackRate, readyState, play(), pause(). Tests dispatch events via
// `fire(type)`.
export class FakeVideo {
  constructor(opts = {}) {
    this.readyState = opts.readyState ?? 0;
    this.duration = opts.duration ?? NaN;
    this.currentTime = opts.currentTime ?? 0;
    this.paused = opts.paused ?? true;
    this.playbackRate = opts.playbackRate ?? 1;
    this._listeners = new Map();
  }
  addEventListener(type, fn, options) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push({ fn, once: !!(options && options.once) });
  }
  removeEventListener(type, fn) {
    const arr = this._listeners.get(type);
    if (!arr) return;
    const i = arr.findIndex((e) => e.fn === fn);
    if (i >= 0) arr.splice(i, 1);
  }
  fire(type) {
    const arr = this._listeners.get(type);
    if (!arr) return;
    for (const entry of [...arr]) {
      entry.fn({ type });
      if (entry.once) {
        const i = arr.indexOf(entry);
        if (i >= 0) arr.splice(i, 1);
      }
    }
  }
  listenerCount(type) {
    return this._listeners.get(type)?.length ?? 0;
  }
}
