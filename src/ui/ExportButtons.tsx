import type { ExportFormat } from '../exporters';
import { FileIcon, Spinner } from './icons';

const OPTIONS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'docx', label: 'Word', ext: '.docx' },
  { format: 'pdf', label: 'PDF', ext: '.pdf' },
  { format: 'md', label: 'Markdown', ext: '.md' },
];

interface Props {
  onExport: (f: ExportFormat) => void;
  busyFormat?: ExportFormat;
  disabled?: boolean;
  layout?: 'grid' | 'row';
  compact?: boolean;
}

export function ExportButtons({ onExport, busyFormat, disabled, layout = 'grid', compact = false }: Props) {
  return (
    <div role="group" aria-label="Download as" className={layout === 'grid' ? 'grid grid-cols-3 gap-2' : 'flex gap-2'}>
      {OPTIONS.map((o) => {
        const busy = busyFormat === o.format;
        return (
          <button
            key={o.format}
            type="button"
            className={layout === 'grid' ? (compact ? 'export-btn export-btn-icon' : 'export-btn') : 'btn !gap-2 !pl-2'}
            onClick={() => onExport(o.format)}
            disabled={disabled}
            aria-busy={busy}
            aria-label={`Download ${o.label} (${o.ext})`}
            title={`Download ${o.label} (${o.ext})`}
          >
            {busy ? <span className="grid h-5 w-5 place-items-center text-brand-600"><Spinner /></span> : <FileIcon kind={o.format} size={compact ? 20 : layout === 'grid' ? 30 : 22} />}
            {!compact && <span className="flex flex-col items-center leading-tight">
              <span>{busy ? 'Creating…' : o.label}</span>
              {layout === 'grid' && <span className="text-[11px] font-normal text-ink-500">{o.ext}</span>}
            </span>}
          </button>
        );
      })}
    </div>
  );
}
