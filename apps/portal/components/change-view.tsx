'use client';

// Change your time (drafts reschedule.html, reschedule-phone.html). She already holds a time. Pick one open time and
// switch: it is instant, there is no approval step, and her old time is released. Laptop: one column per weekday.
// Phone: a list of days. Her current time is drawn with a solid border and a grey fill, marked "Your time now".
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button, Icon } from '@btx/ui';
import { easternDate, shortDay } from '@/lib/format';
import { addDays, clock, dayLabel, mondayOf, type Booking, type Slot } from '@/lib/journey';
import { Chip, ErrorBox, useBook } from './booking-parts';
import { JourneyPage } from './journey-page';
import b from './booking.module.css';

export type ChangeProps = {
  accountName: string;
  booking: Booking;
  /** Open times, not counting her current one. */
  slots: Slot[];
  preselect: string | null;
  takenLabel: string | null;
  statusHref: string;
  noTimeHref: string;
  stress: boolean;
  initialNote: string;
};

type Item = { slot: Slot; current: boolean };

export function ChangeView(p: ChangeProps) {
  const [pickedId, setPickedId] = useState<string | null>(p.preselect);
  const [note, setNote] = useState(p.initialNote);
  const { book, busy, problem } = useBook({ mode: 'change', stress: p.stress });
  const cur: Slot = { id: p.booking.slotId, startsAt: p.booking.startsAt, endsAt: p.booking.endsAt };
  const picked = p.slots.find((s) => s.id === pickedId) ?? null;
  const all: Item[] = useMemo(
    () => [...p.slots.map((slot) => ({ slot, current: false })), { slot: cur, current: true }].sort((x, y) => x.slot.startsAt.localeCompare(y.slot.startsAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cur is built from p.booking
    [p.slots, p.booking.slotId, p.booking.startsAt],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    all.forEach((it) => {
      const d = easternDate(it.slot.startsAt);
      m.set(d, [...(m.get(d) ?? []), it]);
    });
    return m;
  }, [all]);
  const days = [...byDay.keys()].sort();
  const weeks: string[] = [];
  if (days.length) for (let m = mondayOf(days[0]); m <= days[days.length - 1]; m = addDays(m, 7)) weeks.push(m);
  const wide = days.some((d) => new Date(`${d}T12:00:00Z`).getUTCDay() % 6 === 0);
  const cols = wide ? 7 : 5;

  const old = dayLabel(p.booking.startsAt);
  const label = picked ? `Switch to ${dayLabel(picked.startsAt)}, ${clock(picked.startsAt)}` : 'Switch to a new time';
  const phoneLabel = picked ? `Switch to ${dayLabel(picked.startsAt)}` : 'Switch to a new time';
  const submit = () => void book(picked, note);
  const pick = (s: Slot) => setPickedId(s.id);
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <JourneyPage
      accountName={p.accountName}
      back={
        <Link href={p.statusHref} className="btn s">
          <Icon name="left" />
          Back
        </Link>
      }
      primary={
        <Button onClick={submit} disabled={busy}>
          {phoneLabel}
        </Button>
      }
    >
      <div className={b.rc}>
        <Link href={p.statusHref} className={`lk ${b.back}`}>
          <Icon name="left" small />
          <span>Back to your application</span>
        </Link>
        <h1 className={`st ${b.title}`}>Change your time.</h1>
        <p className={b.lead}>Pick one open time.</p>
        {p.takenLabel ? (
          <p className={b.taken} role="status">
            {p.takenLabel} was just taken. Pick another time.
          </p>
        ) : null}
        <p className={b.sw}>Your {old} time is released when you switch.</p>
        {problem === 'pick' ? <ErrorBox>Pick a time first.</ErrorBox> : null}
        {problem === 'saved' ? (
          <p className={b.taken} role="status">
            Note saved.
          </p>
        ) : null}
        {problem === 'note_long' ? <ErrorBox>Shorten your note to 1,000 characters or fewer.</ErrorBox> : null}
        {problem === 'failed' ? <ErrorBox>We couldn&apos;t switch your time. Check your connection and try again.</ErrorBox> : null}

        {/* laptop: a column per weekday */}
        <div className={`${b.rgrid} ${wide ? b.rwide : ''}`} role="group" aria-label="Open interview times">
          {weeks.map((m) => (
            <div key={m}>
              <div className={b.rheads} aria-hidden="true">
                {names.slice(0, cols).map((n, i) => (
                  <div className={b.rhead} key={n}>
                    {n}
                    <span className="cdt">{shortDay(addDays(m, i)).toUpperCase()}</span>
                  </div>
                ))}
              </div>
              <div className={b.rrow}>
                {names.slice(0, cols).map((_, i) => {
                  const list = byDay.get(addDays(m, i)) ?? [];
                  return (
                    <div className={b.rcell} key={i}>
                      {list.map((it) =>
                        it.current ? (
                          <div key={it.slot.id}>
                            <div className={b.cur} aria-disabled="true">
                              {clock(it.slot.startsAt)}
                            </div>
                            <p className={b.curNote}>Your time now</p>
                          </div>
                        ) : (
                          <Chip key={it.slot.id} slot={it.slot} on={it.slot.id === pickedId} onPick={pick} className={b.dayChip} />
                        ),
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* phone: a list of days */}
        {days.map((day) => (
          <div className={b.rday} key={day}>
            <p className="lb">{dayLabel(byDay.get(day)![0].slot.startsAt)}</p>
            <div className={b.rchips}>
              {byDay.get(day)!.map((it) =>
                it.current ? (
                  <div key={it.slot.id}>
                    <div className={b.cur} aria-disabled="true">
                      {clock(it.slot.startsAt)}
                    </div>
                    <p className={b.curNote}>Your time now</p>
                  </div>
                ) : (
                  <Chip key={it.slot.id} slot={it.slot} on={it.slot.id === pickedId} onPick={pick} className={b.dayChip} />
                ),
              )}
            </div>
          </div>
        ))}

        {(
          <div className={`f ${b.note}`}>
            <label className="lb" htmlFor="change-note">
              Anything we should know? <i style={{ fontStyle: 'normal', fontWeight: 400, color: 'var(--muted)' }}>(optional)</i>
            </label>
            <textarea id="change-note" className={b.ta} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        <p className={b.rNo}>
          <Link href={p.noTimeHref} className="lk">
            None of these times work
          </Link>
        </p>
        <div className={b.rActions}>
          <Button size="xl" onClick={submit} disabled={busy}>
            {label}
          </Button>
          <span className={b.rSw}>Your {old} time is released when you switch.</span>
          <Link href={p.noTimeHref} className="lk">
            None of these times work
          </Link>
        </div>
      </div>
    </JourneyPage>
  );
}
