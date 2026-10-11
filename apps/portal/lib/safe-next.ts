// A return address is accepted only if it is a same-site path under /apply or /status.
export function safeNext(next: string | null | undefined): string | undefined {
  if (!next || next.startsWith('//') || next.includes('\\')) return undefined;
  return /^\/(apply|status)(\/|\?|#|$)/.test(next) ? next : undefined;
}
