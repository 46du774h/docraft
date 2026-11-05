import { useRef } from 'react';
import { AnalysisSummary } from '../ui/AnalysisSummary';
import { BatchExportPanel } from '../ui/BatchExportPanel';
import { DocumentPreview } from '../ui/DocumentPreview';
import { ExportButtons } from '../ui/ExportButtons';
import { InputEditor } from '../ui/InputEditor';
import type { EditorHandle } from '../ui/InputEditor';
import { SettingsPanel } from '../ui/SettingsPanel';
import { StatusBanner } from '../ui/StatusBanner';
import { Toolbar } from '../ui/Toolbar';
import { LogoMark } from '../ui/icons';
import { useConverter } from '../ui/useConverter';
import { countText } from '../core/parser';

export function Workspace() {
  const c = useConverter();
  const editor = useRef<EditorHandle>(null);
  const { chars, words } = countText(c.text);

  const paste = async () => {
    const t = await c.pasteFromClipboard();
    if (t !== null) editor.current?.insert(t);
  };

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-200 bg-ink-50 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <div>
            <h1 className="text-[15px] font-semibold leading-tight text-ink-900">Docraft</h1>
            <p className="text-[11.5px] text-ink-500">Workspace. Everything is processed locally.</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[12px] text-ink-500 sm:inline">Download as</span>
          <ExportButtons layout="row" onExport={c.exportAs} busyFormat={c.status.kind === 'busy' && c.status.format !== 'zip' ? c.status.format : undefined} disabled={c.busy} />
        </div>
      </header>

      {c.status.kind !== 'idle' && c.status.kind !== 'busy' && (
        <div className="px-4 pt-3"><StatusBanner status={c.status} onDismiss={() => c.setStatus({ kind: 'idle' })} /></div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(380px,1.1fr)_minmax(420px,1.25fr)_300px]">
        <section className="flex min-h-[480px] min-w-0 flex-col gap-2.5" aria-label="Input">
          <Toolbar onPaste={paste} onClear={c.requestClear} confirmClear={c.confirmClear} chars={chars} words={words} hasText={c.text.trim() !== ''} />
          {c.settings.multiplePaste && (
            <BatchExportPanel
              items={c.batchItems}
              format={c.batchFormat}
              onFormatChange={c.setBatchFormat}
              onAdd={() => c.addCurrentToBatch(c.batchFormat)}
              onRemove={c.removeBatchItem}
              onExport={() => void c.exportBatch()}
              disabled={c.busy}
            />
          )}
          <div className="min-h-[360px] flex-1">
            <InputEditor ref={editor} value={c.text} onChange={c.setText} label="Response text" autoFocus
              placeholder={'Paste a full response here.\n\nMarkdown is detected automatically: headings, lists, tables, code blocks, quotes and links.'} />
          </div>
          <AnalysisSummary doc={c.doc} />
        </section>

        <section className="min-h-[480px] min-w-0 overflow-hidden rounded-xl border border-ink-200 bg-ink-100 shadow-sm" aria-label="Preview">
          <DocumentPreview doc={c.doc} settings={c.settings} />
        </section>

        <aside className="min-w-0 overflow-y-auto rounded-xl border border-ink-200 bg-ink-50 p-4 shadow-sm" aria-label="Settings">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-900">Document settings</h2>
          <SettingsPanel settings={c.settings} update={c.update} choosePreset={c.choosePreset} />
        </aside>
      </main>
    </div>
  );
}
