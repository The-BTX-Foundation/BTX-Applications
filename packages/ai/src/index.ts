// Reads a person's availability written in plain words and turns it into time ranges per day, using Claude Haiku.
// Server-only: it needs ANTHROPIC_API_KEY, which must never reach the browser.
import Anthropic from '@anthropic-ai/sdk';
import { daysBetween, isDay } from './dates';
import { normalizeRanges } from './normalize';
import { MODEL, OUTPUT_SCHEMA, buildSystemPrompt, buildUserMessage } from './prompt';

export type Range = { day: string; start: string; end: string };
export type ReadResult =
  | { ok: true; ranges: Range[]; unread: string[] }
  | { ok: false; reason: 'not-configured' | 'too-long' | 'empty' | 'unreadable' | 'failed' };

export { normalizeRanges } from './normalize';
export { describeRanges } from './describe';

export const MAX_TEXT = 1000;
const TIMEOUT_MS = 15_000;
const MAX_WINDOW_DAYS = 62;

type Client = {
  messages: { create(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown> };
};

export async function readFreeTimes(
  input: {
    text: string;
    windowStart: string;
    windowEnd: string;
    today: string;
    dayStart?: string;
    dayEnd?: string;
    audience: 'board' | 'student';
  },
  deps?: { client?: unknown; apiKey?: string; signal?: AbortSignal },
): Promise<ReadResult> {
  // Nothing in here may throw to the caller, and nothing logs the person's text or the key.
  try {
    const text = typeof input.text === 'string' ? input.text : '';
    if (text.trim() === '') return { ok: false, reason: 'empty' };
    if (text.length > MAX_TEXT) return { ok: false, reason: 'too-long' };

    const apiKey = deps?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    const client = (deps?.client as Client | undefined) ?? (apiKey ? makeClient(apiKey) : undefined);
    if (!client) return { ok: false, reason: 'not-configured' };

    const dayStart = input.dayStart ?? '08:00';
    const dayEnd = input.dayEnd ?? '22:00';
    if (!isDay(input.windowStart) || !isDay(input.windowEnd) || !isDay(input.today)) return { ok: false, reason: 'failed' };
    const dayCount = daysBetween(input.windowStart, input.windowEnd).length;
    if (dayCount === 0 || dayCount > MAX_WINDOW_DAYS) return { ok: false, reason: 'failed' };

    const params = {
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt({ ...input, dayStart, dayEnd }),
      messages: [{ role: 'user', content: buildUserMessage(text) }],
      // Haiku 5.5 thinks by default and thinking counts toward max_tokens; low effort keeps this short job cheap and fast.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    };
    const response = await callWithTimeout(client, params, deps?.signal);

    const parsed = parseResponse(response);
    if (!parsed) return { ok: false, reason: 'failed' };

    const ranges = normalizeRanges(parsed.ranges, { windowStart: input.windowStart, windowEnd: input.windowEnd, dayStart, dayEnd });
    // Nothing usable left, whether the model said it could not read it or simply found no times.
    if (ranges.length === 0) return { ok: false, reason: 'unreadable' };
    return { ok: true, ranges, unread: parsed.couldNotRead };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

function makeClient(apiKey: string): Client {
  // We do our own 15 second limit and do not retry: the person is waiting on the page.
  return new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 }) as unknown as Client;
}

async function callWithTimeout(client: Client, params: Record<string, unknown>, outer?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (outer?.aborted) abort();
  outer?.addEventListener('abort', abort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced against the call so a client that ignores the abort signal still times out.
  const stop = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort();
      reject(new Error('timeout'));
    }, TIMEOUT_MS);
    controller.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  stop.catch(() => {});
  try {
    return await Promise.race([client.messages.create(params, { signal: controller.signal, timeout: TIMEOUT_MS }), stop]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', abort);
  }
}

/** Pulls the schema's JSON out of the reply. Returns null for a refusal, a cut-off reply or the wrong shape. */
function parseResponse(response: unknown): { ranges: Range[]; couldNotRead: string[] } | null {
  const r = response as { stop_reason?: string; content?: Array<{ type?: string; text?: string }> } | null;
  if (!r || r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens' || !Array.isArray(r.content)) return null;
  // Read blocks by type: Haiku 5.5 can put a thinking block first.
  const block = r.content.find((b) => b?.type === 'text' && typeof b.text === 'string');
  if (!block?.text) return null;
  let data: unknown;
  try {
    data = JSON.parse(block.text);
  } catch {
    return null;
  }
  const d = data as { ranges?: unknown; couldNotRead?: unknown } | null;
  if (!d || !Array.isArray(d.ranges)) return null;
  const couldNotRead = Array.isArray(d.couldNotRead)
    ? d.couldNotRead.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim().slice(0, 200)).slice(0, 10)
    : [];
  return { ranges: d.ranges as Range[], couldNotRead };
}
