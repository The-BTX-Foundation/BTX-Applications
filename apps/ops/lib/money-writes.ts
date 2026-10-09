'use client';

// The Money pages' write actions for LIVE mode. Mock mode never calls these (the pages change their own state through
// lib/mock-store.ts). Every function here is NOT TESTED: needs the Ops Hub tables (draft schema, not applied). The
// generated types do not know the tables yet, so the browser client is used through a loose shape. The database rules
// (admin and board only on every money table) are the real lock; the pages also hide the controls other roles cannot use.
import { getBrowserClient } from '@btx/data';
import type { GiftSource } from './money-shared';

type Result = { error: unknown; data?: { id?: string } | null };
type Loose = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => PromiseLike<Result> };
    insert: (v: Record<string, unknown>) => { select: (c: string) => { single: () => PromiseLike<Result> } } & PromiseLike<Result>;
  };
};
const db = () => getBrowserClient() as unknown as Loose;

// Approves a quarter plan. The database stamps decided_by and decided_at (budget_plan_stamp); the approval task is done too.
export async function approvePlan(planId: string, taskId: string): Promise<boolean> {
  const a = await db().from('budget_quarter_plans').update({ status: 'approved' }).eq('id', planId);
  if (a.error) return false;
  const b = await db().from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', taskId);
  return !b.error;
}

// Takes an approval or a decline back: the plan waits for approval again and the task is open.
// NOTE (schema): budget_plan_stamp stamps submitted_by with whoever sets 'awaiting_approval', so an undo changes who is
// shown as the person who sent the plan. Ask Dominick whether the stamp should only set it when it is empty.
export async function reopenPlan(planId: string, taskId: string): Promise<boolean> {
  const a = await db().from('budget_quarter_plans').update({ status: 'awaiting_approval', decline_note: null }).eq('id', planId);
  if (a.error) return false;
  const b = await db().from('tasks').update({ status: 'open', completed_at: null }).eq('id', taskId);
  return !b.error;
}

// Sends a plan back with a note: the plan is declined (decline_note), the approval task is declined, and the note is
// added to the task as a comment (task_comments.author_id defaults to auth.uid()).
export async function declinePlan(planId: string, taskId: string, note: string): Promise<boolean> {
  const a = await db().from('budget_quarter_plans').update({ status: 'declined', decline_note: note }).eq('id', planId);
  if (a.error) return false;
  const b = await db().from('tasks').update({ status: 'declined', completed_at: null }).eq('id', taskId);
  if (b.error) return false;
  const c = (await db().from('task_comments').insert({ task_id: taskId, body: note })) as unknown as Result;
  return !c.error;
}

export type SpendInput = { spent_on: string; description: string; category_id: string; amount_cents: number };

// Logs spending (logged_by defaults to auth.uid()). Returns the new row's id, or null.
export async function logSpending(v: SpendInput): Promise<string | null> {
  const { data, error } = await db().from('spending_entries').insert(v).select('id').single();
  return error || !data?.id ? null : data.id;
}

// Edits a spending row.
export async function editSpending(id: string, v: SpendInput): Promise<boolean> {
  const { error } = await db().from('spending_entries').update(v).eq('id', id);
  return !error;
}

// Records "Funds on hand" (a new funds_snapshots row; the page shows the latest).
export async function recordFunds(amount_cents: number, as_of: string): Promise<boolean> {
  const { error } = (await db().from('funds_snapshots').insert({ amount_cents, as_of })) as unknown as Result;
  return !error;
}

export type GiftInput = { gift_on: string; amount_cents: number; source: GiftSource; monthly: boolean; donor: string };

// Logs a gift. A named donor gets a donors row first (donors.created_by defaults to auth.uid()); no name = anonymous.
export async function logGift(v: GiftInput): Promise<boolean> {
  let donorId: string | null = null;
  const name = v.donor.trim();
  if (name) {
    const { data, error } = await db().from('donors').insert({ name }).select('id').single();
    if (error || !data?.id) return false;
    donorId = data.id;
  }
  const { error } = (await db().from('gifts').insert({ donor_id: donorId, gift_on: v.gift_on, amount_cents: v.amount_cents, source: v.source, monthly: v.monthly })) as unknown as Result;
  return !error;
}

export type GrantInput = { name: string; funder: string; amount_cents: number | null; amount_is_up_to: boolean };

// Adds a grant in the first stage (Researching).
export async function addGrant(v: GrantInput): Promise<boolean> {
  const { error } = (await db().from('grants').insert({ name: v.name, funder: v.funder.trim() || null, amount_cents: v.amount_cents, amount_is_up_to: v.amount_is_up_to, stage: 'researching' })) as unknown as Result;
  return !error;
}
