'use client';

// The Budget page and the phone approval screen share one state, so approving on the phone shows as approved on Budget.
// MOCK mode keeps it in lib/mock-store.ts. LIVE mode writes to the draft tables (lib/money-writes.ts, NOT TESTED: needs the
// Ops Hub tables) and then asks the server for the page again, so the state below is always what the server sent.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMockState } from '@/lib/mock-store';
import { approvePlan, declinePlan, editSpending, logSpending, recordFunds, reopenPlan, type SpendInput } from '@/lib/money-writes';
import type { BudgetCategory, BudgetData, Fund, PlanStatus, SpendRow } from '@/lib/money-shared';

type State = { status: PlanStatus; decline_note: string | null; decided_at: string | null; categories: BudgetCategory[]; recent: SpendRow[]; funds: Fund };

export function useBudget(data: BudgetData, demo: string | undefined) {
  const router = useRouter();
  const live = data.mode === 'live';
  const initial: State = { status: data.plan.status, decline_note: data.plan.decline_note, decided_at: data.plan.decided_at, categories: data.categories, recent: data.recent, funds: data.funds };
  const [st, setSt] = useMockState<State>(`budget:${demo ?? ''}`, initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = live ? initial : st;

  // Runs a live write, then reloads the page's data; shows a plain message when the write fails.
  async function liveWrite(f: () => Promise<boolean>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const ok = await f();
    setBusy(false);
    if (ok) router.refresh();
    else setError("That didn't save. Try again.");
    return ok;
  }

  const patch = (p: Partial<State>) => setSt((cur) => ({ ...cur, ...p }));

  return {
    state: s,
    busy,
    error,
    approve: async () => {
      if (live) await liveWrite(() => approvePlan(data.plan.id, data.plan.task_id));
      else patch({ status: 'approved', decided_at: new Date().toISOString(), decline_note: null });
    },
    reopen: async () => {
      if (live) await liveWrite(() => reopenPlan(data.plan.id, data.plan.task_id));
      else patch({ status: 'awaiting_approval', decided_at: null, decline_note: null });
    },
    decline: async (note: string) => {
      if (live) await liveWrite(() => declinePlan(data.plan.id, data.plan.task_id, note));
      else patch({ status: 'declined', decline_note: note, decided_at: new Date().toISOString() });
    },
    // Logs a new spending row (id undefined) or edits one.
    saveSpending: async (id: string | undefined, v: SpendInput): Promise<boolean> => {
      const cat = s.categories.find((c) => c.id === v.category_id);
      if (live) return liveWrite(() => (id ? editSpending(id, v) : logSpending(v).then((x) => x !== null)));
      setSt((cur) => {
        const old = id ? cur.recent.find((r) => r.id === id) : undefined;
        const row: SpendRow = { id: id ?? `new-${Date.now()}`, spent_on: v.spent_on, description: v.description, category_id: v.category_id, category: cat?.short ?? '', amount_cents: v.amount_cents };
        // The category's spent total moves by the new amount (minus the old one when editing a real row).
        const categories = cur.categories.map((c) => {
          let spent = c.spent_cents;
          if (old && old.category_id === c.id && old.amount_cents) spent -= old.amount_cents;
          if (c.id === v.category_id) spent += v.amount_cents;
          return spent === c.spent_cents ? c : { ...c, spent_cents: spent };
        });
        const rest = id ? cur.recent.map((r) => (r.id === id ? row : r)) : [row, ...cur.recent].slice(0, 5);
        return { ...cur, categories, recent: rest };
      });
      return true;
    },
    saveFunds: async (cents: number, by: string): Promise<boolean> => {
      const asOf = new Date().toISOString().slice(0, 10);
      if (live) return liveWrite(() => recordFunds(cents, asOf));
      patch({ funds: { cents, as_of: asOf, by } });
      return true;
    },
  };
}
