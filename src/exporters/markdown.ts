import type { ParsedDocument } from '../core/types';
import type { Settings } from '../core/settings';

/**
 * Markdown export keeps the user's own wording and structure. Only these changes are made:
 *  - line endings → \n, stray control characters removed (see normalizeInput)
 *  - tab-separated tables → pipe tables; pipe tables with too-narrow headers get empty header cells
 *  - an optional document title is prepended as an H1 when the user supplied one
 *  - exactly one trailing newline
 */
export function buildMarkdown(doc: ParsedDocument, s: Settings): string {
  let text = doc.normalized.replace(/[ \t]+$/g, '').replace(/^\n+/, '').replace(/\s+$/, '');
  const title = s.title.trim();
  if (title) text = `# ${title.replace(/\n/g, ' ')}\n\n${text}`;
  return text === '' ? '' : `${text}\n`;
}
