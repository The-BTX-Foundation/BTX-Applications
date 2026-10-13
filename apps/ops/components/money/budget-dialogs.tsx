'use client';

// The two small forms on Budget: "Log spending" (also edits a row) and "Update funds on hand". Same look as the Figma
// "Log a sponsorship" dialog: bold labels, 40px inputs, a gold button and Cancel.
import { useState } from 'react';
import { parseCents, type BudgetCategory, type SpendRow } from '@/lib/money-shared';
import type { SpendInput } from '@/lib/money-writes';
import { Dialog, Field } from './ui';

// Today's date for the date field (the browser's clock).
const todayIso = () => new Date().toISOString().slice(0, 10);

export function SpendDialog({ row, categories, onClose, onSave }: { row?: SpendRow; categories: BudgetCategory[]; onClose: () => void; onSave: (v: SpendInput) => Promise<void> }) {
  const real = row && row.spent_on !== null;
  const [what, setWhat] = useState(real ? row.description : '');
  const [cat, setCat] = useState(row?.category_id ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(real && row.amount_cents != null ? String(row.amount_cents / 100) : '');
  const [date, setDate] = useState(real ? (row.spent_on as string) : todayIso());
  const [busy, setBusy] = useState(false);
  const cents = parseCents(amount);
  const ok = what.trim() !== '' && cat !== '' && cents !== null && date !== '';
  const editing = Boolean(real);
  return (
    <Dialog title={editing ? 'Edit spending' : 'Log spending'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok || cents === null) return;
          setBusy(true);
          // The row keeps its id when editing a real entry; a placeholder row has no entry to edit, so it saves as a new one.
          await onSave({ spent_on: date, description: what.trim(), category_id: cat, amount_cents: cents });
          setBusy(false);
        }}
      >
        <Field label="What it paid for">
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What the money paid for" maxLength={300} />
        </Field>
        <Field label="Category">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" inputMode="decimal" />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <p className="mn-hint">It shows under Recent spending and counts toward its category.</p>
        <div className="mn-qa">
          <button type="submit" className="o-btn p mn-b36" disabled={!ok || busy}>
            {editing ? 'Save' : 'Log spending'}
          </button>
          <button type="button" className="o-btn s mn-b36" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function FundsDialog({ current, onClose, onSave }: { current: number; onClose: () => void; onSave: (cents: number) => Promise<void> }) {
  const [amount, setAmount] = useState(String(current / 100));
  const [busy, setBusy] = useState(false);
  const cents = parseCents(amount);
  return (
    <Dialog title="Update funds on hand" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (cents === null) return;
          setBusy(true);
          await onSave(cents);
          setBusy(false);
        }}
      >
        <Field label="In the bank today">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" inputMode="decimal" />
        </Field>
        <div className="mn-qa">
          <button type="submit" className="o-btn p mn-b36" disabled={cents === null || busy}>
            Save
          </button>
          <button type="button" className="o-btn s mn-b36" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}
