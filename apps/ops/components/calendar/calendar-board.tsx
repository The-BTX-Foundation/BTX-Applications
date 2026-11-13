'use client';

// The refreshed Calendar page (Ops Hub refresh, 2026-11-11). This one client component owns the page's state: the month and
// chosen day, the phone week, the Month / Agenda switch, the Person and Area filters, the "Needs you" share, the nudge,
// add in place with its Undo, the live-region announcements and the "Couldn't save" line. Rows and the add field are small
// presentational parts beside it (./calendar-row, ./calendar-add). Reference for look and behaviour:
// apps/design/ops-refresh/directions/p-calendar/index.html (its script).
//
// Mock mode (`live` false) changes this page's state only, like the demo. Live mode writes through ./calendar-writes and
// puts things back when the database says no; after a live write the server data is refreshed. Controls whose
// `view.caps` flag is false are not drawn (no dead controls).
//
// The month view and the agenda are both in the page; CSS picks one (the agenda always on phones, the month view on laptops
// unless Agenda is picked), so server and browser draw the same thing at every width.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { PageHeader } from '@/components/refresh/page-header';
import { isPhone, prefersReducedMotion } from '@/components/refresh/fold';
import { addDays, clock, daysFrom, shortDate } from '@/lib/refresh-time';
import {
  CAL_AREAS,
  addMonthsTo,
  agendaDays,
  agendaLabel,
  areaName,
  cellLabel,
  chipText,
  clockMin,
  dayHeading,
  dayWord,
  dnum,
  hhmm,
  isMine,
  isPast,
  monthDay,
  monthGrid,
  monthOf,
  nextArea,
  nextUp,
  onDay,
  parseEvent,
  visibleItems,
  wd,
  weekDay,
  weekOf,
  weekTitle,
} from '@/lib/calendar-time';
import type { CalArea, CalendarView, CalViewItem } from '@/lib/calendar-view';
import { AddEvent, type AddUi } from './calendar-add';
import { CalRow, type RowCtx } from './calendar-row';
import { CalPanelSkeleton } from './calendar-skeleton';
import { deleteEvent, insertEvent } from './calendar-writes';
import { createIdQueue, pickAddId, showSaveError, undoWorked, type AddRetry, type AddSig } from '@/lib/calendar-add-flow';
import '@/components/refresh/refresh.css';
import './calendar.css';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NO_DISMISS = { day: false, time: false };

type Props = { view: CalendarView; live: boolean };

// "November 2026" for the month title.
function monthTitle(month: string): string {
  return `${MONTHS_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

// "9:14 AM": the time an action happened (called from handlers only). Mock mode counts on from the sample's "now" by the
// minutes since the page loaded; live mode reads the clock in Eastern time.
function stampNow(live: boolean, nowMin: number, loadedAt: number): string {
  if (live) return clock(new Date().toISOString());
  return clockMin(Math.min(1439, nowMin + Math.floor((Date.now() - loadedAt) / 60000)));
}

// The page.
export function CalendarBoard({ view, live }: Props) {
  const router = useRouter();
  const { today, nowMin, me, caps } = view;
  const names = useMemo(() => new Map(view.people.map((p) => [p.id, p.name])), [view.people]);

  /* ---------- state ---------- */
  const [month, setMonth] = useState(monthOf(today));
  const [sel, setSel] = useState(today);
  const [wk, setWk] = useState(weekOf(today));
  const [mode, setMode] = useState<'month' | 'agenda'>('month');
  const [who, setWho] = useState('');
  const [area, setArea] = useState('');
  // Things added on this page (shown until the server lists them) and things taken off (an Undo of an add).
  const [added, setAdded] = useState<CalViewItem[]>([]);
  // When the server list changes, the things it now lists leave `added` (adjusted while drawing, React's pattern).
  const [serverItems, setServerItems] = useState(view.items);
  if (serverItems !== view.items) {
    setServerItems(view.items);
    const ids = new Set(view.items.map((i) => i.id));
    setAdded((a) => (a.some((x) => ids.has(x.id)) ? a.filter((x) => !ids.has(x.id)) : a));
  }
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [dismissed, setDismissed] = useState(NO_DISMISS);
  const [areaPick, setAreaPick] = useState<CalArea | null>(null);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<{ id: string; day: string; time: number | null; at: string } | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [nudgeText, setNudgeText] = useState('');
  const [nudged, setNudged] = useState<{ id: string; at: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [retrying, startRetry] = useTransition();
  const [, startRefresh] = useTransition();

  const rootRef = useRef<HTMLDivElement>(null);
  const loadedAt = useRef(0);
  const focusK = useRef<string | null>(null);
  const scrollReq = useRef<{ id: string; block: ScrollLogicalPosition } | null>(null);
  const textRef = useRef('');
  const addingRef = useRef(false);
  // Live writes: one queue per event id (insert, then any delete, in order), each add's insert result, the adds already
  // undone, and the last failed add (a retry of the same words reuses its id). Rules in lib/calendar-add-flow.ts.
  const queue = useRef(createIdQueue());
  const inserts = useRef(new Map<string, Promise<boolean>>());
  const undone = useRef(new Set<string>());
  const retry = useRef<AddRetry | null>(null);
  const flashT = useRef<number | undefined>(undefined);
  // The blur handler's timer reads the field as it is then, not as it was when the timer started.
  useEffect(() => {
    textRef.current = text;
    addingRef.current = adding;
  }, [text, adding]);

  useEffect(() => {
    loadedAt.current = Date.now();
    const t = flashT;
    return () => window.clearTimeout(t.current);
  }, []);

  /* ---------- small helpers ---------- */

  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);
  // "9:14 AM": the time an action happened. Mock mode counts from the sample's "now"; live mode reads the clock.
  const stamp = () => stampNow(live, nowMin, loadedAt.current);
  // Marks one thing to flash gold once (and scroll into view), then lets the mark go.
  const flashOn = (id: string, block: ScrollLogicalPosition = 'nearest') => {
    setFlash(id);
    scrollReq.current = { id, block };
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setFlash(null), 1700);
  };
  // The element for a focus key that is on screen (the month view and the agenda both carry the add field).
  const visibleK = (k: string) => [...(rootRef.current?.querySelectorAll<HTMLElement>(`[data-k="${k}"]`) ?? [])].find((el) => el.offsetParent !== null) ?? null;
  // Shows "Couldn't save. Try again." after a refused live write.
  const failed = useCallback(() => {
    setSaveFailed(true);
    say("Couldn't save. Try again.");
  }, [say]);
  // Fetches fresh server data after a live write (the new event comes back from the database).
  const refresh = () => startRefresh(() => router.refresh());

  // After React has drawn: focus what the last action asked for, then scroll a flashed row into view.
  useEffect(() => {
    const k = focusK.current;
    if (k) {
      const el = visibleK(k);
      if (el) {
        focusK.current = null;
        el.focus({ preventScroll: true });
        if (el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
      }
    }
    const s = scrollReq.current;
    if (s) {
      scrollReq.current = null;
      const row = [...(rootRef.current?.querySelectorAll<HTMLElement>(`.cal-ag[data-id="${CSS.escape(s.id)}"]`) ?? [])].find((el) => el.offsetParent !== null);
      row?.scrollIntoView({ block: s.block, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  });

  /* ---------- what is on screen ---------- */

  // The server's things, minus the ones taken off, plus the ones added here that the server does not list yet.
  const all = useMemo(() => {
    const server = view.items.filter((i) => !removed.has(i.id));
    const ids = new Set(server.map((i) => i.id));
    return [...server, ...added.filter((i) => !ids.has(i.id) && !removed.has(i.id))];
  }, [view.items, added, removed]);
  const list = useMemo(() => visibleItems(all, who, area), [all, who, area]);
  const parsed = useMemo(() => parseEvent(text, today, dismissed, areaPick), [text, today, dismissed, areaPick]);
  const showNeeds = !!view.needs && caps.share && !view.itemsFailed;
  // The news card under the title: the next timed thing. Until the late schedule is shared, the gold block is the action.
  const next = !view.itemsFailed && (!showNeeds || shared) ? nextUp(list, today, nowMin) : null;

  /* ---------- moving around ---------- */

  // Picks a day (a grid cell, a chip, a week-strip day): the month and the week follow it.
  const pickDay = (d: string) => {
    setSel(d);
    if (monthOf(d) !== month) setMonth(monthOf(d));
    setWk(weekOf(d));
    setNudgeOpen(false);
    // Phone: the day's things are in the agenda under the strip.
    if (isPhone()) window.setTimeout(() => rootRef.current?.querySelector('.cal-agenda')?.scrollIntoView({ block: 'nearest' }), 0);
  };
  // Previous / next month; in the Agenda view the list starts on that month's first day.
  const stepMonth = (n: number) => {
    const m = addMonthsTo(month, n);
    setMonth(m);
    if (mode === 'agenda') setSel(m);
    say(monthTitle(m));
  };
  // Previous / next week on the phone strip; its first day becomes the chosen day.
  const stepWeek = (n: number) => {
    const w = addDays(wk, n * 7);
    setWk(w);
    setSel(w);
  };
  const goToday = () => {
    setMonth(monthOf(today));
    setSel(today);
    setWk(weekOf(today));
  };
  // The agenda's "Show the next 3 weeks": the list starts 21 days on.
  const later = () => {
    const d = addDays(sel, 21);
    setSel(d);
    setWk(weekOf(d));
    setMonth(monthOf(d));
    window.setTimeout(() => {
      const ag = [...(rootRef.current?.querySelectorAll<HTMLElement>('.cal-agenda') ?? [])].find((el) => el.offsetParent !== null);
      ag?.scrollIntoView({ block: 'start' });
    }, 0);
  };
  // The news card: opens the thing's day and flashes its row.
  const openNext = (it: CalViewItem) => {
    setSel(it.date);
    setMonth(monthOf(it.date));
    setWk(weekOf(it.date));
    setNudgeOpen(false);
    flashOn(it.id, 'center');
    say(`Opened ${it.title}`);
  };

  /* ---------- Needs you: share the schedule (mock only: caps.share) ---------- */

  const share = () => {
    if (!caps.share) return;
    setSharing(true);
    window.setTimeout(() => {
      setSharing(false);
      setShared(stamp());
      focusK.current = 'unshare';
      say('Interview schedule sent to the board. Undo available.');
    }, 500);
  };
  const unshare = () => {
    setShared(null);
    focusK.current = 'share';
    say('Undone. The schedule was not sent.');
  };

  /* ---------- Nudge (mock only: caps.nudge) ---------- */

  const waitingItem = all.find((i) => i.waiting);
  const rowCtx = (sfx: string): RowCtx => ({
    today,
    nowMin,
    me,
    names,
    flash,
    canNudge: caps.nudge,
    nudgeOpen,
    nudgeText: nudgeText || waitingItem?.waiting?.draft || '',
    nudged,
    sfx,
    onNudge: () => {
      const opening = !nudgeOpen;
      setNudgeOpen(opening);
      if (opening) window.setTimeout(() => visibleK('nudge-text')?.focus({ preventScroll: true }), 60);
    },
    onNudgeText: setNudgeText,
    onNudgeSend: () => {
      if (!waitingItem?.waiting) return;
      setNudged({ id: waitingItem.id, at: stamp() });
      setNudgeOpen(false);
      focusK.current = 'unnudge';
      say(`Nudge sent to ${(names.get(waitingItem.waiting.personId) ?? '').split(' ')[0]} in board chat. Undo available.`);
    },
    onNudgeCancel: () => {
      setNudgeOpen(false);
      focusK.current = 'nudge';
    },
    onUnnudge: () => {
      setNudged(null);
      focusK.current = 'nudge';
      say('Nudge undone.');
    },
  });

  /* ---------- Add an event in place ---------- */

  const openAdd = useCallback(() => {
    setAdding(true);
    focusK.current = 'addin';
  }, []);
  const closeAdd = () => {
    setAdding(false);
    setText('');
    setDismissed(NO_DISMISS);
    setAreaPick(null);
    setAddErr(null);
  };
  const onText = (t: string) => {
    setText(t);
    if (!t.trim()) {
      setDismissed(NO_DISMISS);
      setAreaPick(null);
    }
    setAddErr(null);
  };
  const onChip = (kind: 'day' | 'time' | 'area', found: boolean) => {
    if (kind === 'area') setAreaPick(nextArea(parsed.area ?? 'scholarships'));
    else if (found) setDismissed((d) => ({ ...d, [kind]: true }));
    focusK.current = 'addin';
  };
  // Leaving an empty field closes it (after the tap that moved focus has landed).
  const onBlur = () => {
    window.setTimeout(() => {
      const form = document.activeElement?.closest('.cal-add-form');
      if (addingRef.current && !form && !textRef.current.trim()) closeAdd();
    }, 150);
  };
  const submit = () => {
    const p = parsed;
    const err = !p.title ? 'Give the event a title.' : p.title.length > 200 ? 'Keep the title to 200 characters or fewer.' : null;
    if (err) {
      setAddErr(err);
      say(err);
      return;
    }
    const day = p.day ?? sel;
    const area = p.area ?? 'scholarships';
    // The event's id is made here; a retry of the same failed add (same words) reuses that add's id.
    const sig: AddSig = { title: p.title, day, time: p.time, area };
    const uuid = pickAddId(retry.current, sig, crypto.randomUUID());
    retry.current = null;
    const id = `ev:${uuid}`;
    const it: CalViewItem = { id, kind: 'event', area, date: day, endDate: null, time: p.time, title: p.title, code: null, chip: p.title.split(' ').slice(0, 2).join(' '), people: [me], waiting: null, done: false };
    // The whole field as typed (words and chip choices): a failed add comes back exactly as it was, so its retry matches.
    const typed = { text, dismissed, areaPick };
    undone.current.delete(id);
    setRemoved((r) => {
      if (!r.has(id)) return r;
      const n = new Set(r);
      n.delete(id);
      return n;
    });
    setAdded((a) => [...a.filter((x) => x.id !== id), it]);
    setLastAdded({ id, day, time: p.time, at: stamp() });
    setSel(day);
    setMonth(monthOf(day));
    setWk(weekOf(day));
    setText('');
    setDismissed(NO_DISMISS);
    setAreaPick(null);
    setSaveFailed(false);
    flashOn(id);
    focusK.current = 'addin';
    say(`Added ${p.title}, ${shortDate(day)}${day.slice(0, 4) !== today.slice(0, 4) ? `, ${day.slice(0, 4)}` : ''}${p.time != null ? `, ${clockMin(p.time)}` : ''}.`);
    if (!live) return;
    const write = queue.current(id, () => insertEvent({ id: uuid, title: p.title, date: day, time: p.time == null ? 'all-day' : hhmm(p.time), area, ownerId: me }));
    inserts.current.set(id, write);
    void write.then((ok) => {
      // Fresh server data either way: a row that did save (a slow answer) shows up from the database.
      refresh();
      if (ok) return;
      setAdded((a) => a.filter((x) => x.id !== id));
      setLastAdded((l) => (l?.id === id ? null : l));
      if (!showSaveError(ok, undone.current.has(id))) return;
      // Keep the words for another try (same words, same id), when the field is empty.
      retry.current = { sig, id: uuid, ...typed };
      if (!textRef.current.trim()) {
        setText(typed.text);
        setDismissed(typed.dismissed);
        setAreaPick(typed.areaPick);
        setAdding(true);
      }
      failed();
    });
  };
  // Undo of the last add: the event leaves at once and focus goes back to the add field (or its open button). Live mode
  // always deletes the row, after the insert of that id has finished (whatever it reported).
  const unadd = () => {
    const last = lastAdded;
    if (!last || !caps.undoAdd) return;
    setRemoved((r) => new Set(r).add(last.id));
    setLastAdded(null);
    focusK.current = addingRef.current ? 'addin' : 'openadd';
    say('Event removed.');
    if (!live) return;
    const id = last.id;
    undone.current.add(id);
    const insertOk = inserts.current.get(id) ?? Promise.resolve(true);
    void queue.current(id, () => deleteEvent(id.slice(3))).then(async (deleted) => {
      if (undoWorked(await insertOk, deleted)) return refresh();
      // The row is still in the database: put it back on screen.
      undone.current.delete(id);
      setRemoved((r) => {
        const n = new Set(r);
        n.delete(id);
        return n;
      });
      refresh();
      failed();
    });
  };

  // "N" opens the add field, only while focus is inside the calendar page and not in a field (and not when it did not load).
  const onPageKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!caps.add || view.itemsFailed) return;
    if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) {
      e.preventDefault();
      openAdd();
    }
  };

  const addUi: AddUi = { adding, text, parsed, sel, err: addErr, after: lastAdded, canUndo: caps.undoAdd, year: today.slice(0, 4) };
  const addBlock = (where: 'day' | 'top') =>
    caps.add ? (
      <AddEvent
        where={where}
        ui={addUi}
        onOpen={openAdd}
        onText={onText}
        onSubmit={submit}
        onEscape={() => {
          closeAdd();
          focusK.current = 'openadd';
        }}
        onBlur={onBlur}
        onChip={onChip}
        onUndo={unadd}
      />
    ) : null;

  /* ---------- the parts ---------- */

  const empty = all.length === 0;
  const emptyLine = (
    <div className="cal-empty">
      <p>Interviews, meetings and due dates show up here once they&apos;re set.</p>
    </div>
  );

  // The month grid: bars across days, up to three things a day, then "N more".
  const grid = (
    <>
      <div className="cal-wd" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      {monthGrid(month, list).map((w) => (
        <div className="cal-wk" key={w.days[0]}>
          <div className="cal-cells">
            {w.days.map((d) => (
              <button
                type="button"
                key={d}
                className={`cal-cell${monthOf(d) !== month ? ' cal-out' : ''}${d === today ? ' cal-today' : ''}${d === sel ? ' cal-sel' : ''}`}
                aria-label={cellLabel(today, d)}
                aria-pressed={d === sel}
                onClick={() => pickDay(d)}
              >
                <span className="cal-dn">{dnum(d)}</span>
              </button>
            ))}
          </div>
          <span className="cal-spacer" />
          {w.bars.map((b) => (
            <button
              type="button"
              key={`b-${b.item.id}`}
              className="cal-ev cal-span"
              style={{ gridColumn: `${b.col + 1} / span ${b.span}`, gridRow: b.lane }}
              title={`${b.item.title}, ${shortDate(b.item.date)} to ${shortDate(b.item.endDate ?? b.item.date)}`}
              aria-label={`${b.item.chip} (${shortDate(b.item.date)} to ${shortDate(b.item.endDate ?? b.item.date)})`}
              onClick={() => pickDay(w.days[b.col])}
            >
              {b.item.chip}
            </button>
          ))}
          {w.chips.map((c) => {
            const i = c.item;
            const m = isMine(i, me);
            const at = i.time != null ? `, ${clockMin(i.time)}` : '';
            return (
              <button
                type="button"
                key={`c-${i.id}`}
                className={`cal-ev${m ? ' cal-mine' : ''}${isPast(today, nowMin, i) ? ' cal-past' : ''}${flash === i.id ? ' cal-new' : ''}`}
                style={{ gridColumn: c.col + 1, gridRow: c.lane }}
                title={`${i.title}${at}${m ? ', yours' : ''}`}
                aria-label={`${chipText(i)}: ${i.title}, ${shortDate(i.date)}${at}${m ? ', yours' : ''}`}
                onClick={() => pickDay(w.days[c.col])}
              >
                {m ? <span className="cal-dot" aria-hidden="true" /> : null}
                <span>{chipText(i)}</span>
              </button>
            );
          })}
          {w.more.map((x) => (
            <button type="button" key={`m-${x.day}`} className="cal-ev cal-more" style={{ gridColumn: x.col + 1, gridRow: x.lane }} aria-label={`${x.n} more on ${shortDate(x.day)}`} onClick={() => pickDay(x.day)}>
              {x.n} more
            </button>
          ))}
        </div>
      ))}
    </>
  );

  // The chosen day (laptop, beside or under the grid).
  const dayThings = onDay(list, sel);
  const dayPanel = empty ? (
    <>
      {emptyLine}
      {addBlock('day')}
    </>
  ) : (
    <>
      <div className="cal-day-h">
        <h3>{dayHeading(today, sel)}</h3>
        <span>{dayThings.length ? `${dayThings.length} ${dayThings.length === 1 ? 'thing' : 'things'}` : ''}</span>
      </div>
      {dayThings.length ? dayThings.map((i) => <CalRow key={`${i.id}-${sel}`} item={i} day={sel} ctx={rowCtx('-d')} />) : <p className="cal-none">Nothing on this day.</p>}
      {addBlock('day')}
    </>
  );

  // The agenda: the chosen day and the 20 after it.
  const ag = agendaDays(list, sel);
  const agenda = empty ? (
    <>
      {emptyLine}
      {addBlock('top')}
    </>
  ) : (
    <>
      {addBlock('top')}
      {ag.days.map(({ day, items }) => {
        const n = daysFrom(today, day);
        return (
          <section key={day} className={`cal-dayg${n === 0 ? ' cal-is-today' : ''}${n === 1 ? ' cal-is-next' : ''}`}>
            <h3 className="cal-dayg-h">
              <span className="cal-dnum" aria-hidden="true">
                <b>{dnum(day)}</b>
                <small>{wd(day)}</small>
              </span>
              <span className="cal-dlab">
                {agendaLabel(today, day)}
                <span className="rf-sr"> </span>
                <span className="cal-dsub">{monthDay(day)}</span>
              </span>
            </h3>
            {items.map((i) => (
              <CalRow key={`${i.id}-${day}`} item={i} day={day} ctx={rowCtx('-a')} />
            ))}
          </section>
        );
      })}
      {ag.days.length ? null : (
        <p className="cal-none">
          Nothing from {shortDate(sel)} to {shortDate(ag.to)}.
        </p>
      )}
      <div className="cal-ag-end">
        <span>Through {shortDate(ag.to)}</span>
        <button type="button" className="rf-lnk" onClick={later}>
          Show the next 3 weeks
        </button>
      </div>
    </>
  );

  // The phone week strip: seven days with marks (gold for the viewer's things).
  const weekDays = Array.from({ length: 7 }, (_, k) => addDays(wk, k));

  const lateBy = view.needs ? daysFrom(view.needs.dueOn, today) : 0;

  return (
    // The page's one live region is the last element; "N" is handled here so it works only inside the page.
    <div className="rf cal" ref={rootRef} onKeyDown={onPageKey}>
      <PageHeader title="Calendar" date={view.dateLabel} search={false}>
        <div className="cal-news">
          {next ? (
            <NewsCard
              icon={next.kind === 'interview' ? 'people' : 'clock'}
              kicker={`Next · ${dayWord(today, next.date)} ${clockMin(next.time ?? 0)}`}
              title={next.kind === 'interview' ? `Interview with ${next.title}` : next.title}
              go="Open"
              gold={isMine(next, me)}
              onClick={() => openNext(next)}
            />
          ) : null}
        </div>
      </PageHeader>
      {saveFailed ? (
        <p className="rf-saveerr">
          <Icon name="alert" />
          Couldn&apos;t save. Try again.
        </p>
      ) : null}

      {showNeeds && view.needs ? (
        <section className={`cal-needs${shared ? ' cal-sent' : ''}`} aria-label="Needs you">
          {shared ? (
            <p className="cal-done-line">
              <span className="rf-tick">
                <Icon name="check" />
              </span>
              <span>
                {view.needs.doneText}, {shared} <span aria-hidden="true">·</span>{' '}
                <button type="button" className="rf-lnk" data-k="unshare" onClick={unshare}>
                  Undo
                </button>
              </span>
            </p>
          ) : (
            <>
              <h2>
                {view.needs.title} {lateBy > 0 ? <span className="rf-late">{`${lateBy} ${lateBy === 1 ? 'day' : 'days'} late`}</span> : null}
              </h2>
              <button type="button" className="rf-btn rf-btn-gold" data-k="share" disabled={sharing} onClick={share}>
                {sharing ? 'Sharing' : view.needs.action}
              </button>
            </>
          )}
        </section>
      ) : null}

      <section className="cal-panel" aria-label="Calendar">
        {view.itemsFailed ? (
          retrying ? (
            <div aria-busy="true">
              <CalPanelSkeleton />
            </div>
          ) : (
            <div className="cal-load-err">
              <p>
                <Icon name="alert" />
                Check your connection, then try again.
              </p>
              <button type="button" className="rf-btn rf-btn-gold" onClick={() => startRetry(() => router.refresh())}>
                Try again
              </button>
            </div>
          )
        ) : (
          <>
            <div className="cal-tools">
              <div className="cal-mnav">
                <button type="button" className="cal-sq" aria-label="Previous month" onClick={() => stepMonth(-1)}>
                  <Icon name="chev" className="cal-flip" />
                </button>
                <h2>{monthTitle(month)}</h2>
                <button type="button" className="cal-sq" aria-label="Next month" onClick={() => stepMonth(1)}>
                  <Icon name="chev" />
                </button>
                <button type="button" className="rf-btn" onClick={goToday}>
                  Today
                </button>
              </div>
              <div className="cal-tr">
                <label className={`cal-fchip${who ? ' cal-on' : ''}`}>
                  <span className="cal-k">Person</span>
                  <span>{who ? (names.get(who) ?? 'Everyone') : 'Everyone'}</span>
                  <Icon name="down" />
                  <select
                    aria-label="Person"
                    value={who}
                    onChange={(e) => {
                      setWho(e.target.value);
                      say(`Showing ${e.target.value ? names.get(e.target.value) : 'everyone'}`);
                    }}
                  >
                    <option value="">Everyone</option>
                    {view.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.id === me ? ' (you)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`cal-fchip${area ? ' cal-on' : ''}`}>
                  <span className="cal-k">Area</span>
                  <span>{area ? areaName(area as CalArea) : 'All'}</span>
                  <Icon name="down" />
                  <select
                    aria-label="Area"
                    value={area}
                    onChange={(e) => {
                      setArea(e.target.value);
                      say(`Showing ${e.target.value ? areaName(e.target.value as CalArea) : 'all areas'}`);
                    }}
                  >
                    <option value="">All areas</option>
                    {CAL_AREAS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="cal-seg" role="group" aria-label="View">
                  {(['month', 'agenda'] as const).map((v) => (
                    <button
                      type="button"
                      key={v}
                      aria-pressed={mode === v}
                      onClick={() => {
                        setMode(v);
                        setAdding(false);
                      }}
                    >
                      {v === 'month' ? 'Month' : 'Agenda'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="cal-week">
              <div className="cal-wnav">
                <button type="button" className="cal-iconbtn" aria-label="Previous week" onClick={() => stepWeek(-1)}>
                  <Icon name="chev" className="cal-flip" />
                </button>
                <p>{weekTitle(wk)}</p>
                <button type="button" className="cal-iconbtn" aria-label="Next week" onClick={() => stepWeek(1)}>
                  <Icon name="chev" />
                </button>
              </div>
              <div className="cal-wdays" role="group" aria-label="Pick a day">
                {weekDays.map((d) => {
                  const w = weekDay(list, d, me);
                  const word = dayWord(today, d);
                  const lab = `${wd(d)} ${dnum(d)}${word === shortDate(d) ? '' : `, ${word}`}${w.count ? `, ${w.count} thing${w.count === 1 ? '' : 's'}${w.mine ? `, ${w.mine} yours` : ''}` : ''}`;
                  return (
                    <button type="button" key={d} className={`cal-wday${d === today ? ' cal-today' : ''}${d === sel ? ' cal-sel' : ''}`} aria-label={lab} aria-pressed={d === sel} onClick={() => pickDay(d)}>
                      <span className="cal-w" aria-hidden="true">
                        {wd(d)}
                      </span>
                      <span className="cal-n" aria-hidden="true">
                        {dnum(d)}
                      </span>
                      <span className="cal-marks" aria-hidden="true">
                        {w.marks.map((m, k) => (
                          <i key={k} className={m === 'g' ? 'cal-g' : undefined} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="cal-mview" hidden={mode === 'agenda'}>
              <div className="cal-grid">{grid}</div>
              <div className="cal-day">{dayPanel}</div>
            </div>

            <div className="cal-agenda" hidden={mode !== 'agenda'}>
              {agenda}
            </div>
          </>
        )}
      </section>

      <div className="rf-sr" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
