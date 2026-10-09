// Shared bits for the Programs and Outreach write actions. In mock mode (no Supabase env) every action succeeds in
// memory: the component keeps the new row in its own state and nothing is saved. In live mode the action calls the
// draft Ops Hub tables or functions, marked "NOT TESTED: needs the Ops Hub tables". Where the draft has no table or
// function for an action, it answers "not connected yet" instead of guessing.
import { getBrowserClient, hasSupabaseEnv } from '@btx/data';

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

export const NOT_CONNECTED = 'Not connected yet.';

/** True when there is no Supabase env, so actions only change the page's own state. */
export const isMock = () => !hasSupabaseEnv();

/** The answer for an action the draft schema has no table or function for. */
export function notConnected(): { ok: false; message: string } {
  return { ok: false, message: NOT_CONNECTED };
}

// The draft tables are not in the generated database types yet, so writes go through this loose shape.
export type Loose = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => { single: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }> };
    } & PromiseLike<{ error: unknown }>;
    update: (row: Record<string, unknown>) => { eq: (c: string, v: unknown) => PromiseLike<{ error: unknown }> };
  };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** The browser client, typed loosely for the draft tables. */
export const loose = () => getBrowserClient() as unknown as Loose;

/** A new local id for rows added in mock mode. */
let counter = 0;
export const localId = (prefix: string) => `${prefix}-new-${++counter}`;

/** Turns whatever a failed call threw into a short line for the form. */
export function failure(e: unknown): { ok: false; message: string } {
  void e;
  return { ok: false, message: "That didn't save. Try again." };
}
