
import { computeColumnWidths } from '../core/columns';
import { extractHeadings } from '../core/headings';
import { pageGeometry, pdfFontGroup, tableFontSize, themeFor } from '../core/settings';
import type { Settings, Theme } from '../core/settings';
import type { Align, Block, ListBlock, ParsedDocument, Run, TableBlock } from '../core/types';
import { inDejaVuSans, inDejaVuSerif, inRoboto } from './glyphCoverage';
import type { FontLoader } from './fontLoader';
import { renderMathToPng } from './pdfMath';
import type { RenderedMath } from './pdfMath';

/* eslint-disable @typescript-eslint/no-explicit-any */

const FONT_FILES = {
  Carlito: {
    normal: 'Carlito-Regular.ttf',
    bold: 'Carlito-Bold.ttf',
    italics: 'Carlito-Italic.ttf',
    bolditalics: 'Carlito-BoldItalic.ttf',
  },
  Sans: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
  Serif: {
    normal: 'DejaVuSerif.ttf',
    bold: 'DejaVuSerif-Bold.ttf',
    italics: 'DejaVuSerif-Italic.ttf',
    bolditalics: 'DejaVuSerif-BoldItalic.ttf',
  },
  Fallback: {
    normal: 'DejaVuSans.ttf',
    bold: 'DejaVuSans-Bold.ttf',
    italics: 'DejaVuSans-Oblique.ttf',
    bolditalics: 'DejaVuSans-BoldOblique.ttf',
  },
  Mono: {
    normal: 'DejaVuSansMono.ttf',
    bold: 'DejaVuSansMono-Bold.ttf',
    italics: 'DejaVuSansMono.ttf',
    bolditalics: 'DejaVuSansMono-Bold.ttf',
  },
} as const;

export interface PdfResult {
  data: Uint8Array;
  unsupportedChars: string[];
}

interface Ctx {
  s: Settings;
  theme: Theme;
  body: 'Carlito' | 'Sans' | 'Serif';
  unsupported: Set<string>;
  math: WeakMap<Run, RenderedMath>;
}

const hex = (c: string) => `#${c}`;

export async function buildPdf(
  doc: ParsedDocument,
  s: Settings,
  loadFont: FontLoader,
): Promise<PdfResult> {
  const theme = themeFor(s);
  const geo = pageGeometry(s);

  const body: Ctx['body'] =
    s.fontFamily === 'Calibri'
      ? 'Carlito'
      : pdfFontGroup(s.fontFamily) === 'sans'
        ? 'Sans'
        : 'Serif';

  const ctx: Ctx = {
    s,
    theme,
    body,
    unsupported: new Set(),
    math: new WeakMap(),
  };

  // Render all LaTeX expressions before constructing the PDF definition.
  await prepareMath(doc.blocks, ctx);

  const content: any[] = [];
  const tocHeadings = s.includeTableOfContents ? extractHeadings(doc.blocks) : [];

  if (tocHeadings.length > 0) {
    content.push({
      toc: {
        title: {
          text: 'Table of Contents',
          fontSize: s.fontSize * 1.4,
          bold: true,
          color: hex(theme.headingColor),
          margin: [0, 0, 0, 10],
        },
        textStyle: { fontSize: s.fontSize, color: hex(theme.bodyColor) },
        numberStyle: { fontSize: s.fontSize, color: hex(theme.bodyColor) },
        textMargin: [0, 0, 0, 4],
      },
    });
  }

  // Do not insert the filename into the exported document body.
  let firstBodyNode = tocHeadings.length > 0;
  for (const block of doc.blocks) {
    const nodes = renderBlock(block, ctx, geo.contentWidthPt);
    if (firstBodyNode && nodes.length > 0) {
      nodes[0].pageBreak = 'before';
      firstBodyNode = false;
    }
    if (tocHeadings.length > 0 && block.type === 'heading' && nodes.length > 0) {
      nodes[0].tocItem = 'docraft';
      nodes[0].tocMargin = [(block.level - 1) * 12, 0, 0, 4];
    }
    content.push(...nodes);
  }

  if (content.length === 0) content.push({ text: ' ' });

  const needed = [body, 'Fallback', 'Mono'] as const;
  const fonts: Record<string, any> = {};
  const vfs: Record<string, string> = {};

  await Promise.all(
    needed.map(async (name) => {
      fonts[name] = { ...FONT_FILES[name] };

      for (const file of new Set(Object.values(FONT_FILES[name]))) {
        vfs[file] = await loadFont(file);
      }
    }),
  );

  fonts.Body = fonts[body];

  const docDefinition: any = {
    info: {
      title: s.title.trim() || doc.title || 'Document',
      creator: 'Docraft',
      producer: 'Docraft',
    },
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
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: pageSize.width,
          h: pageSize.height,
          color: hex(theme.pageFill),
        },
      ],
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
    pageBreakBefore: (node: any, following: any[]) =>
      node.headlineLevel !== undefined && following.length === 0,
  };

  const mod: any = await import('pdfmake/build/pdfmake');
  const pdfMake: any = mod.default ?? mod;

  const data: Uint8Array = await new Promise((resolve, reject) => {
    try {
      pdfMake
        .createPdf(docDefinition, null, fonts, vfs)
        .getBuffer((buf: Uint8Array) => resolve(new Uint8Array(buf)));
    } catch (error) {
      reject(error);
    }
  });

  return {
    data,
    unsupportedChars: [...ctx.unsupported],
  };
}

/* ------------------------------------------------------------------ */
/* Math preparation                                                    */
/* ------------------------------------------------------------------ */

async function prepareMath(blocks: Block[], ctx: Ctx): Promise<void> {
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        await prepareRuns(block.runs, ctx);
        break;

      case 'list':
        for (const item of block.items) {
          await prepareRuns(item.runs, ctx);
          await prepareMath(item.children, ctx);
        }
        break;

      case 'blockquote':
        await prepareMath(block.blocks, ctx);
        break;

      case 'table':
        for (const cell of [...block.header, ...block.rows.flat()]) {
          await prepareRuns(cell.runs, ctx);
        }
        break;

      case 'code':
      case 'hr':
        break;
    }
  }
}

async function prepareRuns(runs: Run[], ctx: Ctx): Promise<void> {
  await Promise.all(
    runs.map(async (run) => {
      if (!run.math || !run.text.trim()) return;

      try {
        // renderMathToPng expects a CSS-pixel font size.
        const rendered = await renderMathToPng(
          run.text,
          Boolean(run.displayMath),
          ctx.s.fontSize * (4 / 3),
          hex(ctx.theme.bodyColor),
          hex(ctx.theme.pageFill),
        );

        ctx.math.set(run, rendered);
      } catch (error) {
        // Keep the original LaTeX as a fallback if image rendering fails.
        console.error(
          'Docraft: unable to render a math expression for PDF export.',
          {
            formula: run.text,
            displayMath: run.displayMath,
            error,
          },
        );
      }
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Inline content                                                      */
/* ------------------------------------------------------------------ */

interface InlineBase {
  bold?: boolean;
  color?: string;
  size?: number;
}

function mathImage(run: Run, ctx: Ctx, maxWidth?: number): any | undefined {
  const rendered = ctx.math.get(run);
  if (!rendered) return undefined;

  const scale =
    maxWidth && rendered.width > maxWidth
      ? maxWidth / rendered.width
      : 1;

  return {
    image: rendered.dataUrl,
    width: rendered.width * scale,
    height: rendered.height * scale,
  };
}

function inline(runs: Run[], ctx: Ctx, base: InlineBase = {}): any[] {
  const out: any[] = [];
  const primary = ctx.body === 'Serif' ? inDejaVuSerif : inRoboto;

  for (const run of runs) {
    if (run.br) {
      out.push({ text: '\n' });
      continue;
    }

    if (run.math) {
      // Images are not valid entries in pdfmake's text arrays. Formula
      // images are emitted by inlineNodes as separate PDF nodes instead.
      continue;
    }

    if (!run.text) continue;

    const style: any = {};

    if (run.bold || base.bold) style.bold = true;
    if (run.italic) style.italics = true;
    if (run.strike) style.decoration = 'lineThrough';

    if (run.href) {
      style.link = run.href;
      style.decoration = 'underline';
      style.color = hex(ctx.theme.linkColor);
    } else {
      style.color = base.color ?? hex(ctx.theme.bodyColor);
    }

    if (base.size) style.fontSize = base.size;

    if (run.code) {
      style.font = 'Mono';
      style.background = hex(ctx.theme.codeFill);
      style.fontSize = (base.size ?? ctx.s.fontSize) - 1;
    }

    let segment = '';
    let segmentFallback = false;

    const flush = () => {
      if (!segment) return;

      const output: any = { ...style, text: segment };

      if (segmentFallback && !run.code) {
        output.font = 'Fallback';
      }

      out.push(output);
      segment = '';
    };

    const covered = run.code ? inDejaVuSans : primary;

    for (const ch of run.text) {
      const cp = ch.codePointAt(0)!;
      let useFallback = false;

      if (cp > 0x20 && !covered(cp)) {
        if (inDejaVuSans(cp)) {
          useFallback = true;
        } else if (
          !(cp >= 0x200b && cp <= 0x200f) &&
          cp !== 0xfeff &&
          !(cp >= 0xfe00 && cp <= 0xfe0f)
        ) {
          ctx.unsupported.add(ch);
        }
      }

      if (useFallback !== segmentFallback) {
        flush();
        segmentFallback = useFallback;
      }

      segment += ch;
    }

    flush();
  }

  return out.length ? out : [{ text: ' ' }];
}

function inlineNodes(
  runs: Run[],
  ctx: Ctx,
  base: InlineBase = {},
): any[] {
  const nodes: any[] = [];
  let textRuns: Run[] = [];

  const flushText = () => {
    if (textRuns.length === 0) return;

    nodes.push({
      text: inline(textRuns, ctx, base),
      alignment: 'left',
    });
    textRuns = [];
  };

  for (const run of runs) {
    if (!run.math) {
      textRuns.push(run);
      continue;
    }

    flushText();

    const image = mathImage(run, ctx);

    if (image) {
      nodes.push({
        ...image,
        alignment: run.displayMath ? 'center' : 'left',
        margin: run.displayMath ? [0, 6, 0, 8] : [0, 2, 0, 2],
      });
    } else if (run.text) {
      nodes.push({
        text: run.text,
        font: 'Mono',
        alignment: run.displayMath ? 'center' : 'left',
      });
    }
  }

  flushText();
  return nodes.length ? nodes : [{ text: ' ' }];
}

/* ------------------------------------------------------------------ */
/* Paragraphs and display equations                                    */
/* ------------------------------------------------------------------ */

function renderTextBlock(
  runs: Run[],
  ctx: Ctx,
  options: {
    alignment?: string;
    margin?: number[];
    bold?: boolean;
    color?: string;
    size?: number;
    headlineLevel?: number;
    maxWidth?: number;
  } = {},
): any[] {
  const result: any[] = [];
  let currentRuns: Run[] = [];

  const flushText = () => {
    if (currentRuns.length === 0) return;

    const node: any = {
      text: inline(currentRuns, ctx, {
        bold: options.bold,
        color: options.color,
        size: options.size,
      }),
      alignment: options.alignment ?? 'left',
      margin: options.margin,
    };

    if (options.headlineLevel !== undefined) {
      node.headlineLevel = options.headlineLevel;
    }

    result.push(node);
    currentRuns = [];
  };

  for (const run of runs) {
    if (run.math) {
      flushText();

      const image = mathImage(run, ctx, options.maxWidth);

      if (image) {
        result.push({
          ...image,
          alignment: run.displayMath ? 'center' : 'left',
          margin: run.displayMath ? [0, 6, 0, 8] : [0, 2, 0, 2],
        });
      } else if (run.text) {
        result.push({
          text: run.text,
          font: 'Mono',
          alignment: run.displayMath ? 'center' : 'left',
          margin: run.displayMath ? [0, 6, 0, 8] : [0, 2, 0, 2],
        });
      }

      continue;
    }

    currentRuns.push(run);
  }

  flushText();
  return result;
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

function renderBlock(
  block: Block,
  ctx: Ctx,
  width: number,
  listDepth = 0,
): any[] {
  const { theme, s } = ctx;

  switch (block.type) {
    case 'heading': {
      const index = block.level - 1;
      const size = s.fontSize * theme.headingScale[index];

      const nodes = renderTextBlock(block.runs, ctx, {
        bold: true,
        color: hex(theme.headingColor),
        size,
        alignment: index === 0 ? theme.h1Align : 'left',
        margin: [
          0,
          [2, 14, 12, 10, 8, 8][index],
          0,
          [
            index === 0 && theme.h1Rule ? 3 : 6,
            5,
            4,
            3,
            3,
            3,
          ][index],
        ],
        headlineLevel: block.level,
        maxWidth: width,
      });

      if (index === 0 && theme.h1Rule) {
        nodes.push({
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: width,
              y2: 0,
              lineWidth: 0.75,
              lineColor: hex(theme.tableBorder),
            },
          ],
          margin: [0, 0, 0, 8],
        });
      }

      return nodes;
    }

    case 'paragraph':
      return renderTextBlock(block.runs, ctx, {
        alignment: theme.justify ? 'justify' : 'left',
        margin: [
          0,
          block.qa === 'question' ? 4 : 0,
          0,
          theme.paragraphAfterPt,
        ],
        maxWidth: width,
      });

    case 'list':
      return [renderList(block, ctx, width, listDepth)];

    case 'blockquote': {
      const inner = block.blocks.flatMap((child) =>
        renderBlock(child, ctx, width - 16, listDepth),
      );

      const rows = (inner.length ? inner : [{ text: ' ' }]).map((node) => [
        { stack: [node] },
      ]);

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
      const lines = block.text
        .split('\n')
        .map((line) => line.replace(/\t/g, '    '));

      for (const line of lines) {
        for (const ch of line) {
          const cp = ch.codePointAt(0)!;
          if (cp > 0x20 && !inDejaVuSans(cp)) {
            ctx.unsupported.add(ch);
          }
        }
      }

      const rows = lines.map((line) => [
        {
          text: line === '' ? ' ' : line,
          font: 'Mono',
          fontSize: size,
          lineHeight: 1.1,
          preserveLeadingSpaces: true,
          color: hex(theme.codeColor),
        },
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
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: width,
              y2: 0,
              lineWidth: 0.75,
              lineColor: hex(theme.tableBorder),
            },
          ],
          margin: [0, 8, 0, 10],
        },
      ];

    case 'table':
      return renderTable(block, ctx, width);
  }
}

function renderList(
  list: ListBlock,
  ctx: Ctx,
  width: number,
  depth: number,
): any {
  if (list.items.some((item) => item.runs.some((run) => run.math))) {
    const items = list.items.flatMap((item, index) => {
      const marker = list.ordered
        ? `${list.start + index}.`
        : '•';
      const children = item.children.flatMap((child) =>
        renderBlock(child, ctx, width - 22, depth + 1),
      );

      return [
        {
          stack: [
            {
              columns: [
                {
                  text: marker,
                  width: 18,
                  margin: [depth * 18, 0, 0, 0],
                },
                {
                  stack: inlineNodes(item.runs, ctx),
                  width: '*',
                },
              ],
            },
            ...children,
          ],
        },
      ];
    });

    return {
      stack: items,
      margin: [
        0,
        0,
        0,
        depth === 0 ? ctx.theme.paragraphAfterPt : 2,
      ],
    };
  }

  const items = list.items.map((item) => {
    const children = item.children.flatMap((child) =>
      renderBlock(child, ctx, width - 22, depth + 1),
    );

    const head = item.runs.length
      ? renderTextBlock(item.runs, ctx, {
          margin: [0, 0, 0, 2],
          maxWidth: width - 22,
        })
      : [];

    if (children.length === 0) {
      if (item.runs.some((run) => run.math)) {
        return {
          stack: inlineNodes(item.runs, ctx),
          margin: [0, 0, 0, 2],
        };
      }

      return {
        text: inline(item.runs, ctx),
        margin: [0, 0, 0, 2],
      };
    }

    return { stack: [...head, ...children] };
  });

  const node: any = list.ordered
    ? { ol: items, start: list.start }
    : { ul: items };

  if (list.ordered && depth % 3 === 1) {
    node.type = 'lower-alpha';
  }

  if (list.ordered && depth % 3 === 2) {
    node.type = 'lower-roman';
  }

  node.margin = [
    depth === 0 ? 4 : 0,
    0,
    0,
    depth === 0 ? ctx.theme.paragraphAfterPt : 2,
  ];

  return node;
}

function renderTable(
  table: TableBlock,
  ctx: Ctx,
  width: number,
): any[] {
  const { theme, s } = ctx;
  const count = table.columnCount;

  if (count === 0) return [];

  const size = tableFontSize(s.fontSize, count);
  const padX = count >= 8 ? 3 : 5;

  const usable = width - (count + 1) * 0.5 - count * padX * 2;

  const widths = computeColumnWidths(
    table,
    usable,
    size * (ctx.body === 'Serif' ? 0.72 : 0.62),
    0,
  ).map((value) => Math.floor(value * 100) / 100);

  const align = (value: Align) => value ?? 'left';

  const makeCell = (runs: Run[], column: number, isHeader: boolean) => {
    const base = {
      bold: isHeader,
      color: isHeader ? hex(theme.tableHeaderColor) : undefined,
      size,
    };

    if (runs.some((run) => run.math)) {
      return {
        stack: inlineNodes(runs, ctx, base),
        alignment: align(table.align[column]),
        fontSize: size,
      };
    }

    return {
      text: inline(runs, ctx, base),
      alignment: align(table.align[column]),
      fontSize: size,
    };
  };

  const bodyRows = table.rows.map((row) =>
    row.map((cell, column) => makeCell(cell.runs, column, false)),
  );

  const headerRow = table.header.map((cell, column) =>
    makeCell(cell.runs, column, true),
  );

  const hugeCell = [table.header, ...table.rows].some((row) =>
    row.some(
      (cell) => cell.runs.reduce((total, run) => total + run.text.length, 0) > 2500,
    ),
  );

  return [
    {
      table: {
        headerRows: 1,
        keepWithHeaderRows: 1,
        dontBreakRows: !hugeCell,
        widths,
        body: [headerRow, ...bodyRows],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => hex(theme.tableBorder),
        vLineColor: () => hex(theme.tableBorder),
        paddingLeft: () => padX,
        paddingRight: () => padX,
        paddingTop: () => 3.5,
        paddingBottom: () => 3.5,
        fillColor: (row: number) =>
          row === 0
            ? hex(theme.tableHeaderFill)
            : theme.tableZebra && row % 2 === 0
              ? hex(theme.tableZebra)
              : null,
      },
      margin: [0, 2, 0, theme.paragraphAfterPt + 2],
    },
  ];
}
