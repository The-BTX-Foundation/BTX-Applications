'use client';

// Schedule your interview (drafts schedule.html, schedule-phone.html, schedule-taken*.html). Laptop: a seven-column
// calendar of the open times. Phone: a week picker and a list of days. One time is picked, then one gold button books
// it. "None of these times work" goes to the free-times page.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button, Icon } from '@btx/ui';
import { shortDay } from '@/lib/format';
import { addDays, clock, dayLabel, groupByDay, mondayOf, WEEKDAYS, type Slot } from '@/lib/journey';
import { easternDate } from '@/lib/format';
import { Chip, ErrorBox, useBook } from './booking-parts';
import { JourneyPage } from './journey-page';
import b from './booking.module.css';

export type ScheduleProps = {
  accountName: string;
  /** Open times (future only). */
  slots: Slot[];
  /** "YYYY-MM-DD" */
  today: string;
  interviewStart: string | null;
  interviewEnd: string | null;
  /** A slot id that is picked on arrival (the frames show one picked). */
  preselect: string | null;
  /** The time that was just taken, as "Tue Oct 6 at 6:00 PM". */
  takenLabel: string | null;
  /** When a time was just taken, its start: the phone opens on that week. */
  takenAt: string | null;
  noTimeHref: string;
  stress: boolean;
};

// A cell shows up to two times; with more it shows one (the picked time, else the first) and "+N more".
const MAX_SHOWN = 2;

export function ScheduleView(p: ScheduleProps) {
  const { slots } = p;
  const [pickedId, setPickedId] = useState<string | null>(p.preselect);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const picked = slots.find((s) => s.id === pickedId) ?? null;
  const { book, busy, problem } = useBook({ mode: 'schedule', stress: p.stress });
  const byDay = useMemo(() => new Map(groupByDay(slots).map((g) => [g.day, g.slots])), [slots]);

  // calendar range: the Monday on or before the first interview day to the Sunday of the last week with an open time
  const first = p.interviewStart ?? slots[0]?.startsAt.slice(0, 10) ?? p.today;
  const lastDay = [p.interviewEnd, ...(slots.length ? [easternDate(slots[slots.length - 1].startsAt)] : [])].filter((x): x is string => Boolean(x)).sort().pop() ?? first;
  const start = mondayOf(first);
  const weeks: string[] = [];
  for (let m = start; m <= lastDay; m = addDays(m, 7)) weeks.push(m);
  const countIn = (monday: string) => slots.filter((s) => { const d = easternDate(s.startsAt); return d >= monday && d < addDays(monday, 7); }).length;

  // phone: the week shown (the picked time's week, else the first week with an open time)
  const weekOf = (s: Slot | null) => (s ? mondayOf(easternDate(s.startsAt)) : null);
  const [week, setWeek] = useState<string>(weekOf(picked) ?? (p.takenAt ? mondayOf(easternDate(p.takenAt)) : null) ?? weeks.find((m) => countIn(m) > 0) ?? weeks[0]);

  const label = picked ? `Book ${dayLabel(picked.startsAt)}, ${clock(picked.startsAt)}` : 'Book a time';
  const submit = () => void book(picked);
  const pick = (s: Slot) => setPickedId(s.id);
  const note = (day: string): string | null =>
    day === p.today ? 'Today' : p.interviewStart && day < p.interviewStart ? 'Applications closed' : p.interviewEnd && day > p.interviewEnd ? 'No interviews' : null;

  const bookBtn = (cls: string) => (
    <Button size="xl" className={cls} onClick={submit} disabled={busy}>
      {label}
    </Button>
  );

  return (
    <JourneyPage
      accountName={p.accountName}
      primary={
        <Button onClick={submit} disabled={busy}>
          {label}
        </Button>
      }
    >
      <div className={b.sc}>
        <h1 className={`st ${b.title}`}>Schedule your interview.</h1>
        {p.takenLabel ? (
          <p className={b.taken} role="status">
            {p.takenLabel} was just taken. Pick another time.
          </p>
        ) : (
          <p className={b.mk}>
            <span>
              <Icon name="clock" />
              30 minutes
            </span>
            <span>
              <Icon name="video" />
              Video call
            </span>
            <span>Times are Eastern</span>
          </p>
        )}
        {problem === 'pick' ? <ErrorBox>Pick a time first.</ErrorBox> : null}
        {problem === 'failed' ? <ErrorBox>We couldn&apos;t book that time. Check your connection and try again.</ErrorBox> : null}

        {/* laptop: the calendar */}
        <div className={`${b.grid} ${p.takenLabel ? b.gridTaken : ''}`} role="group" aria-label="Open interview times">
          <div className={b.heads} aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <div className={b.head} key={d}>
                {d}
              </div>
            ))}
          </div>
          {weeks.map((m) => (
            <div className={b.row} key={m}>
              {WEEKDAYS.map((_, i) => {
                const day = addDays(m, i);
                const list = byDay.get(day) ?? [];
                const expanded = open.has(day);
                const many = list.length > MAX_SHOWN;
                const lead = list.find((s) => s.id === pickedId) ?? list[0];
                const shown = expanded || !many ? list : [lead];
                const n = note(day);
                return (
                  <div className={`${b.cell} ${expanded ? b.cellOpen : ''}`} key={day}>
                    <span className="cdt">{shortDay(day)}</span>
                    {n && !list.length ? <p className={b.cn}>{n}</p> : null}
                    {shown.map((s) => (
                      <Chip key={s.id} slot={s} on={s.id === pickedId} onPick={pick} className={b.cellChip} />
                    ))}
                    {!expanded && many ? (
                      <button type="button" className={`lk ${b.more}`} onClick={() => setOpen(new Set(open).add(day))}>
                        +{list.length - 1} more
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className={b.actions}>
          {bookBtn(b.xl)}
          <Link href={p.noTimeHref} className="btn s xl">
            None of these times work
          </Link>
        </div>

        {/* phone: a week picker and the days of that week */}
        <div className={b.phoneList}>
          <div className={b.weeks} role="group" aria-label="Week">
            {weeks.map((m) => (
              <button type="button" key={m} aria-pressed={m === week} className={m === week ? b.weekOn : ''} onClick={() => setWeek(m)}>
                {shortDay(m)}
                <span>{countIn(m)} open</span>
              </button>
            ))}
          </div>
          {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((day) => {
            const list = byDay.get(day) ?? [];
            if (!list.length) return null;
            return (
              <div className={b.day} key={day}>
                <p className="lb">{dayLabel(list[0].startsAt)}</p>
                <div className={b.chips}>
                  {list.map((s) => (
                    <Chip key={s.id} slot={s} on={s.id === pickedId} onPick={pick} className={b.dayChip} />
                  ))}
                </div>
              </div>
            );
          })}
          <Link href={p.noTimeHref} className={`lk ${b.noLink}`}>
            None of these times work?
          </Link>
        </div>
      </div>
    </JourneyPage>
  );
}
