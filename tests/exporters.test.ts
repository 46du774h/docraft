import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { parseDocument } from '../src/core/parser';
import { DEFAULT_SETTINGS, applyPreset, sanitizeSettings } from '../src/core/settings';
import type { Settings } from '../src/core/settings';
import { generate, ExportError } from '../src/exporters';
import { buildFilename, safeBaseName } from '../src/core/filename';
import { computeColumnWidths, roundToTotal } from '../src/core/columns';
import { safeUrl } from '../src/core/url';
import type { TableBlock } from '../src/core/types';

const fontLoader = async (f: string) => readFileSync(new URL(`../public/fonts/${f}`, import.meta.url)).toString('base64');
const run = (fmt: 'docx' | 'pdf' | 'html', src: string, s: Settings = DEFAULT_SETTINGS) => generate(fmt, parseDocument(src), s, fontLoader, new Date(2026, 9, 24, 9, 5));
const text = (u8: Uint8Array) => new TextDecoder().decode(u8);
const docXml = async (u8: Uint8Array) => (await JSZip.loadAsync(u8)).file('word/document.xml')!.async('string');

const TABLE = '# Report\n\n| Name | Role | Notes |\n| :-- | :-: | --: |\n| Ann | Dev | has **bold** |\n| Bob | | |\n| Cy | Ops | last |\n\nAfter.';

describe('Word (.docx)', () => {
  it('is a real OOXML zip with the required parts', async () => {
    const r = await run('docx', TABLE);
    expect(r.filename).toBe('Report.docx');
    expect(r.data[0]).toBe(0x50); expect(r.data[1]).toBe(0x4b); // "PK"
    const zip = await JSZip.loadAsync(r.data);
    for (const p of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', '_rels/.rels']) expect(zip.file(p), p).toBeTruthy();
    const ct = await zip.file('[Content_Types].xml')!.async('string');
    expect(ct).toContain('wordprocessingml.document.main+xml');
  });

  it('contains a real editable table with every row/cell, header row flagged, no separator syntax', async () => {
    const xml = await docXml((await run('docx', TABLE)).data);
    expect(xml.match(/<w:tbl>/g)).toHaveLength(1);
    expect(xml.match(/<w:tr[ >]/g)).toHaveLength(4);
    expect(xml.match(/<w:tc>/g)).toHaveLength(12);
    expect(xml).toContain('<w:tblHeader');
    for (const w of ['Name', 'Role', 'Notes', 'Ann', 'Dev', 'Bob', 'Cy', 'Ops', 'last']) expect(xml).toContain(`>${w}</w:t>`);
    expect(xml).not.toContain(':--');
    expect(xml).not.toContain('--:');
  });

  it('writes headings, lists, links, code and landscape orientation', async () => {
    const src = '# H1\n\n## H2\n\n- a\n  - b\n\n1. x\n2. y\n\n[l](https://example.com)\n\n```js\nlet a = 1;\n```\n\n> q';
    const xml = await docXml((await run('docx', src, { ...DEFAULT_SETTINGS, orientation: 'landscape', pageSize: 'Letter' })).data);
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain('<w:numPr>');
    expect(xml).toContain('<w:hyperlink');
    expect(xml).toContain('let a = 1;');
    expect(xml).toMatch(/<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/);
  });

  it('supports dark document appearance', async () => {
    const xml = await docXml((await run('docx', '# Dark report\n\nReadable text.', { ...DEFAULT_SETTINGS, documentTheme: 'dark' })).data);
    expect(xml).toContain('w:background');
    expect(xml).toContain('w:color="1E1E1E"');
  });

  it('creates a PDF with the optional contents section enabled', async () => {
    const r = await run('pdf', '# First\n\n## Second', { ...DEFAULT_SETTINGS, includeTableOfContents: true });
    const pdf = Buffer.from(r.data).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(r.data.length).toBeGreaterThan(500);
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);
  });

  it('includes an optional contents section before the document', async () => {
    const xml = await docXml((await run('docx', '# First\n\n## Second', { ...DEFAULT_SETTINGS, includeTableOfContents: true })).data);
    expect(xml.indexOf('Table of Contents')).toBeLessThan(xml.indexOf('First'));
    expect(xml).toContain('Second');
    expect(xml).toContain('TOC');
    expect(xml).toContain('w:leader="dot"');
    expect(xml).toContain('<w:br w:type="page"/>');
  });

  it('wide tables and long text are written in full', async () => {
    const cols = 12, long = 'lorem '.repeat(400).trim();
    const head = `| ${Array.from({ length: cols }, (_, i) => 'H' + i).join(' | ')} |`;
    const sep = `|${' --- |'.repeat(cols)}`;
    const row = `| ${Array.from({ length: cols }, (_, i) => (i === 5 ? long : 'c' + i)).join(' | ')} |`;
    const xml = await docXml((await run('docx', [head, sep, row, row].join('\n'))).data);
    expect(xml.match(/<w:tc>/g)).toHaveLength(cols * 3);
    expect(xml.split(long).length - 1).toBe(2);
  });

  it('escapes markup-like text (no injected XML)', async () => {
    const xml = await docXml((await run('docx', 'x <script>alert(1)</script> & "q"')).data);
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
  });
});

describe('PDF', () => {
  it('produces a valid PDF with embedded fonts', async () => {
    const r = await run('pdf', TABLE);
    const s = Buffer.from(r.data).toString('latin1');
    expect(r.filename).toBe('Report.pdf');
    expect(s.startsWith('%PDF-')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/FontFile2');
    expect(s).not.toMatch(/\/Subtype\s*\/Image/); // tables are drawn, never screenshots
  });

  it('supports dark document appearance', async () => {
    const r = await run('pdf', '# Dark report\n\nReadable text.', { ...DEFAULT_SETTINGS, documentTheme: 'dark' });
    expect(Buffer.from(r.data).toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(r.data.length).toBeGreaterThan(500);
  });

  it('long documents paginate and keep every row', async () => {
    const rows = Array.from({ length: 400 }, (_, i) => `| row${i} | value ${i} | some longer text for row ${i} |`).join('\n');
    const paras = Array.from({ length: 200 }, (_, i) => `Paragraph ${i}. ` + 'text '.repeat(40)).join('\n\n');
    const r = await run('pdf', `# Big\n\n${paras}\n\n| a | b | c |\n|---|---|---|\n${rows}`, { ...DEFAULT_SETTINGS, pageSize: 'Letter' });
    const pages = (Buffer.from(r.data).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(10);
  });

  it('supports every preset, size and orientation', async () => {
    for (const p of ['professional', 'academic', 'minimal'] as const)
      for (const orientation of ['portrait', 'landscape'] as const) {
        const r = await run('pdf', TABLE, { ...applyPreset(DEFAULT_SETTINGS, p), orientation, pageSize: 'Legal', title: 'T' });
        expect(Buffer.from(r.data).toString('latin1').startsWith('%PDF-')).toBe(true);
      }
  });

  it('draws symbols via the fallback font and warns only about undrawable characters', async () => {
    const ok = await run('pdf', 'Arrows → ✓ ≥ € café Привет');
    expect(ok.notes).toEqual([]);
    const cjk = await run('pdf', 'Hello 日本語');
    expect(cjk.notes[0]).toContain('日');
  });

  it('survives malformed and empty cells', async () => {
    const r = await run('pdf', '| A | B |\n|---|---|\n| | |\n| x |\n');
    expect(r.data.length).toBeGreaterThan(500);
  });
});

describe('HTML (.html)', () => {
  it('exports styled semantic HTML with headings, tables, code and safe links', async () => {
    const src = '# Report\n\nSome **text** with [a link](https://e.com).\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nprint(1)\n```';
    const r = await run('html', src);
    const out = text(r.data);
    expect(r.filename).toBe('Report.html');
    expect(r.mime).toBe('text/html;charset=utf-8');
    expect(out).toContain('<h1 id="report">Report</h1>');
    expect(out).toContain('<table>');
    expect(out).toContain('<pre><code class="language-js">');
    expect(out).toContain('href="https://e.com"');
  });

  it('adds a linked optional table of contents and safely escapes raw HTML', async () => {
    const src = '# Repeated\n\n## Repeated\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))';
    const out = text((await run('html', src, { ...DEFAULT_SETTINGS, includeTableOfContents: true })).data);
    expect(out).toContain('<nav class="table-of-contents"');
    expect(out).toContain('<a href="#repeated-2">Repeated</a>');
    expect(out).toContain('<h2 id="repeated-2">Repeated</h2>');
    expect(out).toContain('.document-content{break-before:page;page-break-before:always}');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('href="javascript:');
  });

  it('omits the table of contents when disabled', async () => {
    const out = text((await run('html', '# Heading')).data);
    expect(out).not.toContain('<nav class="table-of-contents"');
  });
});

describe('export guards', () => {
  it('rejects empty input with a clear error', async () => {
    for (const f of ['docx', 'pdf', 'html'] as const) await expect(run(f, '   \n')).rejects.toBeInstanceOf(ExportError);
  });
  it('title overrides the first heading for the file name', async () => {
    expect((await run('html', '# Heading', { ...DEFAULT_SETTINGS, title: 'Custom: Name?' })).filename).toBe('Custom-Name.html');
  });
});

describe('file names', () => {
  it('are safe on every OS', () => {
    expect(safeBaseName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(safeBaseName('  ..hidden.. ')).toBe('hidden');
    expect(safeBaseName('CON')).toBe('document');
    expect(safeBaseName('')).toBe('document');
    expect(safeBaseName('日本語 レポート')).toBe('日本語-レポート');
    expect(safeBaseName('x'.repeat(300)).length).toBeLessThanOrEqual(80);
    expect(safeBaseName('a\u202Eb\u0000c')).not.toMatch(/[\u202E\u0000]/);
  });
  it('fall back to a timestamped name', () => {
    expect(buildFilename(undefined, 'pdf', new Date(2026, 9, 24, 9, 5))).toBe('document-20261024-0905.pdf');
  });
});

describe('helpers', () => {
  it('column widths always sum to the available space and stay positive', () => {
    const mk = (cols: number, len: number): TableBlock => ({
      type: 'table', columnCount: cols, align: Array(cols).fill(null),
      header: Array.from({ length: cols }, (_, i) => ({ runs: [{ text: 'h' + i }] })),
      rows: [Array.from({ length: cols }, (_, i) => ({ runs: [{ text: i % 3 === 0 ? 'x'.repeat(len) : 'ok' }] }))],
    });
    for (const [c, l] of [[2, 5], [5, 40], [12, 200], [20, 30]] as const) {
      const w = computeColumnWidths(mk(c, l), 468, 5, 10);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(468, 5);
      expect(Math.min(...w)).toBeGreaterThan(0);
      expect(roundToTotal(computeColumnWidths(mk(c, l), 9000, 100, 200), 9000).reduce((a, b) => a + b, 0)).toBe(9000);
    }
  });
  it('only http(s), mailto and tel links are allowed', () => {
    expect(safeUrl('https://a.com/x')).toBeTruthy();
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    for (const bad of ['javascript:alert(1)', ' JaVa\nScRiPt:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'chrome://settings', '/relative', '#frag', 'vbscript:x', '']) expect(safeUrl(bad), bad).toBeNull();
  });
  it('persisted settings are validated', () => {
    expect(sanitizeSettings({ preset: 'evil', fontSize: 9999, pageSize: 'X', title: 5 })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
