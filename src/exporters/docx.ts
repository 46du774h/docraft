import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import type { ILevelsOptions, ParagraphChild } from 'docx';
import { computeColumnWidths, roundToTotal } from '../core/columns';
import { PAGE_TWIPS, pageGeometry, tableFontSize, themeFor } from '../core/settings';
import type { Settings, Theme } from '../core/settings';
import type { Align, Block, ListBlock, ParsedDocument, Run, TableBlock } from '../core/types';
import { renderMathToPng } from './pdfMath';
import type { RenderedMath } from './pdfMath';

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const MONO = 'Consolas';

interface Ctx {
  s: Settings;
  theme: Theme;
  contentTw: number;
  numbering: { reference: string; levels: ILevelsOptions[] }[];
  listCounter: number;
  math: WeakMap<Run, RenderedMath>;
}

const tw = (pt: number) => Math.round(pt * 20);
const hp = (pt: number) => Math.round(pt * 2);

export async function buildDocx(doc: ParsedDocument, s: Settings): Promise<Uint8Array> {
  const theme = themeFor(s);
  const geo = pageGeometry(s);
  const base = PAGE_TWIPS[s.pageSize];
  const ctx: Ctx = {
    s,
    theme,
    contentTw: tw(geo.contentWidthPt),
    numbering: [{ reference: 'bullets', levels: levels('bullet', 0, 1) }],
    listCounter: 0,
    math: new WeakMap(),
  };

  const children: (Paragraph | Table)[] = [];

  await prepareMath(doc.blocks, ctx);

  // The filename is metadata, not document content.
  for (const b of doc.blocks) {
    children.push(...renderBlock(b, ctx, 0, 0));
  }
  if (children.length === 0) children.push(new Paragraph({ children: [] }));

  const headingStyle = (i: number) => {
    const size = s.fontSize * theme.headingScale[i];
    return {
      run: { font: s.fontFamily, size: hp(size), bold: true, color: theme.headingColor },
      paragraph: {
        keepNext: true,
        keepLines: true,
        alignment: i === 0 && theme.h1Align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: tw([4, 16, 14, 12, 10, 10][i]), after: tw([8, 6, 4, 4, 4, 4][i]) },
        ...(i === 0 && theme.h1Rule
          ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.tableBorder, space: 4 } } }
          : {}),
      },
    };
  };

  const document = new Document({
    creator: 'Docraft',
    title: s.title.trim() || doc.title || 'Document',
    description: 'Generated locally by Docraft',
    background: { color: theme.pageFill },
    styles: {
      default: {
        document: {
          run: { font: s.fontFamily, size: hp(s.fontSize), color: theme.bodyColor },
          paragraph: {
            spacing: { after: tw(theme.paragraphAfterPt), line: Math.round(theme.lineHeight * 240), lineRule: LineRuleType.AUTO },
          },
        },
        title: {
          run: { font: s.fontFamily, size: hp(s.fontSize * (theme.headingScale[0] + 0.3)), bold: true, color: theme.headingColor },
          paragraph: {
            alignment: theme.h1Align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { before: 0, after: tw(14) },
          },
        },
        heading1: headingStyle(0),
        heading2: headingStyle(1),
        heading3: headingStyle(2),
        heading4: headingStyle(3),
        heading5: headingStyle(4),
        heading6: headingStyle(5),
      },
      paragraphStyles: [
        {
          id: 'CodeBlock',
          name: 'Code Block',
          basedOn: 'Normal',
          quickFormat: true,
          run: { font: MONO, size: hp(Math.max(8, s.fontSize - 1.5)), color: theme.codeColor },
          paragraph: { spacing: { before: 0, after: 0, line: 252, lineRule: LineRuleType.AUTO } },
        },
        {
          id: 'QuoteBlock',
          name: 'Quote Block',
          basedOn: 'Normal',
          quickFormat: true,
          run: { italics: true, color: theme.quoteColor },
        },
      ],
      characterStyles: [
        {
          id: 'Hyperlink',
          name: 'Hyperlink',
          run: { color: theme.linkColor, underline: { type: UnderlineType.SINGLE } },
        },
      ],
    },
    numbering: { config: ctx.numbering },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: base.w,
              height: base.h,
              orientation: s.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: { top: tw(geo.marginPt), bottom: tw(geo.marginPt), left: tw(geo.marginPt), right: tw(geo.marginPt) },
          },
        },
        footers: s.pageNumbers
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                        size: hp(Math.max(8, s.fontSize - 2)),
                        color: '6B7280',
                      }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
  });

  const buf = await Packer.toArrayBuffer(document);
  return new Uint8Array(buf);
}

/* ------------------------------------------------------------------ */

function levels(kind: 'bullet' | 'ordered', activeLevel: number, start: number): ILevelsOptions[] {
  const bullets = ['•', '◦', '▪'];
  const formats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  return Array.from({ length: 9 }, (_, lvl) => ({
    level: lvl,
    format: kind === 'bullet' ? LevelFormat.BULLET : formats[lvl % 3],
    text: kind === 'bullet' ? bullets[lvl % 3] : `%${lvl + 1}.`,
    alignment: AlignmentType.LEFT,
    start: kind === 'ordered' && lvl === activeLevel ? start : 1,
    style: { paragraph: { indent: { left: 720 + lvl * 360, hanging: 360 } } },
  }));
}

function alignOf(a: Align): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  if (a === 'center') return AlignmentType.CENTER;
  if (a === 'right') return AlignmentType.RIGHT;
  return undefined;
}

interface RunBase {
  size?: number; // half-points
  bold?: boolean;
  color?: string;
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Formula image has an invalid data URL.');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toChildren(runs: Run[], ctx: Ctx, base: RunBase = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const r of runs) {
    if (r.br) {
      out.push(new TextRun({ break: 1 }));
      continue;
    }
    if (r.text === '') continue;
    if (r.math) {
      const rendered = ctx.math.get(r);
      if (rendered) {
        out.push(
          new ImageRun({
            data: dataUrlBytes(rendered.dataUrl),
            type: 'png',
            transformation: {
              width: Math.max(1, Math.round(rendered.width)),
              height: Math.max(1, Math.round(rendered.height)),
            },
          }),
        );
        continue;
      }
    }
    const opts = {
      text: r.text,
      bold: r.bold || base.bold || undefined,
      italics: r.italic || undefined,
      strike: r.strike || undefined,
      size: base.size,
      color: r.href ? ctx.theme.linkColor : base.color,
      ...(r.code
        ? {
            font: MONO,
            shading: { type: ShadingType.CLEAR, fill: ctx.theme.codeFill, color: 'auto' },
            size: base.size ? Math.max(14, base.size - 2) : hp(Math.max(8, ctx.s.fontSize - 1)),
          }
        : {}),
    };
    if (r.href) {
      out.push(
        new ExternalHyperlink({
          link: r.href,
          children: [new TextRun({ ...opts, style: 'Hyperlink', underline: { type: UnderlineType.SINGLE } })],
        }),
      );
    } else out.push(new TextRun(opts));
  }
  return out;
}

async function prepareMath(blocks: Block[], ctx: Ctx): Promise<void> {
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      await prepareRuns(block.runs, ctx);
    } else if (block.type === 'list') {
      for (const item of block.items) {
        await prepareRuns(item.runs, ctx);
        await prepareMath(item.children, ctx);
      }
    } else if (block.type === 'blockquote') {
      await prepareMath(block.blocks, ctx);
    } else if (block.type === 'table') {
      for (const cell of [...block.header, ...block.rows.flat()]) {
        await prepareRuns(cell.runs, ctx);
      }
    }
  }
}

async function prepareRuns(runs: Run[], ctx: Ctx): Promise<void> {
  await Promise.all(
    runs.map(async (run) => {
      if (!run.math || !run.text.trim()) return;

      try {
        ctx.math.set(
          run,
          await renderMathToPng(
            run.text,
            Boolean(run.displayMath),
            ctx.s.fontSize * (4 / 3),
            `#${ctx.theme.bodyColor}`,
            `#${ctx.theme.pageFill}`,
          ),
        );
      } catch (error) {
        console.error('Docraft: unable to render a math expression for Word export.', {
          formula: run.text,
          displayMath: run.displayMath,
          error,
        });
      }
    }),
  );
}

function renderBlock(b: Block, ctx: Ctx, listDepth: number, quoteDepth: number): (Paragraph | Table)[] {
  const { theme } = ctx;
  const quoteIndent = quoteDepth > 0 ? { left: 360 * quoteDepth + 120 } : undefined;
  const quoteBorder =
    quoteDepth > 0
      ? { left: { style: BorderStyle.SINGLE, size: 18, color: theme.quoteBar, space: 10 } }
      : undefined;

  switch (b.type) {
    case 'heading':
      return [
        new Paragraph({
          heading: HEADINGS[b.level - 1],
          children: toChildren(b.runs, ctx),
        }),
      ];

    case 'paragraph':
      return [
        new Paragraph({
          style: quoteDepth > 0 ? 'QuoteBlock' : undefined,
          alignment: theme.justify && quoteDepth === 0 ? AlignmentType.JUSTIFIED : undefined,
          indent: quoteIndent ?? (listDepth > 0 ? { left: 720 + (listDepth - 1) * 360 + 360 } : undefined),
          border: quoteBorder,
          keepNext: b.qa === 'question' || undefined,
          spacing: b.qa === 'question' ? { before: tw(6) } : undefined,
          children: toChildren(b.runs, ctx),
        }),
      ];

    case 'list':
      return renderList(b, ctx, listDepth, quoteDepth);

    case 'blockquote': {
      const out: (Paragraph | Table)[] = [];
      for (const inner of b.blocks) out.push(...renderBlock(inner, ctx, listDepth, quoteDepth + 1));
      return out;
    }

    case 'code': {
      const lines = b.text.split('\n');
      const paras = lines.map((line, i) =>
        new Paragraph({
          style: 'CodeBlock',
          keepLines: true,
          shading: { type: ShadingType.CLEAR, fill: theme.codeFill, color: 'auto' },
          indent: { left: 120 + (quoteDepth ? 360 * quoteDepth : 0), right: 120 },
          spacing: { before: i === 0 ? tw(4) : 0, after: i === lines.length - 1 ? tw(10) : 0 },
          children: [new TextRun({ text: line.replace(/\t/g, '    ') })],
        }),
      );
      return paras;
    }

    case 'hr':
      return [
        new Paragraph({
          spacing: { before: tw(6), after: tw(10) },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.tableBorder, space: 1 } },
          children: [],
        }),
      ];

    case 'table':
      return renderTable(b, ctx);
  }
}

function renderList(list: ListBlock, ctx: Ctx, depth: number, quoteDepth: number): (Paragraph | Table)[] {
  let reference = 'bullets';
  if (list.ordered) {
    reference = `ol-${++ctx.listCounter}`;
    ctx.numbering.push({ reference, levels: levels('ordered', depth, list.start) });
  }
  const out: (Paragraph | Table)[] = [];
  for (const item of list.items) {
    out.push(
      new Paragraph({
        numbering: { reference, level: Math.min(depth, 8) },
        spacing: { after: tw(3) },
        children: toChildren(item.runs, ctx),
      }),
    );
    for (const child of item.children) out.push(...renderBlock(child, ctx, depth + 1, quoteDepth));
  }
  // small gap after the top-level list
  if (depth === 0) out.push(new Paragraph({ spacing: { after: 0, line: 120, lineRule: LineRuleType.EXACT }, children: [] }));
  return out;
}

function renderTable(t: TableBlock, ctx: Ctx): (Paragraph | Table)[] {
  const { theme, s } = ctx;
  const n = t.columnCount;
  if (n === 0) return [];
  const sizePt = tableFontSize(s.fontSize, n);
  const sz = hp(sizePt);
  const charTw = sizePt * 0.55 * 20;
  const widths = roundToTotal(computeColumnWidths(t, ctx.contentTw, charTw, 240), ctx.contentTw);

  const line = { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorder };
  const makeRow = (cells: TableBlock['header'], isHeader: boolean, zebra: boolean) =>
    new TableRow({
      tableHeader: isHeader,
      cantSplit: true,
      children: cells.map(
        (cell, c) =>
          new TableCell({
            width: { size: widths[c], type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            shading: isHeader
              ? { type: ShadingType.CLEAR, fill: theme.tableHeaderFill, color: 'auto' }
              : zebra && theme.tableZebra
                ? { type: ShadingType.CLEAR, fill: theme.tableZebra, color: 'auto' }
                : undefined,
            children: [
              new Paragraph({
                alignment: alignOf(t.align[c]),
                spacing: { before: 0, after: 0, line: 252, lineRule: LineRuleType.AUTO },
                keepNext: isHeader || undefined,
                children: toChildren(cell.runs, ctx, {
                  size: sz,
                  bold: isHeader,
                  color: isHeader ? theme.tableHeaderColor : undefined,
                }),
              }),
            ],
          }),
      ),
    });

  const table = new Table({
    width: { size: ctx.contentTw, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: {
      top: line,
      bottom: line,
      left: line,
      right: line,
      insideHorizontal: line,
      insideVertical: line,
    },
    rows: [makeRow(t.header, true, false), ...t.rows.map((r, i) => makeRow(r, false, i % 2 === 1))],
  });
  return [table, new Paragraph({ spacing: { after: 0, line: 160, lineRule: LineRuleType.EXACT }, children: [] })];
}
