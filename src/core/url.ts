const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Returns a normalised URL only for explicitly allowed schemes.
 * javascript:, data:, file:, vbscript:, chrome-extension: and relative URLs return null,
 * so they can never become active links.
 */
export function safeUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  // Strip whitespace/control chars used to smuggle schemes like "java\tscript:".
  // eslint-disable-next-line no-control-regex
  const cleaned = href.replace(/[\u0000-\u0020\u007F-\u009F]/g, '');
  try {
    const u = new URL(cleaned);
    if (!SAFE_PROTOCOLS.has(u.protocol)) return null;
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : cleaned;
  } catch {
    return null;
  }
}
