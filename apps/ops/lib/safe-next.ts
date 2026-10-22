// A return address is accepted only if it is a same-site path (never another site, and never back to the sign-in
// screen or the auth routes). Anything that isn't a single string (a repeated ?next=, a missing one) is ignored.
export function safeNext(next: unknown): string | undefined {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return undefined;
  // Control characters are refused: URL parsers drop tabs and newlines, so "/\t/evil.example" (?next=/%09/evil.example)
  // would turn into "//evil.example", another site.
  if (/[\x00-\x1f\x7f]/.test(next)) return undefined;
  // Belt and braces: the address must resolve to this same site, and its cleaned-up path is what gets checked.
  const base = 'https://ops-hub.invalid';
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return undefined;
  }
  if (url.origin !== base) return undefined;
  if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/auth/')) return undefined;
  return next;
}
