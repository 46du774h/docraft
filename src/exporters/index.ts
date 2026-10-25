import { buildFilename } from '../core/filename';
import type { Settings } from '../core/settings';
import type { ParsedDocument } from '../core/types';
import type { FontLoader } from './fontLoader';

export type ExportFormat = 'docx' | 'pdf' | 'md';

export const MIME: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  md: 'text/markdown;charset=utf-8',
};

export interface ExportResult {
  format: ExportFormat;
  filename: string;
  data: Uint8Array;
  mime: string;
  /** Human-readable notes to show next to the success message. */
  notes: string[];
}

export class ExportError extends Error {}

export function isEmptyDoc(doc: ParsedDocument): boolean {
  return doc.source.trim() === '' || doc.blocks.length === 0;
}

/** Generates the file in memory. Each format is generated independently of the others. */
export async function generate(
  format: ExportFormat,
  doc: ParsedDocument,
  settings: Settings,
  loadFont?: FontLoader,
  now = new Date(),
): Promise<ExportResult> {
  if (isEmptyDoc(doc)) throw new ExportError('Nothing to export. Paste a response into the editor first.');
  const title = settings.title.trim() || doc.title;
  const filename = buildFilename(title, format, now);
  const notes: string[] = [];

  if (format === 'docx') {
    const { buildDocx } = await import('./docx');
    return { format, filename, data: await buildDocx(doc, settings), mime: MIME.docx, notes };
  }
  if (format === 'pdf') {
    const { buildPdf } = await import('./pdf');
    const font = loadFont ?? (await import('./fontLoader')).extensionFontLoader;
    const res = await buildPdf(doc, settings, font);
    if (res.unsupportedChars.length) {
      const sample = res.unsupportedChars.slice(0, 6).join(' ');
      notes.push(
        `${res.unsupportedChars.length} character${res.unsupportedChars.length === 1 ? '' : 's'} (${sample}) can't be drawn with the PDF fonts and may appear blank. Word and Markdown keep them.`,
      );
    }
    return { format, filename, data: res.data, mime: MIME.pdf, notes };
  }
  const { buildMarkdown } = await import('./markdown');
  return { format, filename, data: new TextEncoder().encode(buildMarkdown(doc, settings)), mime: MIME.md, notes };
}
