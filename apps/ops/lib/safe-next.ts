// A return address is accepted only if it is a same-site path (never another site, and never back to the sign-in
// screen or the auth routes).
export function safeNext(next: string | null | undefined): string | undefined {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return undefined;
  if (next.startsWith('/sign-in') || next.startsWith('/auth/')) return undefined;
  return next;
}
