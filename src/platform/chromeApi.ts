import { DEFAULT_SETTINGS, sanitizeSettings } from '../core/settings';
import type { Settings } from '../core/settings';

/**
 * Thin wrappers over chrome.* APIs with in-memory fallbacks so the UI also runs in tests/dev.
 *
 * Storage policy:
 *  - chrome.storage.local : preferences, and the draft ONLY when the user enabled "remember draft".
 *  - chrome.storage.session: one-shot hand-off from the popup to the workspace (memory only, deleted on read).
 */

const hasStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;
const mem = new Map<string, unknown>();

const KEYS = { settings: 'settings', draft: 'draft', handoff: 'handoff' } as const;

async function getLocal<T>(key: string): Promise<T | undefined> {
  if (!hasStorage) return mem.get(key) as T | undefined;
  const r = await chrome.storage.local.get(key);
  return r[key] as T | undefined;
}
async function setLocal(key: string, value: unknown): Promise<void> {
  if (!hasStorage) mem.set(key, value);
  else await chrome.storage.local.set({ [key]: value });
}
async function removeLocal(key: string): Promise<void> {
  if (!hasStorage) mem.delete(key);
  else await chrome.storage.local.remove(key);
}

export async function loadSettings(): Promise<Settings> {
  try {
    return sanitizeSettings(await getLocal(KEYS.settings));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export async function saveSettings(s: Settings): Promise<void> {
  try {
    await setLocal(KEYS.settings, s);
  } catch {
    /* preferences are best-effort */
  }
}

export async function loadDraft(): Promise<string> {
  try {
    const d = await getLocal<string>(KEYS.draft);
    return typeof d === 'string' ? d : '';
  } catch {
    return '';
  }
}
export async function saveDraft(text: string): Promise<void> {
  try {
    await setLocal(KEYS.draft, text);
  } catch {
    /* quota or storage errors must never block editing */
  }
}
export async function clearDraft(): Promise<void> {
  try {
    await removeLocal(KEYS.draft);
  } catch {
    /* ignore */
  }
}

/** Hands text to the workspace tab through memory-only storage. */
async function putHandoff(text: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) await chrome.storage.session.set({ [KEYS.handoff]: text });
  else mem.set(KEYS.handoff, text);
}
export async function takeHandoff(): Promise<string | null> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      const r = await chrome.storage.session.get(KEYS.handoff);
      const v = r[KEYS.handoff];
      if (typeof v === 'string') {
        await chrome.storage.session.remove(KEYS.handoff);
        return v;
      }
      return null;
    }
    const v = mem.get(KEYS.handoff);
    mem.delete(KEYS.handoff);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function openWorkspace(text?: string): Promise<void> {
  if (text && text.trim()) await putHandoff(text);
  const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('workspace.html') : '/workspace.html';
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) await chrome.tabs.create({ url });
  else window.open(url, '_blank');
}

export class ClipboardUnavailableError extends Error {}

/** User-gesture clipboard read. Falls back to requesting the optional clipboardRead permission once. */
export async function readClipboardText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    // Not granted in this context: ask for the optional permission (must happen inside the click handler).
    if (typeof chrome !== 'undefined' && chrome.permissions?.request) {
      try {
        const granted = await chrome.permissions.request({ permissions: ['clipboardRead'] });
        if (granted) return await navigator.clipboard.readText();
      } catch {
        /* fall through */
      }
    }
    throw new ClipboardUnavailableError('Clipboard access was not granted.');
  }
}
