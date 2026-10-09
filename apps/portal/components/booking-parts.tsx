'use client';

// Pieces shared by the booking pages: a time button, the "book it" call, and the error box.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorIcon, Icon } from '@btx/ui';
import { bookSlot, getAuthMode, getBrowserClient } from '@btx/data';
import { clock, dayLabel, type Slot } from '@/lib/journey';
import b from './booking.module.css';

/** One time button (6:00 PM). Picked = ink fill with a check. */
export function Chip({ slot, on, onPick, className }: { slot: Slot; on: boolean; onPick: (s: Slot) => void; className?: string }) {
  return (
    <button
      type="button"
      className={`${b.chip} ${on ? b.on : ''} ${className ?? ''}`}
      aria-pressed={on}
      aria-label={`${dayLabel(slot.startsAt)}, ${clock(slot.startsAt)}`}
      onClick={() => onPick(slot)}
    >
      {on ? <Icon name="check" /> : null}
      {clock(slot.startsAt)}
    </button>
  );
}

export function ErrorBox({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p className={b.err} role="alert" id={id}>
      <ErrorIcon />
      <span>{children}</span>
    </p>
  );
}

export type BookProblem = 'pick' | 'failed' | null;

// Books (or switches to) a slot. In mock mode there is no database: it goes to the matching status preview with the
// time she picked. Live, it calls switch_booking; 'taken' sends her back to the open times with the notice.
// NOT TESTED AGAINST LIVE DATA.
export function useBook(opts: { mode: 'schedule' | 'change'; stress: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<BookProblem>(null);

  async function book(slot: Slot | null) {
    if (!slot) {
      setProblem('pick');
      return;
    }
    setProblem(null);
    setBusy(true);
    if (getAuthMode() === 'mock') {
      const demo = `${opts.mode === 'change' ? 'switched' : 'booked'}${opts.stress ? '-stress' : ''}`;
      router.push(`/status?demo=${demo}&at=${encodeURIComponent(slot.startsAt)}`);
      return;
    }
    const r = await bookSlot(getBrowserClient(), slot.id);
    if (r.ok) {
      router.push('/status');
      router.refresh();
      return;
    }
    setBusy(false);
    if (r.kind === 'taken' || r.kind === 'slot_gone') {
      router.replace(`/status/${opts.mode === 'change' ? 'change' : 'schedule'}?taken=${encodeURIComponent(slot.startsAt)}`);
      router.refresh();
      return;
    }
    setProblem('failed');
  }
  return { book, busy, problem, setProblem };
}
