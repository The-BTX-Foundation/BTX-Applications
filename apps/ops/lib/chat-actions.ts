"use client";

// The Board chat's writes, called from client components (the Board chat page, Today's chat card, the area pages' chat).
// Mock mode never calls these: the page keeps new messages and read markers in its own state. Row-level security decides
// what the signed-in person may write; nothing here widens it. Every call gives up after 15 seconds.
import { getBrowserClient, hasSupabaseEnv } from "@btx/data";
import { firstPush, isDuplicateInsert } from "./chat-map";

export const chatIsLive = () => hasSupabaseEnv();

const LIMIT_MS = 15_000;
// A fresh 15-second limit for one request.
const limit = () => AbortSignal.timeout(LIMIT_MS);

type Abortable<T> = PromiseLike<T> & { abortSignal: (s: AbortSignal) => PromiseLike<T> };
type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, string>,
  ) => Abortable<{ data: unknown; error: unknown }>;
};
type One = Abortable<{
  data: Record<string, unknown> | null;
  error: unknown;
}>;
type Writer = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => { single: () => One };
    };
    select: (cols: string) => {
      eq: (c: string, v: string) => { single: () => One };
    };
    upsert: (
      rows: Record<string, unknown>[],
      opts?: { onConflict: string },
    ) => {
      select: (cols: string) => Abortable<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

/**
 * One 15-second budget for a whole send: the board passes the same signal to openDirect and postMessage, so opening a
 * direct conversation, the insert and its read-back share the 15 seconds instead of getting 15 each.
 */
export const sendBudget = () => limit();

// Opens (or finds) the direct conversation with another board member and returns its channel id. Throws when refused.
// `signal` (optional) is the send's shared budget; without it the call gets its own 15 seconds.
export async function openDirect(otherUserId: string, signal: AbortSignal = limit()): Promise<string> {
  const { data, error } = await (getBrowserClient() as unknown as Rpc)
    .rpc("open_direct_channel", { p_other: otherUserId })
    .abortSignal(signal);
  if (error || !data) throw error ?? new Error("no channel");
  return String(data);
}

/** Message ids whose push has been asked for in this tab: each message is pushed once. */
const pushed = new Set<string>();

// Asks the server to push "Board chat" for a saved message, once per message id. Fire and forget: a push problem never
// changes the message the person just sent. The route checks the message is the caller's own and recent, and pushes each
// message once per person.
function pushOnce(messageId: string) {
  if (!firstPush(pushed, messageId)) return;
  void fetch("/api/push/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messageId }),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Posts a message as the signed-in person (the database fills author_id and created_at), then asks the server to push
 * "Board chat" to the channel's other members. Throws when the message did not save.
 * `opts.id` (optional) is the message's own id, made by the caller: a retry of the same message passes the same id, and
 * when the first try had saved after all, the database's unique-id refusal (23505) counts as saved and the saved row is
 * returned. Without it the database makes the id (Today's chat card and the area pages call it that way).
 * `opts.signal` (optional) is the send's shared budget (sendBudget); the insert and the read-back always share one.
 */
export async function postMessage(
  channelId: string,
  body: string,
  opts: { id?: string; signal?: AbortSignal } = {},
): Promise<{ id: string; createdAt: string }> {
  const signal = opts.signal ?? limit();
  const client = getBrowserClient() as unknown as Writer;
  const row: Record<string, unknown> = { channel_id: channelId, body };
  if (opts.id) row.id = opts.id;
  const { data, error } = await client
    .from("chat_messages")
    .insert(row)
    .select("id, created_at")
    .single()
    .abortSignal(signal);
  let saved = !error && data ? data : null;
  if (!saved && opts.id && isDuplicateInsert(error)) {
    // The earlier try saved this message: read it back (its time is the saved one).
    const again = await client
      .from("chat_messages")
      .select("id, created_at")
      .eq("id", opts.id)
      .single()
      .abortSignal(signal);
    saved = !again.error && again.data ? again.data : null;
  }
  if (!saved) throw error ?? new Error("not saved");
  const id = String(saved.id);
  pushOnce(id);
  return { id, createdAt: String(saved.created_at) };
}

/**
 * Marks channels read for the signed-in person (`userId`), each at its own time. The row names the person explicitly and
 * the upsert resolves on the table's key (channel_id, user_id); row-level security still only lets a person write their
 * own markers. True only when every channel's marker came back: under row-level security a refused row returns no error,
 * just no row.
 */
export async function markRead(stamps: Record<string, string>, userId: string): Promise<boolean> {
  const rows = Object.entries(stamps).map(([id, at]) => ({ channel_id: id, user_id: userId, last_read_at: at }));
  if (rows.length === 0) return true;
  try {
    const { data, error } = await (getBrowserClient() as unknown as Writer)
      .from("chat_read_markers")
      .upsert(rows, { onConflict: "channel_id,user_id" })
      .select("channel_id")
      .abortSignal(limit());
    return !error && Array.isArray(data) && data.length === rows.length;
  } catch {
    return false;
  }
}
