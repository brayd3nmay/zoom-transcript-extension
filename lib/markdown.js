export function buildMarkdown({ title, lines }) {
  const out = [`# ${escapeTitle(title)}`];

  if (!Array.isArray(lines) || lines.length === 0) {
    return out.join('\n') + '\n';
  }

  let currentSpeaker = null;
  let paragraph = [];

  const flush = () => {
    if (paragraph.length > 0) {
      out.push('');
      out.push(paragraph.join(' '));
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (line.speaker !== currentSpeaker) {
      flush();
      out.push('');
      out.push(`## ${line.speaker} — ${line.time}`);
      currentSpeaker = line.speaker;
      paragraph.push(escapeBody(line.text, /* isFirstInPara */ true));
    } else {
      paragraph.push(escapeBody(line.text, false));
    }
  }
  flush();

  return out.join('\n') + '\n';
}

function escapeTitle(title) {
  return String(title).replace(/[\[\]\*_`]/g, (m) => '\\' + m);
}

function escapeBody(text, isFirstInPara) {
  let s = String(text).replace(/`/g, "'");
  if (isFirstInPara) {
    s = s.replace(/^(\s*)([#\->*]|\d+[.)])/, (_, ws, marker) => `${ws}\\${marker}`);
  }
  return s;
}
