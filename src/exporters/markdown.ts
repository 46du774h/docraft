import type { ParsedDocument } from '../core/types';
import type { Settings } from '../core/settings';

/**
 * Markdown export preserves the user's content and structure.
 *
 * - Normalizes trailing whitespace.
 * - Removes leading and trailing blank lines.
 * - Preserves Markdown formatting and LaTeX source.
 * - Does not insert the editable filename into the document content.
 * - Adds exactly one trailing newline when content is present.
 */
export function buildMarkdown(
  doc: ParsedDocument,
  _settings: Settings,
): string {
  const text = doc.normalized
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');

  return text === '' ? '' : `${text}\n`;
}
