import { useRef } from 'react';
import { AnalysisSummary } from '../ui/AnalysisSummary';
import { ExportButtons } from '../ui/ExportButtons';
import { InputEditor } from '../ui/InputEditor';
import type { EditorHandle } from '../ui/InputEditor';
import { StatusBanner } from '../ui/StatusBanner';
import { Toolbar } from '../ui/Toolbar';
import { ExpandIcon, EyeIcon, LogoMark } from '../ui/icons';
import { useConverter } from '../ui/useConverter';
import { countText } from '../core/parser';
import { openWorkspace } from '../platform/chromeApi';

export function Popup() {
  const c = useConverter();
  const editor = useRef<EditorHandle>(null);
  const { chars, words } = countText(c.text);
  const hasText = c.text.trim() !== '';

  const paste = async () => {
    const t = await c.pasteFromClipboard();
    if (t !== null) editor.current?.insert(t);
  };
  const preview = () => {
    if (!hasText) {
      c.setStatus({ kind: 'error', message: 'Paste a response first, then preview it in the workspace.' });
      return;
    }
    void openWorkspace(c.text);
  };

  return (
    <main className="popup-shell flex h-[400px] w-[320px] flex-col gap-2 p-2.5">
      <header className="popup-header flex items-center gap-2.5">
        <LogoMark size={28} />
        <div className="min-w-0">
          <h1 className="text-[13px] font-semibold leading-tight text-ink-900">Docraft</h1>
          <p className="text-[10px] leading-tight text-ink-500">Local document converter</p>
        </div>
        <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.6)]" title="Ready" aria-label="Ready" />
      </header>

      <div className="popup-actionbar flex items-center justify-between rounded-xl border border-ink-200 bg-ink-100/80 p-1.5">
        <Toolbar compact onPaste={paste} onClear={c.requestClear} confirmClear={c.confirmClear} chars={chars} words={words} hasText={hasText} />
      </div>

      <div className="popup-editor min-h-0 flex-1">
        <InputEditor
          ref={editor}
          value={c.text}
          onChange={c.setText}
          label="Response text"
          autoFocus
          placeholder={'Paste a response here (Ctrl+V).\n\nHeadings, lists, tables, code and links are detected automatically.'}
        />
      </div>

      <AnalysisSummary doc={c.doc} />

      <StatusBanner status={c.status} onDismiss={() => c.setStatus({ kind: 'idle' })} />

      <div className="popup-exports flex items-center justify-between rounded-xl border border-ink-200 bg-ink-100/80 px-2 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-500">Export</span>
        <ExportButtons compact onExport={c.exportAs} busyFormat={c.status.kind === 'busy' ? c.status.format : undefined} disabled={c.busy} />
      </div>

      <div className="popup-footer flex gap-2">
        <button type="button" className="btn-icon flex-1" onClick={preview} title="Preview in workspace" aria-label="Preview in workspace"><EyeIcon /></button>
        <button type="button" className="btn-icon flex-1" onClick={() => void openWorkspace(c.text)} title="Open workspace" aria-label="Open workspace"><ExpandIcon /></button>
      </div>
    </main>
  );
}
