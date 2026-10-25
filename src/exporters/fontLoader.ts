export type FontLoader = (file: string) => Promise<string>;

const cache = new Map<string, Promise<string>>();

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Loads a bundled font from the extension package (never from the network). */
export const extensionFontLoader: FontLoader = (file) => {
  let p = cache.get(file);
  if (!p) {
    const url =
      typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(`fonts/${file}`) : `/fonts/${file}`;
    p = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`Could not load bundled font ${file} (${res.status}).`);
      return toBase64(new Uint8Array(await res.arrayBuffer()));
    });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
};
