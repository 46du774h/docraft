import type { Block, HeadingBlock } from './types';

export interface DocumentHeading {
  id: string;
  level: HeadingBlock['level'];
  text: string;
}

export function extractHeadings(blocks: Block[]): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  const occurrences = new Map<string, number>();

  const visit = (items: Block[]) => {
    for (const block of items) {
      if (block.type === 'heading') {
        const text = block.runs.map((run) => run.text).join('').trim();
        const base = text
          .normalize('NFKD')
          .replace(/\p{M}/gu, '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-|-$/g, '') || 'section';
        const count = occurrences.get(base) ?? 0;
        occurrences.set(base, count + 1);
        headings.push({ id: count === 0 ? base : `${base}-${count + 1}`, level: block.level, text });
      } else if (block.type === 'blockquote') {
        visit(block.blocks);
      } else if (block.type === 'list') {
        for (const item of block.items) visit(item.children);
      }
    }
  };

  visit(blocks);
  return headings;
}
