/**
 * Input normalisation. Never changes wording — only line endings, stray control characters,
 * and tab-separated blocks (what browsers put on the clipboard when you copy a rendered table),
 * which are rewritten as Markdown pipe tables so they survive as real tables.
 */

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function normalizeInput(raw: string): string {
  let s = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  // Strip NULs and other C0 controls except tab/newline.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return widenPipeTables(convertTabTables(s));
}

function escapeCell(c: string): string {
  return c.trim().replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function convertTabTables(text: string): string {
  if (!text.includes('\t')) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  let fence: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fm = FENCE_RE.exec(line);
    if (fm) {
      const marker = fm[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      out.push(line);
      i++;
      continue;
    }
    if (fence === null && isTabRow(line)) {
      const cols = line.trim().split('\t').length;
      let j = i;
      while (j < lines.length && isTabRow(lines[j]) && lines[j].trim().split('\t').length === cols) j++;
      const block = lines.slice(i, j);
      if (block.length >= 2 && !looksLikeListWithTabs(block)) {
        if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
        const rows = block.map((l) => l.trim().split('\t').map(escapeCell));
        out.push(`| ${rows[0].join(' | ')} |`);
        out.push(`| ${rows[0].map(() => '---').join(' | ')} |`);
        for (const r of rows.slice(1)) out.push(`| ${r.join(' | ')} |`);
        if (j < lines.length && lines[j].trim() !== '') out.push('');
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

function isTabRow(line: string): boolean {
  if (line.startsWith('\t')) return false; // indented code / nested content
  const t = line.trim();
  return t.includes('\t') && t.split('\t').length >= 2;
}

function looksLikeListWithTabs(block: string[]): boolean {
  return block.every((l) => /^(\d+[.)]|[-*•])$/.test(l.trim().split('\t')[0].trim()));
}

/* ------------------------------------------------------------------ */
/* Pipe tables whose body rows are wider than the header               */
/* ------------------------------------------------------------------ */

const SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/);
}

/**
 * GitHub-flavoured Markdown drops body cells beyond the header's column count.
 * To keep every cell, extra empty header/separator columns are added when a body row is wider.
 */
function widenPipeTables(text: string): string {
  if (!text.includes('|')) return text;
  const lines = text.split('\n');
  let fence: string | null = null;
  for (let i = 0; i < lines.length - 1; i++) {
    const fm = FENCE_RE.exec(lines[i]);
    if (fm) {
      const marker = fm[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const head = lines[i];
    const sep = lines[i + 1];
    if (!head.includes('|') || !sep.includes('|') || !sep.includes('-') || !SEP_RE.test(sep)) continue;
    const headCols = splitRow(head).length;
    if (headCols !== splitRow(sep).length) continue; // malformed: leave as text
    let j = i + 2;
    let maxCols = headCols;
    while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
      maxCols = Math.max(maxCols, splitRow(lines[j]).length);
      j++;
    }
    if (maxCols > headCols) {
      const extra = maxCols - headCols;
      const trailing = (l: string) => (l.trimEnd().endsWith('|') ? l.trimEnd() : l.trimEnd() + ' |');
      lines[i] = trailing(head) + '  |'.repeat(extra);
      lines[i + 1] = trailing(sep) + ' --- |'.repeat(extra);
    }
    i = j - 1;
  }
  return lines.join('\n');
}
