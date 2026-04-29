import { buildMarkdown } from './markdown.js';
import { sanitizeFilename } from './filename.js';

const BLOB_REVOKE_DELAY_MS = 1000;

export function triggerDownload({ markdown, filename }) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_DELAY_MS);
}

export function downloadTranscript({ title, lines }) {
  const markdown = buildMarkdown({ title, lines });
  const filename = sanitizeFilename(title) + '.md';
  triggerDownload({ markdown, filename });
}
