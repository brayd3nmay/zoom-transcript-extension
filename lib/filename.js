const ILLEGAL_CHARS = /[\/\\:*?"<>|]/g;
// Strip non-printable control chars; exclude JS whitespace chars (\x09 \x0A–\x0D \x20)
// so they can be collapsed to a single space in step 4.
const CONTROL_CHARS = /[\x00-\x08\x0E-\x1F\x7F]/g;
const FALLBACK = 'zoom-transcript';
const MAX_BYTES = 200;

export function sanitizeFilename(title) {
  if (typeof title !== 'string') return FALLBACK;

  let s = title;
  // 1. Strip control characters
  s = s.replace(CONTROL_CHARS, '');
  // 2. Replace illegal filesystem chars with -
  s = s.replace(ILLEGAL_CHARS, '-');
  // 3. Collapse runs of -
  s = s.replace(/-{2,}/g, '-');
  // 4. Collapse runs of whitespace
  s = s.replace(/\s+/g, ' ');
  // 5. Trim leading/trailing whitespace, dots, dashes
  s = s.replace(/^[\s.\-]+|[\s.\-]+$/g, '');
  // 6. Cap at 200 UTF-8 bytes, walk back to char boundary
  s = capUtf8Bytes(s, MAX_BYTES);
  // 7. Empty → fallback
  if (s.length === 0) return FALLBACK;

  return s;
}

// Uses TextEncoder/TextDecoder so this works in both Node and browser (extension popup).
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder('utf-8');

function capUtf8Bytes(s, maxBytes) {
  const buf = ENCODER.encode(s);
  if (buf.length <= maxBytes) return s;
  // Walk back from maxBytes to a valid UTF-8 boundary (a byte that is NOT a continuation byte 10xxxxxx)
  let cut = maxBytes;
  while (cut > 0 && (buf[cut] & 0xC0) === 0x80) cut--;
  return DECODER.decode(buf.subarray(0, cut));
}
