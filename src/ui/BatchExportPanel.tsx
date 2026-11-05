import type { ExportFormat } from '../exporters';
import type { BatchItem } from './useConverter';

const LABEL: Record<ExportFormat, string> = { docx: 'Word (.docx)', pdf: 'PDF (.pdf)', html: 'HTML (.html)' };

interface Props {
  items: BatchItem[];
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onExport: () => void;
  disabled?: boolean;
  compact?: boolean;
}

export function BatchExportPanel({ items, format, onFormatChange, onAdd, onRemove, onExport, disabled = false, compact = false }: Props) {
  return (
    <section className={`rounded-xl border border-ink-200 bg-ink-100/80 p-2.5 ${compact ? 'space-y-2' : 'space-y-3'}`} aria-label="Multiple paste ZIP export">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold text-ink-800">ZIP batch <span className="font-normal text-ink-500">({items.length})</span></h2>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-600">
          Format for next paste
          <select
            className="field !w-auto !px-1.5 !py-1 !text-[11px]"
            aria-label="Format for next paste"
            value={format}
            onChange={(event) => onFormatChange(event.target.value as ExportFormat)}
            disabled={disabled}
          >
            <option value="pdf">PDF</option>
            <option value="docx">Word</option>
            <option value="html">HTML</option>
          </select>
        </label>
      </div>
      <button type="button" className="btn w-full !py-1.5 !text-[12px]" onClick={onAdd} disabled={disabled}>
        Add current paste &amp; next
      </button>
      {items.length > 0 && (
        <>
          <ol className="max-h-24 space-y-1 overflow-y-auto" aria-label="Documents in ZIP batch">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-1.5 rounded-md bg-ink-50 px-2 py-1 text-[11px]">
                <span className="min-w-0 flex-1 truncate">{index + 1}. {item.title}</span>
                <span className="shrink-0 text-ink-500">{LABEL[item.format]}</span>
                <button type="button" className="btn-icon !h-5 !w-5" aria-label={`Remove ${item.title} from ZIP`} onClick={() => onRemove(item.id)} disabled={disabled}>×</button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn w-full !py-1.5 !text-[12px]" onClick={onExport} disabled={disabled}>
            {disabled ? 'Creating ZIP…' : `Export ${items.length} ${items.length === 1 ? 'document' : 'documents'} as ZIP`}
          </button>
        </>
      )}
      {items.length === 0 && <p className="text-[11px] text-ink-500">Paste a response, choose its format, then add it. Repeat for each document.</p>}
    </section>
  );
}
