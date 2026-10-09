"use client";

// The Board chat's writes, called from the page's client component. Mock mode (no Supabase env) does nothing here: the
// component keeps the new message and the read marker in its own state. Live mode calls the draft tables and functions.
import { getBrowserClient, hasSupabaseEnv } from "@btx/data";

export const chatIsLive = () => hasSupabaseEnv();

type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, string>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
type Writer = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => PromiseLike<{
          data: Record<string, unknown> | null;
          error: unknown;
        }>;
      };
    };
    upsert: (
      rows: Record<string, unknown>[],
    ) => PromiseLike<{ error: unknown }>;
  };
};

// Opens (or finds) the direct conversation with another board member and returns its channel id.
export async function openDirect(otherUserId: string): Promise<string> {
  // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
  const { data, error } = await (getBrowserClient() as unknown as Rpc).rpc(
    "open_direct_channel",
    { p_other: otherUserId },
  );
  if (error) throw error;
  return String(data);
}

// Posts a message as the signed-in person; the database fills author_id and created_at.
export async function postMessage(
  channelId: string,
  body: string,
): Promise<{ id: string; createdAt: string }> {
  // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
  const { data, error } = await (getBrowserClient() as unknown as Writer)
    .from("chat_messages")
    .insert({ channel_id: channelId, body })
    .select("id, created_at")
    .single();
  if (error || !data) throw error ?? new Error("not saved");
  return { id: String(data.id), createdAt: String(data.created_at) };
}

// Marks channels read for the signed-in person (user_id defaults to auth.uid()).
export async function markRead(channelIds: string[]): Promise<void> {
  if (channelIds.length === 0) return;
  // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
  const now = new Date().toISOString();
  const { error } = await (getBrowserClient() as unknown as Writer)
    .from("chat_read_markers")
    .upsert(channelIds.map((id) => ({ channel_id: id, last_read_at: now })));
  if (error) throw error;
}
