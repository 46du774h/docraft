const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Builds a safe, cross-platform file name (without extension). */
export function safeBaseName(raw: string | undefined, fallback = 'document'): string {
  let s = (raw ?? '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^[.\s-]+|[.\s]+$/g, '');
  if (s.length > 80) s = s.slice(0, 80).replace(/\s+\S*$/, '').trim() || s.slice(0, 80);
  s = s.replace(/\s/g, '-');
  if (!s || RESERVED.test(s)) return fallback;
  return s;
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function buildFilename(title: string | undefined, ext: 'docx' | 'pdf' | 'html', now = new Date()): string {
  return `${safeBaseName(title, `document-${stamp(now)}`)}.${ext}`;
}
