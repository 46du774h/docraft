import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import { normalizeInput } from './normalize';
import { safeUrl } from './url';
import { runsText } from './columns';
import type {
  Align,
  Block,
  DocStats,
  ListItem,
  ParagraphBlock,
  ParsedDocument,
  Run,
  TableBlock,
  TableCell,
} from './types';

/**
 * Deterministic text → document-model parser.
 *  - `html: false`: raw HTML in the input is treated as literal text, never as markup.
 *  - No content is rewritten; unknown constructs fall through as paragraphs.
 *  - Link targets are validated (see url.ts).
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });

export interface ParseOptions {
  /** Treat a short, unpunctuated first line as the document title when no headings exist. */
  detectPlainTitle?: boolean;
}

interface Ctx {
  warnings: string[];
  lines: string[];
}

export function parseDocument(source: string, options: ParseOptions = {}): ParsedDocument {
  const { detectPlainTitle = true } = options;
  const normalized = normalizeInput(source);
  const ctx: Ctx = { warnings: [], lines: normalized.split('\n') };

  let blocks: Block[] = [];
  if (normalized.trim() !== '') {
    const tokens = md.parse(normalized, {});
    const cursor = { n: 0 };
    blocks = parseBlocks(tokens, cursor, undefined, ctx);
  }

  if (detectPlainTitle) blocks = promotePlainTitle(blocks);
  applyQa(blocks);

  const firstHeading = findFirstHeading(blocks);
  return {
    source,
    normalized,
    blocks,
    title: firstHeading ? runsText(firstHeading).trim() || undefined : undefined,
    stats: computeStats(source, blocks),
    warnings: ctx.warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Block level                                                         */
/* ------------------------------------------------------------------ */

function parseBlocks(tokens: Token[], cur: { n: number }, stopType: string | undefined, ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  while (cur.n < tokens.length) {
    const t = tokens[cur.n];
    if (stopType && t.type === stopType) return blocks;

    switch (t.type) {
      case 'heading_open': {
        const inline = tokens[cur.n + 1];
        const level = Math.min(6, Math.max(1, parseInt(t.tag.slice(1), 10) || 1)) as 1 | 2 | 3 | 4 | 5 | 6;
        blocks.push({ type: 'heading', level, runs: parseInline(inline.children ?? []) });
        cur.n += 3;
        break;
      }
      case 'paragraph_open': {
        const inline = tokens[cur.n + 1];
        checkMalformedTable(t, inline, ctx);
        blocks.push({ type: 'paragraph', runs: parseInline(inline.children ?? []) });
        cur.n += 3;
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = t.type === 'ordered_list_open';
        const startAttr = t.attrGet('start');
        const start = startAttr != null ? Math.max(0, parseInt(String(startAttr), 10) || 1) : 1;
        const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close';
        cur.n++;
        const items: ListItem[] = [];
        while (cur.n < tokens.length && tokens[cur.n].type !== closeType) {
          if (tokens[cur.n].type === 'list_item_open') {
            cur.n++;
            const inner = parseBlocks(tokens, cur, 'list_item_close', ctx);
            cur.n++; // list_item_close
            items.push(toListItem(inner));
          } else {
            cur.n++;
          }
        }
        cur.n++; // list close
        blocks.push({ type: 'list', ordered, start, items });
        break;
      }
      case 'blockquote_open': {
        cur.n++;
        const inner = parseBlocks(tokens, cur, 'blockquote_close', ctx);
        cur.n++;
        blocks.push({ type: 'blockquote', blocks: inner });
        break;
      }
      case 'fence':
      case 'code_block': {
        const lang = t.type === 'fence' ? (t.info.trim().split(/\s+/)[0] ?? '') : '';
        blocks.push({ type: 'code', lang, text: t.content.replace(/\n$/, '') });
        cur.n++;
        break;
      }
      case 'hr':
        blocks.push({ type: 'hr' });
        cur.n++;
        break;
      case 'table_open':
        blocks.push(parseTable(tokens, cur));
        break;
      default:
        // Unknown block token: skip it but never loop forever.
        cur.n++;
    }
  }
  return blocks;
}

function toListItem(inner: Block[]): ListItem {
  if (inner.length > 0 && inner[0].type === 'paragraph') {
    return { runs: inner[0].runs, children: inner.slice(1) };
  }
  return { runs: [], children: inner };
}

function parseTable(tokens: Token[], cur: { n: number }): TableBlock {
  cur.n++; // table_open
  let inHead = false;
  let row: TableCell[] = [];
  let rowAlign: Align[] = [];
  let header: TableCell[] = [];
  const rows: TableCell[][] = [];
  let align: Align[] = [];

  while (cur.n < tokens.length && tokens[cur.n].type !== 'table_close') {
    const t = tokens[cur.n];
    switch (t.type) {
      case 'thead_open':
        inHead = true;
        break;
      case 'thead_close':
        inHead = false;
        break;
      case 'tr_open':
        row = [];
        rowAlign = [];
        break;
      case 'tr_close':
        if (inHead) {
          header = row;
          align = rowAlign;
        } else rows.push(row);
        break;
      case 'th_open':
      case 'td_open': {
        const style = String(t.attrGet('style') ?? '');
        const m = /text-align:\s*(left|center|right)/.exec(style);
        const inline = tokens[cur.n + 1];
        row.push({ runs: expandBreaks(parseInline(inline?.children ?? [])) });
        rowAlign.push((m?.[1] as Align) ?? null);
        break;
      }
      default:
        break;
    }
    cur.n++;
  }
  cur.n++; // table_close

  const columnCount = Math.max(header.length, ...rows.map((r) => r.length), 0);
  const pad = (r: TableCell[]) => {
    const copy = r.slice();
    while (copy.length < columnCount) copy.push({ runs: [] });
    return copy;
  };
  const fullAlign: Align[] = Array.from({ length: columnCount }, (_, i) => align[i] ?? null);
  return {
    type: 'table',
    align: fullAlign,
    header: pad(header),
    rows: rows.map(pad),
    columnCount,
  };
}

const SEPARATOR_LINE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Flags pipe-table lookalikes that markdown-it did not accept; they are kept verbatim as text. */
function checkMalformedTable(open: Token, inline: Token, ctx: Ctx): void {
  const lines = (inline.content ?? '').split('\n');
  if (lines.length < 2) return;
  const pipeLines = lines.filter((l) => l.includes('|')).length;
  if (pipeLines < 2) return;
  const hasSeparator = lines.some((l) => l.includes('-') && l.includes('|') && SEPARATOR_LINE.test(l));
  const allStartWithPipe = lines.every((l) => l.trim().startsWith('|'));
  const startLine = (open.map?.[0] ?? 0) + 1;
  if (hasSeparator) {
    ctx.warnings.push(
      `Lines ${startLine}–${startLine + lines.length - 1} look like a table, but the header and separator rows don't match. They were kept as plain text.`,
    );
  } else if (allStartWithPipe) {
    ctx.warnings.push(
      `Lines ${startLine}–${startLine + lines.length - 1} look like table rows but have no separator row (| --- | --- |). They were kept as plain text.`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Inline level                                                        */
/* ------------------------------------------------------------------ */

export function parseInline(children: Token[]): Run[] {
  const runs: Run[] = [];
  let bold = 0;
  let italic = 0;
  let strike = 0;
  const hrefStack: (string | undefined)[] = [];

  const push = (text: string, extra: Partial<Run> = {}) => {
    if (text === '') return;
    const run: Run = { text };
    if (bold) run.bold = true;
    if (italic) run.italic = true;
    if (strike) run.strike = true;
    const href = hrefStack[hrefStack.length - 1];
    if (href) run.href = href;
    Object.assign(run, extra);
    runs.push(run);
  };

  for (const t of children) {
    switch (t.type) {
      case 'text':
        push(t.content);
        break;
      case 'code_inline':
        push(t.content, { code: true });
        break;
      case 'softbreak':
      case 'hardbreak':
        runs.push({ text: '', br: true });
        break;
      case 'strong_open':
        bold++;
        break;
      case 'strong_close':
        bold = Math.max(0, bold - 1);
        break;
      case 'em_open':
        italic++;
        break;
      case 'em_close':
        italic = Math.max(0, italic - 1);
        break;
      case 's_open':
        strike++;
        break;
      case 's_close':
        strike = Math.max(0, strike - 1);
        break;
      case 'link_open':
        hrefStack.push(safeUrl(String(t.attrGet('href') ?? '')) ?? undefined);
        break;
      case 'link_close':
        hrefStack.pop();
        break;
      case 'image': {
        const alt = (t.children ? t.children.map((c) => c.content).join('') : t.content).trim();
        push(alt ? `[Image: ${alt}]` : '[Image]', { italic: true });
        break;
      }
      default:
        if (t.content) push(t.content);
    }
  }
  return mergeRuns(runs);
}

function sameFormat(a: Run, b: Run): boolean {
  return (
    !a.br && !b.br &&
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.strike === !!b.strike &&
    !!a.code === !!b.code &&
    a.href === b.href
  );
}

function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && sameFormat(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

/** In table cells, `<br>` is the conventional (and only) way to write a line break. */
function expandBreaks(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (r.br || r.code || !/<br\s*\/?>/i.test(r.text)) {
      out.push(r);
      continue;
    }
    const parts = r.text.split(/<br\s*\/?>/i);
    parts.forEach((p, i) => {
      if (p) out.push({ ...r, text: p });
      if (i < parts.length - 1) out.push({ text: '', br: true });
    });
  }
  return mergeRuns(out);
}

/* ------------------------------------------------------------------ */
/* Post-processing                                                     */
/* ------------------------------------------------------------------ */

/** If a doc has no headings, a short unpunctuated first paragraph is shown as its title. */
function promotePlainTitle(blocks: Block[]): Block[] {
  if (blocks.length < 2 || blocks.some((b) => b.type === 'heading')) return blocks;
  const first = blocks[0];
  if (first.type !== 'paragraph') return blocks;
  if (first.runs.some((r) => r.br)) return blocks;
  const text = runsText(first.runs).trim();
  if (text.length === 0 || text.length > 90) return blocks;
  if (/[.:;,!?…。！？]$/.test(text)) return blocks;
  if (first.runs.some((r) => r.href)) return blocks;
  if (/^(Q|Question)\s*\d*\s*[:.)]/i.test(text)) return blocks;
  return [{ type: 'heading', level: 1, runs: first.runs }, ...blocks.slice(1)];
}

const Q_RE = /^(\s*)((?:Q|Question)\s*\d*\s*[:.)])(\s*)/i;
const A_RE = /^(\s*)((?:A|Answer)\s*\d*\s*:)(\s*)/i;

/** Marks "Q:/A:" style paragraphs and bolds their labels (text is preserved exactly). */
function applyQa(blocks: Block[]): void {
  for (const b of blocks) {
    if (b.type === 'paragraph') markQa(b);
    else if (b.type === 'blockquote') applyQa(b.blocks);
    else if (b.type === 'list') {
      if (b.ordered) for (const it of b.items) markListLabel(it);
      for (const it of b.items) applyQa(it.children);
    }
  }
}

/** Makes numbered-list lead terms scannable while preserving the original text. */
function markListLabel(item: ListItem): void {
  const first = item.runs[0];
  if (!first || first.br || first.bold || first.italic || first.code || first.href) return;
  const separator = /^(.{2,80}?)(\s*[:\-–—])(\s+)/.exec(first.text);
  const fullItem = item.children.length === 0 && item.runs.length === 1 && first.text.length <= 100 && !/[.!?]$/.test(first.text.trim());
  const length = separator ? separator[1].length : fullItem ? first.text.length : 0;
  if (length === 0) return;
  const label = first.text.slice(0, length);
  const rest = first.text.slice(length);
  item.runs = [{ ...first, text: label, bold: true }, ...(rest ? [{ ...first, text: rest }] : []), ...item.runs.slice(1)];
}

function markQa(p: ParagraphBlock): void {
  const first = p.runs[0];
  if (!first || first.br || first.bold || first.code || first.href) return;
  const q = Q_RE.exec(first.text);
  const a = q ? null : A_RE.exec(first.text);
  const m = q ?? a;
  if (!m) return;
  const label = m[1] + m[2];
  const rest = first.text.slice(label.length);
  if (rest.trim() === '' && p.runs.length === 1) return;
  const newRuns: Run[] = [{ text: label, bold: true }];
  if (rest) newRuns.push({ ...first, text: rest });
  p.runs = [...newRuns, ...p.runs.slice(1)];
  p.qa = q ? 'question' : 'answer';
}

function findFirstHeading(blocks: Block[]): Run[] | null {
  for (const b of blocks) {
    if (b.type === 'heading') return b.runs;
  }
  return null;
}

function computeStats(source: string, blocks: Block[]): DocStats {
  const stats: DocStats = { words: 0, chars: source.length, headings: 0, paragraphs: 0, lists: 0, tables: 0, codeBlocks: 0, quotes: 0 };
  const trimmed = source.trim();
  stats.words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      switch (b.type) {
        case 'heading': stats.headings++; break;
        case 'paragraph': stats.paragraphs++; break;
        case 'list': stats.lists++; for (const it of b.items) walk(it.children); break;
        case 'table': stats.tables++; break;
        case 'code': stats.codeBlocks++; break;
        case 'blockquote': stats.quotes++; walk(b.blocks); break;
        default: break;
      }
    }
  };
  walk(blocks);
  return stats;
}

/** Quick stats used for live counters without a full parse. */
export function countText(source: string): { chars: number; words: number } {
  const t = source.trim();
  return { chars: source.length, words: t === '' ? 0 : t.split(/\s+/).length };
}
