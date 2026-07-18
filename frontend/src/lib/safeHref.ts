/**
 * URL safety guard for any href that might be derived from data rather than a
 * hard-coded route. Permits same-origin relative paths and a short allowlist of
 * safe schemes; rejects `javascript:`, `data:`, `vbscript:`, and similar
 * script-bearing schemes that enable XSS via links.
 */
const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;
const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file):/i;

export function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (value === "") return false;
  if (DANGEROUS_SCHEME.test(value)) return false;
  // Relative paths and fragments are same-origin and safe.
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }
  return SAFE_SCHEME.test(value);
}

/** Returns the href if safe, otherwise a harmless inert fallback. */
export function safeHref(href: string): string {
  return isSafeHref(href) ? href : "#";
}
