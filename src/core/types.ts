/** Structured document model produced by the parser. Exporters and the preview consume only this. */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Only ever http(s)/mailto/tel — validated by the parser. */
  href?: string;
  /** Line break (text is ignored). */
  br?: boolean;
}

export type Align = 'left' | 'center' | 'right' | null;

export interface TableCell {
  runs: Run[];
}

export interface ListItem {
  runs: Run[];
  children: Block[];
}

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  runs: Run[];
}
export interface ParagraphBlock {
  type: 'paragraph';
  runs: Run[];
  qa?: 'question' | 'answer';
}
export interface ListBlock {
  type: 'list';
  ordered: boolean;
  start: number;
  items: ListItem[];
}
export interface TableBlock {
  type: 'table';
  align: Align[];
  header: TableCell[];
  rows: TableCell[][];
  columnCount: number;
}
export interface BlockquoteBlock {
  type: 'blockquote';
  blocks: Block[];
}
export interface CodeBlock {
  type: 'code';
  lang: string;
  text: string;
}
export interface HrBlock {
  type: 'hr';
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | TableBlock
  | BlockquoteBlock
  | CodeBlock
  | HrBlock;

export interface DocStats {
  words: number;
  chars: number;
  headings: number;
  paragraphs: number;
  lists: number;
  tables: number;
  codeBlocks: number;
  quotes: number;
}

export interface ParsedDocument {
  /** Exactly what the user pasted — never modified. */
  source: string;
  /** Source with line endings normalised and tab-separated tables converted to pipe tables. */
  normalized: string;
  blocks: Block[];
  /** Text of the first heading, if any. */
  title?: string;
  stats: DocStats;
  /** Non-fatal notes, e.g. a table that looked malformed and was kept as text. */
  warnings: string[];
}
