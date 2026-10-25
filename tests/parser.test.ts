import { describe, it, expect } from 'vitest';
import { parseDocument } from '../src/core/parser';
import { runsText } from '../src/core/columns';
import type { Block, TableBlock, ListBlock } from '../src/core/types';

const parse = (s: string, plainTitle = false) => parseDocument(s, { detectPlainTitle: plainTitle });
const tables = (bs: Block[]) => bs.filter((b): b is TableBlock => b.type === 'table');
const cell = (t: TableBlock, r: number, c: number) => runsText((r === 0 ? t.header : t.rows[r - 1])[c].runs);

describe('parser — structure', () => {
  it('1. plain paragraphs', () => {
    const d = parse('First paragraph.\n\nSecond paragraph\nwith a line break.');
    expect(d.blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
    expect(runsText((d.blocks[1] as any).runs)).toBe('Second paragraph\nwith a line break.');
  });

  it('2. multiple heading levels', () => {
    const d = parse('# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six\n\ntext');
    expect(d.blocks.filter((b) => b.type === 'heading').map((b: any) => b.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(d.title).toBe('One');
  });

  it('3. nested bullet lists', () => {
    const d = parse('- a\n  - a1\n    - a11\n  - a2\n- b');
    const list = d.blocks[0] as ListBlock;
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    const inner = list.items[0].children[0] as ListBlock;
    expect(inner.items.map((i) => runsText(i.runs))).toEqual(['a1', 'a2']);
    expect(((inner.items[0].children[0] as ListBlock).items[0].runs[0].text)).toBe('a11');
  });

  it('4. numbered lists keep their start number', () => {
    const d = parse('3. three\n4. four\n5. five');
    const list = d.blocks[0] as ListBlock;
    expect(list.ordered).toBe(true);
    expect(list.start).toBe(3);
    expect(list.items).toHaveLength(3);
  });

  it('bolds lead terms in numbered lists', () => {
    const d = parse('1. Project overview: what we are building\n2. Implementation plan\n3. This is a complete sentence.');
    const list = d.blocks[0] as ListBlock;
    expect(list.items[0].runs[0]).toMatchObject({ text: 'Project overview', bold: true });
    expect(list.items[1].runs[0]).toMatchObject({ text: 'Implementation plan', bold: true });
    expect(list.items[2].runs[0].bold).toBeUndefined();
  });

  it('8-10. code, inline code, blockquotes, links, emphasis', () => {
    const d = parse('```ts\nconst a = 1;\n  indented();\n```\n\nUse `npm i` and **bold** *it* ~~gone~~ [site](https://example.com).\n\n> quoted\n> text\n\n---');
    expect(d.blocks[0]).toEqual({ type: 'code', lang: 'ts', text: 'const a = 1;\n  indented();' });
    const p: any = d.blocks[1];
    expect(p.runs.find((r: any) => r.code).text).toBe('npm i');
    expect(p.runs.find((r: any) => r.bold).text).toBe('bold');
    expect(p.runs.find((r: any) => r.italic).text).toBe('it');
    expect(p.runs.find((r: any) => r.strike).text).toBe('gone');
    expect(p.runs.find((r: any) => r.href).href).toBe('https://example.com/');
    expect(d.blocks[2].type).toBe('blockquote');
    expect(d.blocks[3].type).toBe('hr');
  });

  it('Q&A paragraphs are marked and their text is preserved', () => {
    const d = parse('Q: What is it?\n\nA: A tool.');
    expect((d.blocks[0] as any).qa).toBe('question');
    expect((d.blocks[1] as any).qa).toBe('answer');
    expect(runsText((d.blocks[0] as any).runs)).toBe('Q: What is it?');
  });
});

describe('parser — tables', () => {
  const T = '| Name | Role | Notes |\n| :--- | :---: | ---: |\n| Ann | Dev | likes **bold** |\n| Bob | | |\n| Cy | Ops | last |';

  it('5. multi-row/column table; separator row excluded; alignment kept', () => {
    const t = tables(parse(T).blocks)[0];
    expect(t.columnCount).toBe(3);
    expect(t.header.map((_, i) => cell(t, 0, i))).toEqual(['Name', 'Role', 'Notes']);
    expect(t.rows).toHaveLength(3);
    expect(t.align).toEqual(['left', 'center', 'right']);
    expect(JSON.stringify(t)).not.toContain('---');
    expect(cell(t, 1, 2)).toBe('likes bold');
  });

  it('6. empty cells are preserved', () => {
    const t = tables(parse(T).blocks)[0];
    expect(cell(t, 2, 1)).toBe('');
    expect(cell(t, 2, 2)).toBe('');
    expect(t.rows[1]).toHaveLength(3);
    expect(cell(t, 2, 0)).toBe('Bob');
  });

  it('7. wide tables and long cell text lose nothing', () => {
    const long = 'word '.repeat(300).trim();
    const cols = 12;
    const header = `| ${Array.from({ length: cols }, (_, i) => `H${i}`).join(' | ')} |`;
    const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
    const row = `| ${Array.from({ length: cols }, (_, i) => (i === 3 ? long : `c${i}`)).join(' | ')} |`;
    const t = tables(parse([header, sep, row, row].join('\n')).blocks)[0];
    expect(t.columnCount).toBe(12);
    expect(t.rows).toHaveLength(2);
    expect(cell(t, 1, 3)).toBe(long);
    expect(cell(t, 2, 11)).toBe('c11');
  });

  it('rows with missing or extra cells are padded, never dropped', () => {
    const t = tables(parse('| A | B | C |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |').blocks)[0];
    expect(t.columnCount).toBe(4);
    expect(t.rows.every((r) => r.length === 4)).toBe(true);
    expect(cell(t, 2, 3)).toBe('4');
  });

  it('escaped pipes, <br> and unicode inside cells', () => {
    const t = tables(parse('| a | b |\n|---|---|\n| x \\| y | line1<br>line2 |\n| 日本語 | café ✓ |').blocks)[0];
    expect(cell(t, 1, 0)).toBe('x | y');
    expect(cell(t, 1, 1)).toBe('line1\nline2');
    expect(cell(t, 2, 0)).toBe('日本語');
  });

  it('tables without outer pipes parse', () => {
    const t = tables(parse('a | b\n--- | ---\n1 | 2').blocks)[0];
    expect(t.columnCount).toBe(2);
    expect(cell(t, 1, 1)).toBe('2');
  });

  it('copied (tab-separated) tables become real tables; tab lists do not', () => {
    const t = tables(parse('Intro\n\nName\tAge\nAnn\t30\nBob\t41\n\nEnd').blocks);
    expect(t).toHaveLength(1);
    expect(cell(t[0], 2, 1)).toBe('41');
    const none = tables(parse('1.\tOne\n2.\tTwo').blocks);
    expect(none).toHaveLength(0);
  });

  it('14. malformed tables are kept as text and flagged', () => {
    const d = parse('| A | B | C |\n|---|---|\n| 1 | 2 | 3 |');
    expect(tables(d.blocks)).toHaveLength(0);
    expect(runsText((d.blocks[0] as any).runs)).toContain('| 1 | 2 | 3 |');
    expect(d.warnings.length).toBe(1);
    const noSep = parse('| A | B |\n| 1 | 2 |');
    expect(noSep.warnings.length).toBe(1);
    expect(tables(noSep.blocks)).toHaveLength(0);
  });
});

describe('parser — robustness', () => {
  it('11. unicode and non-English text survive', () => {
    const s = '# Привет мир\n\nمرحبا بالعالم — 你好，世界 😀 ñ ü';
    const d = parse(s);
    expect(d.title).toBe('Привет мир');
    expect(runsText((d.blocks[1] as any).runs)).toBe('مرحبا بالعالم — 你好，世界 😀 ñ ü');
  });

  it('12. very long responses parse quickly with nothing dropped', () => {
    const parts: string[] = [];
    for (let i = 0; i < 3000; i++) parts.push(`## Section ${i}\n\nParagraph ${i} with **bold** text.\n\n- item ${i}\n- item ${i}b`);
    const rows = Array.from({ length: 800 }, (_, i) => `| r${i} | v${i} | x |`).join('\n');
    parts.push(`| a | b | c |\n|---|---|---|\n${rows}`);
    const t0 = Date.now();
    const d = parse(parts.join('\n\n'));
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(d.stats.headings).toBe(3000);
    expect(tables(d.blocks)[0].rows).toHaveLength(800);
  });

  it('13. empty and whitespace-only input', () => {
    for (const s of ['', '   ', '\n\n\t\n']) {
      const d = parse(s);
      expect(d.blocks).toEqual([]);
      expect(d.stats.words).toBe(0);
    }
  });

  it('15. HTML-like strings are literal text; unsafe links are never active', () => {
    const d = parse('<script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[a](javascript:alert(1)) [b](JaVaScRiPt:alert(2)) [c](data:text/html;base64,AAAA) [d](java\tscript:x) [ok](mailto:a@b.co)\n\n<div onclick="x()">hi</div>');
    const all = JSON.stringify(d.blocks);
    expect(all).toContain('<script>alert(1)</script>');
    expect(all).toContain('onerror=alert(1)');
    const hrefs: string[] = [];
    const walk = (bs: Block[]) => bs.forEach((b: any) => { (b.runs ?? []).forEach((r: any) => r.href && hrefs.push(r.href)); if (b.blocks) walk(b.blocks); });
    walk(d.blocks);
    expect(hrefs).toEqual(['mailto:a@b.co']);
  });

  it('preserves the original input separately from the model', () => {
    const src = 'Title\r\n\r\n| a | b |\r\n|---|---|\r\n| 1 | 2 |';
    const d = parse(src);
    expect(d.source).toBe(src);
    expect(d.normalized).not.toContain('\r');
  });

  it('plain-text title heuristic only fires for short unpunctuated first lines', () => {
    expect(parse('Quarterly Report\n\nBody text here.', true).blocks[0].type).toBe('heading');
    expect(parse('This is a sentence.\n\nBody text here.', true).blocks[0].type).toBe('paragraph');
    expect(parse('Just one line', true).blocks[0].type).toBe('paragraph');
  });
});
