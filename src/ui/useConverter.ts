import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
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
  loadBatch,
  loadSettings,
  readClipboardText,
  saveDraft,
  saveBatch,
  saveSettings,
  takeHandoff,
} from '../platform/chromeApi';

export type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; format: ExportFormat | 'zip' }
  | { kind: 'success'; message: string; notes: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'info'; message: string };

const FORMAT_LABEL: Record<ExportFormat, string> = { docx: 'Word document', pdf: 'PDF', html: 'HTML file' };

export interface BatchItem {
  id: number;
  title: string;
  text: string;
  format: ExportFormat;
}

function sanitizeBatch(value: unknown): BatchItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BatchItem => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Record<string, unknown>;
    return Number.isSafeInteger(candidate.id)
      && typeof candidate.title === 'string'
      && typeof candidate.text === 'string'
      && (candidate.format === 'docx' || candidate.format === 'pdf' || candidate.format === 'html');
  });
}

export function useConverter() {
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [confirmClear, setConfirmClear] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchFormat, setBatchFormat] = useState<ExportFormat>('pdf');
  const nextBatchId = useRef(1);
  const textRef = useRef(text);
  textRef.current = text;

  // Initial load: preferences, then a one-shot hand-off from the popup, else the opt-in draft.
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadSettings();
      const handoff = await takeHandoff();
      const draft = handoff === null && s.rememberDraft ? await loadDraft() : '';
      const batch = await loadBatch();
      if (!alive) return;
      setSettings(s);
      setText((cur) => (cur === '' ? (handoff ?? draft) : cur));
      const restoredBatch = sanitizeBatch(batch);
      setBatchItems(restoredBatch);
      nextBatchId.current = restoredBatch.reduce((next, item) => Math.max(next, item.id + 1), 1);
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
    void saveBatch(batchItems).catch((error: unknown) => {
      setStatus({
        kind: 'error',
        message: `Couldn't keep the ZIP batch available if this popup closes. ${error instanceof Error ? error.message : ''}`.trim(),
      });
    });
  }, [batchItems, ready]);

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

  const addCurrentToBatch = useCallback((format: ExportFormat) => {
    const source = textRef.current;
    if (source.trim() === '') {
      setStatus({ kind: 'error', message: 'Paste a response before adding it to the ZIP.' });
      return;
    }
    const parsed = parseDocument(source);
    const index = batchItems.length + 1;
    const title = settings.title.trim() || parsed.title || `Document ${index}`;
    setBatchItems((items) => [...items, { id: nextBatchId.current++, title, text: source, format }]);
    setText('');
    setStatus({ kind: 'info', message: `"${title}" added to the ZIP list. Paste the next response when ready.` });
  }, [batchItems.length, settings.title]);

  const removeBatchItem = useCallback((id: number) => {
    setBatchItems((items) => items.filter((item) => item.id !== id));
  }, []);

  const exportBatch = useCallback(async () => {
    if (batchItems.length === 0) {
      setStatus({ kind: 'error', message: 'Add at least one pasted response before creating a ZIP.' });
      return;
    }
    setStatus({ kind: 'busy', format: 'zip' });
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const notes = new Set<string>();
      for (const item of batchItems) {
        const doc = parseDocument(item.text);
        const result = await generate(item.format, doc, { ...settings, title: item.title });
        const dot = result.filename.lastIndexOf('.');
        const base = result.filename.slice(0, dot);
        const extension = result.filename.slice(dot);
        let filename = result.filename;
        let suffix = 2;
        while (usedNames.has(filename.toLowerCase())) filename = `${base}-${suffix++}${extension}`;
        usedNames.add(filename.toLowerCase());
        zip.file(filename, result.data);
        result.notes.forEach((note) => notes.add(note));
      }
      const data = await zip.generateAsync({ type: 'uint8array' });
      const filename = `docraft-batch-${new Date().toISOString().slice(0, 10)}.zip`;
      downloadBlob(data, filename, 'application/zip');
      setBatchItems([]);
      setStatus({
        kind: 'success',
        message: `${batchItems.length} document${batchItems.length === 1 ? '' : 's'} saved in ${filename}. Check your Downloads folder.`,
        notes: [...notes],
      });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: `Couldn't create the ZIP. ${e instanceof Error ? e.message : ''}`.trim(),
      });
    }
  }, [batchItems, settings]);

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
    batchItems, batchFormat, setBatchFormat, addCurrentToBatch, removeBatchItem, exportBatch,
    busy: status.kind === 'busy',
  };
}
