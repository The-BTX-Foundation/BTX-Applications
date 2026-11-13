// Ids made in the browser for new tasks and comments, and the short retry memory that stops a retried add from making a
// second copy. The writer inserts the row with an id it chose; when the request fails (or seems to fail: the row may
// have been written and only the answer lost), a retry of the SAME words within two minutes reuses that id. The
// database then answers "already exists" (Postgres code 23505), which the writer counts as success, so a retry finishes
// a half-made task instead of adding a twin. After two minutes, or once the add succeeds, the memory is gone, so the same
// words typed again on purpose make a new row.

/** How long a failed attempt's id is reused for a retry of the same words. */
export const RETRY_MS = 2 * 60_000;

/** A random v4 UUID: crypto.randomUUID where the browser has it, else built from crypto.getRandomValues. */
export function newId(c: Pick<Crypto, 'getRandomValues'> & { randomUUID?: unknown } = globalThis.crypto): string {
  if (typeof c.randomUUID === 'function') return (c.randomUUID as () => string).call(c);
  const b = c.getRandomValues(new Uint8Array(16));
  // Version 4 in the high nibble of byte 6, the RFC 4122 variant in the top bits of byte 8.
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** True when a database error is "this row already exists" (a unique key clash, Postgres 23505). */
export function isDuplicate(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === '23505';
}

export type RetryIds = {
  /** The id for an attempt: the failed attempt's id when the same payload failed under two minutes ago, else a new one. */
  take: (key: string, now: number) => string;
  /** Remembers a failed attempt's id for a retry of the same payload. */
  fail: (key: string, id: string, now: number) => void;
  /** Forgets the payload after a success. */
  done: (key: string) => void;
  /**
   * Forgets every payload that remembers one of these ids. The board calls it when a refresh lists the id: the row is
   * on the board, so the same words typed again on purpose are a new task, never a retry of that one.
   */
  forget: (ids: Iterable<string>) => void;
};

/** A retry memory (one per writer module). `make` makes new ids (tests pass a counter). */
export function retryIds(make: () => string = () => newId(), ttl = RETRY_MS): RetryIds {
  const seen = new Map<string, { id: string; at: number }>();
  return {
    take(key, now) {
      // Drop anything past its two minutes first, so the map never grows.
      for (const [k, v] of seen) if (now - v.at >= ttl) seen.delete(k);
      return seen.get(key)?.id ?? make();
    },
    fail(key, id, now) {
      seen.set(key, { id, at: now });
    },
    done(key) {
      seen.delete(key);
    },
    forget(ids) {
      const gone = new Set(ids);
      for (const [k, v] of seen) if (gone.has(v.id)) seen.delete(k);
    },
  };
}

/** The retry key for a new task (the same words, area, date and person). */
export const taskKey = (title: string, area: string, dueOn: string | null, me: string) => `${title}|${area}|${dueOn ?? ''}|${me}`;

/** The retry key for a new comment (the same task, words and person). */
export const commentKey = (taskId: string, body: string, me: string) => `${taskId}|${body}|${me}`;
