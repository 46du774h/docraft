
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
 *
 * Features:
 * - Markdown headings, paragraphs, lists, tables, blockquotes and code.
 * - Bold, italic, strikethrough, links and inline code.
 * - LaTeX math protection for:
 *     \[ ... \]       display math
 *     \\[ ... \\]     display math with doubled backslashes
 *     $$ ... $$       display math
 *     \( ... \)       inline math
 *     \\( ... \\)     inline math with doubled backslashes
 *     $ ... $         inline math
 * - HTML is not interpreted as markup.
 * - Link targets are validated through safeUrl().
 *
 * Math is preserved as text in the document model. The preview/export
 * layers can then render the math using KaTeX or another math renderer.
 */

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

export interface ParseOptions {
  /** Treat a short, unpunctuated first line as the document title when no headings exist. */
  detectPlainTitle?: boolean;
}

interface Ctx {
  warnings: string[];
  lines: string[];
}

interface MathEntry {
  tex: string;
  displayMath: boolean;
}

type MathMap = Map<string, MathEntry>;

const MATH_TOKEN_PREFIX = 'DOCraftMATH';
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function parseDocument(
  source: string,
  options: ParseOptions = {},
): ParsedDocument {
  const { detectPlainTitle = true } = options;
  const normalized = normalizeInput(source);
  const ctx: Ctx = {
    warnings: [],
    lines: normalized.split('\n'),
  };

  const mathMap: MathMap = new Map();
  const protectedSource = protectMath(normalized, mathMap);

  let blocks: Block[] = [];

  if (protectedSource.trim() !== '') {
    const tokens = md.parse(protectedSource, {});
    const cursor = { n: 0 };

    blocks = parseBlocks(tokens, cursor, undefined, ctx, mathMap);
  }

  if (detectPlainTitle) {
    blocks = promotePlainTitle(blocks);
  }

  applyQa(blocks);

  const firstHeading = findFirstHeading(blocks);

  return {
    source,
    normalized,
    blocks,
    title: firstHeading
      ? runsText(firstHeading).trim() || undefined
      : undefined,
    stats: computeStats(source, blocks),
    warnings: ctx.warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Math protection                                                     */
/* ------------------------------------------------------------------ */

/**
 * Replaces math expressions with plain-text tokens before Markdown parsing.
 * Fenced code blocks are left untouched so code examples remain code.
 */
function protectMath(input: string, mathMap: MathMap): string {
  const lines = input.split('\n');
  const output: string[] = [];
  let outsideLines: string[] = [];
  let fenceMarker: string | null = null;

  const flushOutsideLines = () => {
    if (outsideLines.length === 0) return;

    const protectedChunk = protectMathChunk(
      outsideLines.join('\n'),
      mathMap,
    );

    output.push(...protectedChunk.split('\n'));
    outsideLines = [];
  };

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line);

    if (fenceMarker === null && fenceMatch) {
      flushOutsideLines();
      output.push(line);
      fenceMarker = fenceMatch[1][0];
      continue;
    }

    if (fenceMarker !== null) {
      output.push(line);

      if (
        fenceMatch &&
        fenceMatch[1][0] === fenceMarker
      ) {
        fenceMarker = null;
      }

      continue;
    }

    outsideLines.push(line);
  }

  flushOutsideLines();

  return output.join('\n');
}

/** Protect math delimiters within a Markdown section outside fenced code. */
function protectMathChunk(
  input: string,
  mathMap: MathMap,
): string {
  let counter = mathMap.size;

  const makeToken = (
    tex: string,
    displayMath: boolean,
    doubledSlashes: boolean,
  ): string => {
    const token = `${MATH_TOKEN_PREFIX}${counter++}TOKEN`;

    mathMap.set(token, {
      tex: (doubledSlashes ? tex.replace(/\\\\/g, '\\') : tex).trim(),
      displayMath,
    });

    return token;
  };

  let result = input;

  // Display math: \[ ... \] or \\[ ... \\]
  result = result.replace(
    /(\\\\|\\)\[([\s\S]*?)(\\\\|\\)\]/g,
    (_match, open: string, tex: string, close: string) =>
      makeToken(tex, true, open.length === 2 || close.length === 2),
  );

  // Display math: $$ ... $$
  result = result.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_match, tex: string) => makeToken(tex, true, false),
  );

  // Inline math: \( ... \) or \\( ... \\)
  result = result.replace(
    /(\\\\|\\)\(([\s\S]*?)(\\\\|\\)\)/g,
    (_match, open: string, tex: string, close: string) =>
      makeToken(tex, false, open.length === 2 || close.length === 2),
  );

  // Inline math: $ ... $
  // Avoid escaped dollar signs and double-dollar delimiters.
  result = result.replace(
    /(^|[^\\$])\$([^$\n]+)\$(?!\$)/g,
    (_match, prefix: string, tex: string) =>
      `${prefix}${makeToken(tex, false, false)}`,
  );

  return result;
}

/* ------------------------------------------------------------------ */
/* Block level                                                         */
/* ------------------------------------------------------------------ */

function parseBlocks(
  tokens: Token[],
  cur: { n: number },
  stopType: string | undefined,
  ctx: Ctx,
  mathMap: MathMap,
): Block[] {
  const blocks: Block[] = [];

  while (cur.n < tokens.length) {
    const t = tokens[cur.n];

    if (stopType && t.type === stopType) {
      return blocks;
    }

    switch (t.type) {
      case 'heading_open': {
        const inline = tokens[cur.n + 1];

        const level = Math.min(
          6,
          Math.max(1, parseInt(t.tag.slice(1), 10) || 1),
        ) as 1 | 2 | 3 | 4 | 5 | 6;

        blocks.push({
          type: 'heading',
          level,
          runs: parseInline(inline.children ?? [], mathMap),
        });

        cur.n += 3;
        break;
      }

      case 'paragraph_open': {
        const inline = tokens[cur.n + 1];

        checkMalformedTable(t, inline, ctx);

        blocks.push({
          type: 'paragraph',
          runs: parseInline(inline.children ?? [], mathMap),
        });

        cur.n += 3;
        break;
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = t.type === 'ordered_list_open';
        const startAttr = t.attrGet('start');

        const start =
          startAttr != null
            ? Math.max(0, parseInt(String(startAttr), 10) || 1)
            : 1;

        const closeType = ordered
          ? 'ordered_list_close'
          : 'bullet_list_close';

        cur.n++;

        const items: ListItem[] = [];

        while (
          cur.n < tokens.length &&
          tokens[cur.n].type !== closeType
        ) {
          if (tokens[cur.n].type === 'list_item_open') {
            cur.n++;

            const inner = parseBlocks(
              tokens,
              cur,
              'list_item_close',
              ctx,
              mathMap,
            );

            cur.n++; // list_item_close

            items.push(toListItem(inner));
          } else {
            cur.n++;
          }
        }

        cur.n++; // list close

        blocks.push({
          type: 'list',
          ordered,
          start,
          items,
        });

        break;
      }

      case 'blockquote_open': {
        cur.n++;

        const inner = parseBlocks(
          tokens,
          cur,
          'blockquote_close',
          ctx,
          mathMap,
        );

        cur.n++;

        // BlockquoteBlock requires nested blocks, not inline runs.
        blocks.push({
          type: 'blockquote',
          blocks: inner,
        });

        break;
      }

      case 'fence':
      case 'code_block': {
        const lang =
          t.type === 'fence'
            ? (t.info.trim().split(/\s+/)[0] ?? '')
            : '';

        blocks.push({
          type: 'code',
          lang,
          text: t.content.replace(/\n$/, ''),
        });

        cur.n++;
        break;
      }

      case 'hr': {
        blocks.push({ type: 'hr' });
        cur.n++;
        break;
      }

      case 'table_open': {
        blocks.push(parseTable(tokens, cur, mathMap));
        break;
      }

      default: {
        // Unknown block token: skip it but never loop forever.
        cur.n++;
      }
    }
  }

  return blocks;
}

function toListItem(inner: Block[]): ListItem {
  if (inner.length > 0 && inner[0].type === 'paragraph') {
    return {
      runs: inner[0].runs,
      children: inner.slice(1),
    };
  }

  return {
    runs: [],
    children: inner,
  };
}

function parseTable(
  tokens: Token[],
  cur: { n: number },
  mathMap: MathMap,
): TableBlock {
  cur.n++; // table_open

  let inHead = false;
  let row: TableCell[] = [];
  let rowAlign: Align[] = [];
  let header: TableCell[] = [];

  const rows: TableCell[][] = [];
  let align: Align[] = [];

  while (
    cur.n < tokens.length &&
    tokens[cur.n].type !== 'table_close'
  ) {
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
        } else {
          rows.push(row);
        }
        break;

      case 'th_open':
      case 'td_open': {
        const style = String(t.attrGet('style') ?? '');
        const match = /text-align:\s*(left|center|right)/.exec(style);
        const inline = tokens[cur.n + 1];

        row.push({
          runs: expandBreaks(
            parseInline(inline?.children ?? [], mathMap),
          ),
        });

        rowAlign.push((match?.[1] as Align) ?? null);
        break;
      }

      default:
        break;
    }

    cur.n++;
  }

  cur.n++; // table_close

  const columnCount = Math.max(
    header.length,
    ...rows.map((r) => r.length),
    0,
  );

  const pad = (cells: TableCell[]): TableCell[] => {
    const copy = cells.slice();

    while (copy.length < columnCount) {
      copy.push({ runs: [] });
    }

    return copy;
  };

  const fullAlign: Align[] = Array.from(
    { length: columnCount },
    (_, i) => align[i] ?? null,
  );

  return {
    type: 'table',
    align: fullAlign,
    header: pad(header),
    rows: rows.map(pad),
    columnCount,
  };
}

const SEPARATOR_LINE =
  /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Flags pipe-table lookalikes that MarkdownIt did not accept. */
function checkMalformedTable(
  open: Token,
  inline: Token,
  ctx: Ctx,
): void {
  const lines = (inline.content ?? '').split('\n');

  if (lines.length < 2) return;

  const pipeLines = lines.filter((line) => line.includes('|')).length;

  if (pipeLines < 2) return;

  const hasSeparator = lines.some(
    (line) =>
      line.includes('-') &&
      line.includes('|') &&
      SEPARATOR_LINE.test(line),
  );

  const allStartWithPipe = lines.every(
    (line) => line.trim().startsWith('|'),
  );

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

export function parseInline(
  children: Token[],
  mathMap: MathMap = new Map(),
): Run[] {
  const runs: Run[] = [];

  let bold = 0;
  let italic = 0;
  let strike = 0;

  const hrefStack: (string | undefined)[] = [];

  const push = (
    text: string,
    extra: Partial<Run> = {},
  ) => {
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

  /**
   * Converts protected math tokens back into math runs.
   * Any surrounding ordinary text retains its current inline formatting.
   */
  const pushWithMath = (text: string) => {
    const tokenPattern = /DOCraftMATH\d+TOKEN/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        push(text.slice(lastIndex, match.index));
      }

      const entry = mathMap.get(match[0]);

      if (entry) {
        push(entry.tex, {
          math: true,
          displayMath: entry.displayMath,
        });
      } else {
        push(match[0]);
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      push(text.slice(lastIndex));
    }
  };

  for (const t of children) {
    switch (t.type) {
      case 'text':
        pushWithMath(t.content);
        break;

      case 'code_inline':
        // Math delimiters inside inline code must remain literal.
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
        hrefStack.push(
          safeUrl(String(t.attrGet('href') ?? '')) ?? undefined,
        );
        break;

      case 'link_close':
        hrefStack.pop();
        break;

      case 'image': {
        const alt = (
          t.children
            ? t.children.map((child) => child.content).join('')
            : t.content
        ).trim();

        push(
          alt ? `[Image: ${alt}]` : '[Image]',
          { italic: true },
        );

        break;
      }

      default:
        if (t.content) {
          pushWithMath(t.content);
        }
    }
  }

  return mergeRuns(runs);
}

function sameFormat(a: Run, b: Run): boolean {
  return (
    !a.br &&
    !b.br &&
    !a.math &&
    !b.math &&
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.strike === !!b.strike &&
    !!a.code === !!b.code &&
    a.href === b.href
  );
}

function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];

  for (const run of runs) {
    const last = out[out.length - 1];

    if (last && sameFormat(last, run)) {
      last.text += run.text;
    } else {
      out.push({ ...run });
    }
  }

  return out;
}

/** In table cells, <br> is the conventional way to write a line break. */
function expandBreaks(runs: Run[]): Run[] {
  const out: Run[] = [];

  for (const run of runs) {
    if (
      run.br ||
      run.code ||
      run.math ||
      !/<br\s*\/?>/i.test(run.text)
    ) {
      out.push(run);
      continue;
    }

    const parts = run.text.split(/<br\s*\/?>/i);

    parts.forEach((part, i) => {
      if (part) {
        out.push({ ...run, text: part });
      }

      if (i < parts.length - 1) {
        out.push({ text: '', br: true });
      }
    });
  }

  return mergeRuns(out);
}

/* ------------------------------------------------------------------ */
/* Post-processing                                                     */
/* ------------------------------------------------------------------ */

/** If a document has no headings, a short unpunctuated first paragraph is shown as its title. */
function promotePlainTitle(blocks: Block[]): Block[] {
  if (
    blocks.length < 2 ||
    blocks.some((block) => block.type === 'heading')
  ) {
    return blocks;
  }

  const first = blocks[0];

  if (first.type !== 'paragraph') return blocks;
  if (first.runs.some((run) => run.br)) return blocks;

  const text = runsText(first.runs).trim();

  if (text.length === 0 || text.length > 90) return blocks;
  if (/[.:;,!?…。！？]$/.test(text)) return blocks;
  if (first.runs.some((run) => run.href)) return blocks;
  if (/^(Q|Question)\s*\d*\s*[:.)]/i.test(text)) return blocks;

  return [
    { type: 'heading', level: 1, runs: first.runs },
    ...blocks.slice(1),
  ];
}

const Q_RE = /^(\s*)((?:Q|Question)\s*\d*\s*[:.)])(\s*)/i;
const A_RE = /^(\s*)((?:A|Answer)\s*\d*\s*:)(\s*)/i;

/** Marks Q:/A: style paragraphs and bolds their labels. */
function applyQa(blocks: Block[]): void {
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      markQa(block);
    } else if (block.type === 'blockquote') {
      applyQa(block.blocks);
    } else if (block.type === 'list') {
      if (block.ordered) {
        for (const item of block.items) {
          markListLabel(item);
        }
      }

      for (const item of block.items) {
        applyQa(item.children);
      }
    }
  }
}

/** Makes numbered-list lead terms scannable while preserving the original text. */
function markListLabel(item: ListItem): void {
  const first = item.runs[0];

  if (
    !first ||
    first.br ||
    first.bold ||
    first.italic ||
    first.code ||
    first.math ||
    first.href
  ) {
    return;
  }

  const separator =
    /^(.{2,80}?)(\s*[:\-–—])(\s+)/.exec(first.text);

  const fullItem =
    item.children.length === 0 &&
    item.runs.length === 1 &&
    first.text.length <= 100 &&
    !/[.!?]$/.test(first.text.trim());

  const length = separator
    ? separator[1].length
    : fullItem
      ? first.text.length
      : 0;

  if (length === 0) return;

  const label = first.text.slice(0, length);
  const rest = first.text.slice(length);

  item.runs = [
    { ...first, text: label, bold: true },
    ...(rest ? [{ ...first, text: rest }] : []),
    ...item.runs.slice(1),
  ];
}

function markQa(p: ParagraphBlock): void {
  const first = p.runs[0];

  if (
    !first ||
    first.br ||
    first.bold ||
    first.code ||
    first.math ||
    first.href
  ) {
    return;
  }

  const q = Q_RE.exec(first.text);
  const a = q ? null : A_RE.exec(first.text);
  const match = q ?? a;

  if (!match) return;

  const label = match[1] + match[2];
  const rest = first.text.slice(label.length);

  if (rest.trim() === '' && p.runs.length === 1) {
    return;
  }

  const newRuns: Run[] = [{ text: label, bold: true }];

  if (rest) {
    newRuns.push({ ...first, text: rest });
  }

  p.runs = [...newRuns, ...p.runs.slice(1)];
  p.qa = q ? 'question' : 'answer';
}

function findFirstHeading(blocks: Block[]): Run[] | null {
  for (const block of blocks) {
    if (block.type === 'heading') {
      return block.runs;
    }
  }

  return null;
}

function computeStats(source: string, blocks: Block[]): DocStats {
  const stats: DocStats = {
    words: 0,
    chars: source.length,
    headings: 0,
    paragraphs: 0,
    lists: 0,
    tables: 0,
    codeBlocks: 0,
    quotes: 0,
  };

  const trimmed = source.trim();

  stats.words =
    trimmed === '' ? 0 : trimmed.split(/\s+/).length;

  const walk = (items: Block[]) => {
    for (const block of items) {
      switch (block.type) {
        case 'heading':
          stats.headings++;
          break;

        case 'paragraph':
          stats.paragraphs++;
          break;

        case 'list':
          stats.lists++;

          for (const item of block.items) {
            walk(item.children);
          }

          break;

        case 'table':
          stats.tables++;
          break;

        case 'code':
          stats.codeBlocks++;
          break;

        case 'blockquote':
          stats.quotes++;
          walk(block.blocks);
          break;

        default:
          break;
      }
    }
  };

  walk(blocks);

  return stats;
}

/** Quick stats used for live counters without a full parse. */
export function countText(
  source: string,
): { chars: number; words: number } {
  const trimmed = source.trim();

  return {
    chars: source.length,
    words:
      trimmed === '' ? 0 : trimmed.split(/\s+/).length,
  };
}
