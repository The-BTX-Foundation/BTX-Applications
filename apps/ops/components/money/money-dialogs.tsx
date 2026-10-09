'use client';

// The forms for "Log a gift" (Fundraising) and "Add a grant" (Grants): the same dialog look as the Figma "Log a
// sponsorship" form. Saving goes through the page's state hook (mock) or lib/money-writes.ts (live, NOT TESTED).
import { useState } from 'react';
import { GIFT_SOURCES, parseCents, type GiftSource } from '@/lib/money-shared';
import type { GiftInput, GrantInput } from '@/lib/money-writes';
import { Dialog, Field } from './ui';

export function GiftDialog({ onClose, onSave }: { onClose: () => void; onSave: (v: GiftInput) => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [donor, setDonor] = useState('');
  const [source, setSource] = useState<GiftSource>('individual');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [monthly, setMonthly] = useState(false);
  const [busy, setBusy] = useState(false);
  const cents = parseCents(amount);
  return (
    <Dialog title="Log a gift" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (cents === null || !date) return;
          setBusy(true);
          await onSave({ gift_on: date, amount_cents: cents, source, monthly, donor });
          setBusy(false);
        }}
      >
        <Field label="Amount">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" inputMode="decimal" />
        </Field>
        <Field label="Donor">
          <input value={donor} onChange={(e) => setDonor(e.target.value)} placeholder="Name, or leave empty for anonymous" maxLength={200} />
        </Field>
        <Field label="Source">
          <select value={source} onChange={(e) => setSource(e.target.value as GiftSource)}>
            {GIFT_SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <label className="mn-check">
          <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
          Gives every month
        </label>
        <div className="mn-qa">
          <button type="submit" className="o-btn p mn-b36" disabled={cents === null || busy}>
            Log gift
          </button>
          <button type="button" className="o-btn s mn-b36" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function GrantDialog({ onClose, onSave }: { onClose: () => void; onSave: (v: GrantInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [funder, setFunder] = useState('');
  const [amount, setAmount] = useState('');
  const [upTo, setUpTo] = useState(false);
  const [busy, setBusy] = useState(false);
  const cents = amount.trim() === '' ? null : parseCents(amount);
  const amountBad = amount.trim() !== '' && cents === null;
  return (
    <Dialog title="Add a grant" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || amountBad) return;
          setBusy(true);
          await onSave({ name: name.trim(), funder, amount_cents: cents, amount_is_up_to: upTo });
          setBusy(false);
        }}
      >
        <Field label="Grant name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What the grant is called" maxLength={200} />
        </Field>
        <Field label="Funder">
          <input value={funder} onChange={(e) => setFunder(e.target.value)} placeholder="Who gives it" maxLength={200} />
        </Field>
        <Field label="Amount">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" inputMode="decimal" />
        </Field>
        <label className="mn-check">
          <input type="checkbox" checked={upTo} onChange={(e) => setUpTo(e.target.checked)} />
          The amount is the most it can be
        </label>
        <p className="mn-hint">It starts under Researching.</p>
        <div className="mn-qa">
          <button type="submit" className="o-btn p mn-b36" disabled={!name.trim() || amountBad || busy}>
            Add grant
          </button>
          <button type="button" className="o-btn s mn-b36" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}
