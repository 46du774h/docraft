import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { parseDocument } from '../core/parser';
import { DEFAULT_SETTINGS, applyPreset } from '../core/settings';
import type { PresetId, Settings } from '../core/settings';
import { generate, ExportError } from '../exporters';
import type { ExportFormat } from '../exporters';
import { downloadBlob } from '../exporters/download';
import {
  ClipboardUnavailableError,
  clearDraft,
  loadDraft,
  loadSettings,
  readClipboardText,
  saveDraft,
  saveSettings,
  takeHandoff,
} from '../platform/chromeApi';

export type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; format: ExportFormat }
  | { kind: 'success'; message: string; notes: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'info'; message: string };

const FORMAT_LABEL: Record<ExportFormat, string> = { docx: 'Word document', pdf: 'PDF', md: 'Markdown file' };

export function useConverter() {
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [confirmClear, setConfirmClear] = useState(false);
  const textRef = useRef(text);
  textRef.current = text;

  // Initial load: preferences, then a one-shot hand-off from the popup, else the opt-in draft.
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadSettings();
      const handoff = await takeHandoff();
      const draft = handoff === null && s.rememberDraft ? await loadDraft() : '';
      if (!alive) return;
      setSettings(s);
      setText((cur) => (cur === '' ? (handoff ?? draft) : cur));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ready) void saveSettings(settings);
  }, [settings, ready]);

  // Draft recovery is opt-in; turning it off deletes the stored draft immediately.
  useEffect(() => {
    if (!ready) return;
    if (!settings.rememberDraft) {
      void clearDraft();
      return;
    }
    const id = setTimeout(() => void saveDraft(text), 500);
    return () => clearTimeout(id);
  }, [text, settings.rememberDraft, ready]);

  useEffect(() => {
    if (status.kind !== 'success' && status.kind !== 'info') return;
    const id = setTimeout(() => setStatus({ kind: 'idle' }), status.kind === 'success' && status.notes.length ? 12000 : 6000);
    return () => clearTimeout(id);
  }, [status]);

  useEffect(() => {
    if (!confirmClear) return;
    const id = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(id);
  }, [confirmClear]);

  const deferred = useDeferredValue(text);
  const doc = useMemo(() => parseDocument(deferred), [deferred]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const choosePreset = useCallback((p: PresetId) => setSettings((s) => applyPreset(s, p)), []);

  const exportAs = useCallback(
    async (format: ExportFormat) => {
      if (textRef.current.trim() === '') {
        setStatus({ kind: 'error', message: 'Nothing to export yet. Paste a response into the editor first.' });
        return;
      }
      setStatus({ kind: 'busy', format });
      try {
        // Parse the exact current text so the file never lags behind the editor.
        const fresh = parseDocument(textRef.current);
        const result = await generate(format, fresh, settings);
        downloadBlob(result.data, result.filename, result.mime);
        setStatus({
          kind: 'success',
          message: `${FORMAT_LABEL[format]} saved as ${result.filename}. Check your Downloads folder.`,
          notes: result.notes,
        });
      } catch (e) {
        const msg = e instanceof ExportError ? e.message : `Couldn't create the ${FORMAT_LABEL[format]}. ${e instanceof Error ? e.message : ''}`.trim();
        setStatus({ kind: 'error', message: msg });
      }
    },
    [settings],
  );

  const pasteFromClipboard = useCallback(async (): Promise<string | null> => {
    try {
      const t = await readClipboardText();
      if (!t.trim()) {
        setStatus({ kind: 'info', message: 'The clipboard has no text. Copy a response first.' });
        return null;
      }
      return t;
    } catch (e) {
      setStatus({
        kind: 'info',
        message:
          e instanceof ClipboardUnavailableError
            ? 'Clipboard access wasn’t granted. Click in the editor and press Ctrl+V (⌘V on Mac) instead.'
            : 'Couldn’t read the clipboard. Click in the editor and press Ctrl+V (⌘V on Mac) instead.',
      });
      return null;
    }
  }, []);

  const requestClear = useCallback(() => {
    if (textRef.current.length > 200 && !confirmClear) {
      setConfirmClear(true);
      return;
    }
    setText('');
    setConfirmClear(false);
    setStatus({ kind: 'idle' });
  }, [confirmClear]);

  return {
    text, setText, settings, update, choosePreset, ready, doc, status, setStatus,
    exportAs, pasteFromClipboard, requestClear, confirmClear,
    busy: status.kind === 'busy',
  };
}
