import type { ParsedDocument } from '../core/types';

export function AnalysisSummary({ doc }: { doc: ParsedDocument }) {
  const s = doc.stats;
  if (doc.blocks.length === 0) return null;
  const parts: [number, string, string][] = [
    [s.headings, 'heading', 'headings'],
    [s.paragraphs, 'paragraph', 'paragraphs'],
    [s.lists, 'list', 'lists'],
    [s.tables, 'table', 'tables'],
    [s.codeBlocks, 'code block', 'code blocks'],
    [s.quotes, 'quote', 'quotes'],
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1" aria-label="Detected structure">
        <span className="text-[11px] text-ink-500">Detected:</span>
        {parts.filter(([n]) => n > 0).map(([n, one, many]) => (
          <span key={one} className="chip">{n} {n === 1 ? one : many}</span>
        ))}
      </div>
      {doc.warnings.map((w) => (
        <p key={w} className="rounded-md bg-amber-950 px-2 py-1 text-[11.5px] leading-snug text-amber-200">{w}</p>
      ))}
    </div>
  );
}
