import { computeColumnWidths } from '../core/columns';
import { pageGeometry, pdfFontGroup, tableFontSize, themeFor } from '../core/settings';
import type { Settings, Theme } from '../core/settings';
import type { Align, Block, ListBlock, ParsedDocument, Run, TableBlock } from '../core/types';
import { inDejaVuSans, inDejaVuSerif, inRoboto } from './glyphCoverage';
import type { FontLoader } from './fontLoader';

/* eslint-disable @typescript-eslint/no-explicit-any */

const FONT_FILES = {
  Carlito: { normal: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf', italics: 'Carlito-Italic.ttf', bolditalics: 'Carlito-BoldItalic.ttf' },
  Sans: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
  Serif: { normal: 'DejaVuSerif.ttf', bold: 'DejaVuSerif-Bold.ttf', italics: 'DejaVuSerif-Italic.ttf', bolditalics: 'DejaVuSerif-BoldItalic.ttf' },
  Fallback: { normal: 'DejaVuSans.ttf', bold: 'DejaVuSans-Bold.ttf', italics: 'DejaVuSans-Oblique.ttf', bolditalics: 'DejaVuSans-BoldOblique.ttf' },
  Mono: { normal: 'DejaVuSansMono.ttf', bold: 'DejaVuSansMono-Bold.ttf', italics: 'DejaVuSansMono.ttf', bolditalics: 'DejaVuSansMono-Bold.ttf' },
} as const;

export interface PdfResult {
  data: Uint8Array;
  /** Characters that none of the bundled fonts can draw. */
  unsupportedChars: string[];
}

interface Ctx {
  s: Settings;
  theme: Theme;
  body: 'Carlito' | 'Sans' | 'Serif';
  unsupported: Set<string>;
}

const hex = (c: string) => `#${c}`;

export async function buildPdf(doc: ParsedDocument, s: Settings, loadFont: FontLoader): Promise<PdfResult> {
  const theme = themeFor(s);
  const geo = pageGeometry(s);
  const body: 'Carlito' | 'Sans' | 'Serif' = s.fontFamily === 'Calibri' ? 'Carlito' : pdfFontGroup(s.fontFamily) === 'sans' ? 'Sans' : 'Serif';
  const ctx: Ctx = { s, theme, body, unsupported: new Set() };

  const content: any[] = [];
  if (s.title.trim()) {
    content.push({
      text: inline([{ text: s.title.trim() }], ctx, { bold: true, color: hex(theme.headingColor), size: s.fontSize * (theme.headingScale[0] + 0.3) }),
      alignment: theme.h1Align,
      margin: [0, 0, 0, 14],
    });
  }
  for (const b of doc.blocks) content.push(...renderBlock(b, ctx, geo.contentWidthPt));
  if (content.length === 0) content.push({ text: ' ' });

  // Fonts: the body family, the symbol fallback and monospace — loaded from the extension package.
  const needed = [body, 'Fallback', 'Mono'] as const;
  const fonts: Record<string, any> = {};
  const vfs: Record<string, string> = {};
  await Promise.all(
    needed.map(async (name) => {
      fonts[name] = { ...FONT_FILES[name] };
      for (const file of new Set(Object.values(FONT_FILES[name]))) vfs[file] = await loadFont(file);
    }),
  );
  fonts.Body = fonts[body];

  const docDefinition: any = {
    info: { title: s.title.trim() || doc.title || 'Document', creator: 'Docraft', producer: 'Docraft' },
    pageSize: s.pageSize.toUpperCase(),
    pageOrientation: s.orientation,
    pageMargins: [geo.marginPt, geo.marginPt, geo.marginPt, geo.marginPt],
    defaultStyle: {
      font: 'Body',
      fontSize: s.fontSize,
      lineHeight: Math.max(0.95, theme.lineHeight / 1.2),
      color: hex(theme.bodyColor),
    },
    background: (_page: number, pageSize: { width: number; height: number }) => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: hex(theme.pageFill) }],
    }),
    content,
    footer: s.pageNumbers
      ? (page: number, count: number) => ({
          text: `Page ${page} of ${count}`,
          alignment: 'center',
          fontSize: Math.max(7, s.fontSize - 3),
          color: '#6b7280',
          margin: [0, 8, 0, 0],
        })
      : undefined,
    // Keep headings with the content that follows them.
    pageBreakBefore: (node: any, following: any[]) => node.headlineLevel !== undefined && following.length === 0,
  };

  const mod: any = await import('pdfmake/build/pdfmake');
  const pdfMake: any = mod.default ?? mod;
  const data: Uint8Array = await new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition, null, fonts, vfs).getBuffer((buf: Uint8Array) => resolve(new Uint8Array(buf)));
    } catch (e) {
      reject(e);
    }
  });
  return { data, unsupportedChars: [...ctx.unsupported] };
}

/* ------------------------------------------------------------------ */
/* Inline content                                                      */
/* ------------------------------------------------------------------ */

interface InlineBase {
  bold?: boolean;
  color?: string;
  size?: number;
}

function inline(runs: Run[], ctx: Ctx, base: InlineBase = {}): any[] {
  const out: any[] = [];
  const primary = ctx.body === 'Serif' ? inDejaVuSerif : inRoboto;
  for (const r of runs) {
    if (r.br) {
      out.push({ text: '\n' });
      continue;
    }
    if (!r.text) continue;
    const style: any = {};
    if (r.bold || base.bold) style.bold = true;
    if (r.italic) style.italics = true;
    if (r.strike) style.decoration = 'lineThrough';
    if (r.href) {
      style.link = r.href;
      style.decoration = 'underline';
      style.color = hex(ctx.theme.linkColor);
    } else {
      style.color = base.color ?? hex(ctx.theme.bodyColor);
    }
    if (base.size) style.fontSize = base.size;
    if (r.code) {
      style.font = 'Mono';
      style.background = hex(ctx.theme.codeFill);
      style.fontSize = (base.size ?? ctx.s.fontSize) - 1;
    }

    // Split into runs the primary font can draw and runs that need the symbol fallback.
    let seg = '';
    let segFallback = false;
    const flush = () => {
      if (!seg) return;
      const o: any = { ...style, text: seg };
      if (segFallback && !r.code) o.font = 'Fallback';
      out.push(o);
      seg = '';
    };
    const covered = r.code ? inDejaVuSans : primary;
    for (const ch of r.text) {
      const cp = ch.codePointAt(0)!;
      let useFallback = false;
      if (cp > 0x20 && !covered(cp)) {
        if (inDejaVuSans(cp)) useFallback = true;
        else if (!(cp >= 0x200b && cp <= 0x200f) && cp !== 0xfeff && !(cp >= 0xfe00 && cp <= 0xfe0f)) ctx.unsupported.add(ch);
      }
      if (useFallback !== segFallback) {
        flush();
        segFallback = useFallback;
      }
      seg += ch;
    }
    flush();
  }
  return out.length ? out : [{ text: ' ' }];
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

function renderBlock(b: Block, ctx: Ctx, width: number, listDepth = 0): any[] {
  const { theme, s } = ctx;
  switch (b.type) {
    case 'heading': {
      const i = b.level - 1;
      const size = s.fontSize * theme.headingScale[i];
      const node: any = {
        text: inline(b.runs, ctx, { bold: true, color: hex(theme.headingColor), size }),
        headlineLevel: b.level,
        alignment: i === 0 ? theme.h1Align : 'left',
        margin: [0, [2, 14, 12, 10, 8, 8][i], 0, [i === 0 && theme.h1Rule ? 3 : 6, 5, 4, 3, 3, 3][i]],
      };
      if (i === 0 && theme.h1Rule) {
        return [
          node,
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.75, lineColor: hex(theme.tableBorder) }], margin: [0, 0, 0, 8] },
        ];
      }
      return [node];
    }

    case 'paragraph':
      return [
        {
          text: inline(b.runs, ctx),
          alignment: theme.justify ? 'justify' : 'left',
          margin: [0, b.qa === 'question' ? 4 : 0, 0, theme.paragraphAfterPt],
        },
      ];

    case 'list':
      return [renderList(b, ctx, width, listDepth)];

    case 'blockquote': {
      const inner = b.blocks.flatMap((x) => renderBlock(x, ctx, width - 16, listDepth));
      const rows = (inner.length ? inner : [{ text: ' ' }]).map((n) => [{ stack: [n] }]);
      return [
        {
          table: { widths: ['*'], body: rows },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 3 : 0),
            vLineColor: () => hex(theme.quoteBar),
            paddingLeft: () => 10,
            paddingRight: () => 6,
            paddingTop: () => 1,
            paddingBottom: () => 1,
            fillColor: () => hex(theme.quoteFill),
          },
          margin: [0, 2, 0, theme.paragraphAfterPt],
        },
      ];
    }

    case 'code': {
      const size = Math.max(7, s.fontSize - 2);
      const lines = b.text.split('\n').map((l) => l.replace(/\t/g, '    '));
      for (const l of lines) for (const ch of l) {
        const cp = ch.codePointAt(0)!;
        if (cp > 0x20 && !inDejaVuSans(cp)) ctx.unsupported.add(ch);
      }
      const rows = lines.map((l) => [
        { text: l === '' ? ' ' : l, font: 'Mono', fontSize: size, lineHeight: 1.1, preserveLeadingSpaces: true, color: hex(theme.codeColor) },
      ]);
      return [
        {
          table: { widths: ['*'], body: rows },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: (i: number) => (i === 0 ? 6 : 0),
            paddingBottom: (i: number) => (i === rows.length - 1 ? 6 : 0),
            fillColor: () => hex(theme.codeFill),
          },
          margin: [0, 2, 0, theme.paragraphAfterPt],
        },
      ];
    }

    case 'hr':
      return [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.75, lineColor: hex(theme.tableBorder) }], margin: [0, 8, 0, 10] },
      ];

    case 'table':
      return renderTable(b, ctx, width);
  }
}

function renderList(list: ListBlock, ctx: Ctx, width: number, depth: number): any {
  const items = list.items.map((item) => {
    const children = item.children.flatMap((c) => renderBlock(c, ctx, width - 22, depth + 1));
    if (children.length === 0) return { text: inline(item.runs, ctx), margin: [0, 0, 0, 2] };
    const head = item.runs.length ? [{ text: inline(item.runs, ctx), margin: [0, 0, 0, 2] }] : [];
    return { stack: [...head, ...children] };
  });
  const node: any = list.ordered ? { ol: items, start: list.start } : { ul: items };
  if (list.ordered && depth % 3 === 1) node.type = 'lower-alpha';
  if (list.ordered && depth % 3 === 2) node.type = 'lower-roman';
  node.margin = [depth === 0 ? 4 : 0, 0, 0, depth === 0 ? ctx.theme.paragraphAfterPt : 2];
  return node;
}

function renderTable(t: TableBlock, ctx: Ctx, width: number): any[] {
  const { theme, s } = ctx;
  const n = t.columnCount;
  if (n === 0) return [];
  const size = tableFontSize(s.fontSize, n);
  const padX = n >= 8 ? 3 : 5;
  // pdfmake column widths exclude cell padding and borders, so subtract both from the space available.
  const usable = width - (n + 1) * 0.5 - n * padX * 2;
  const widths = computeColumnWidths(t, usable, size * (ctx.body === 'Serif' ? 0.72 : 0.62), 0).map((w) => Math.floor(w * 100) / 100);

  const align = (a: Align) => a ?? 'left';
  const mkCell = (runs: Run[], c: number, isHeader: boolean) => ({
    text: inline(runs, ctx, { bold: isHeader, color: isHeader ? hex(theme.tableHeaderColor) : undefined, size }),
    alignment: align(t.align[c]),
    fontSize: size,
  });
  const bodyRows = t.rows.map((r) => r.map((cell, c) => mkCell(cell.runs, c, false)));
  const headerRow = t.header.map((cell, c) => mkCell(cell.runs, c, true));

  const hugeCell = [t.header, ...t.rows].some((r) => r.some((c) => c.runs.reduce((a, x) => a + x.text.length, 0) > 2500));
  return [
    {
      table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: !hugeCell, widths, body: [headerRow, ...bodyRows] },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => hex(theme.tableBorder),
        vLineColor: () => hex(theme.tableBorder),
        paddingLeft: () => padX,
        paddingRight: () => padX,
        paddingTop: () => 3.5,
        paddingBottom: () => 3.5,
        fillColor: (row: number) => (row === 0 ? hex(theme.tableHeaderFill) : theme.tableZebra && row % 2 === 0 ? hex(theme.tableZebra) : null),
      },
      margin: [0, 2, 0, theme.paragraphAfterPt + 2],
    },
  ];
}
