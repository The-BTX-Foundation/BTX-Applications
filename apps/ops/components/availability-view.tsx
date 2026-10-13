'use client';

// Interviews > Your availability (Figma page "Options: interview flow", frames (a) to (e), laptop and phone). The board
// member types when they are free and the reader turns it into times; they fix the times on the grid (laptop) or in the
// list of times per day (phone), add the students they know (private), set a limit and send. Everything works without
// the reader: the quick picks and the grid fill the same times by hand.
import { useEffect, useMemo, useRef, useState } from 'react';
import { OIcon } from './icons';
import { PageHeader } from './page-header';
import { readTypedAvailability, saveAvailability } from '@/lib/actions/availability';
import { GRID_ROWS, addTime, clockShort, dayOfMonth, dayText, isFree, isWeekend, parseLimit, quickPickRanges, rangeText, rangesOn, removeTime, setCell, totalsPlain, totalsText, weekdayShort, type QuickPick } from '@/lib/availability-grid';
import { dayLabel, timeLabel } from '@/lib/format';
import { mergeRanges, toMinuteRange, toRange, type MinuteRange } from '@/lib/free-ranges';
import type { AvailabilityPageData } from '@/lib/availability';
import './availability-view.css';

const toMinuteList = (list: { day: string; start: string; end: string }[]): MinuteRange[] => mergeRanges(list.map(toMinuteRange).filter((r): r is MinuteRange => r !== null));

type Notice = { kind: 'ok'; unread: string[] } | { kind: 'fail'; message: string } | null;
type Editing = { day: string; old: MinuteRange | null; start: number; end: number };

const START_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);
const END_OPTIONS = Array.from({ length: 48 }, (_, i) => (i + 1) * 30);

export function AvailabilityView({ data }: { data: AvailabilityPageData }) {
  const { days, initial } = data;
  const [ranges, setRanges] = useState<MinuteRange[]>(() => toMinuteList(initial.ranges));
  const [text, setText] = useState(initial.text);
  const [notice, setNotice] = useState<Notice>(null);
  const [before, setBefore] = useState<MinuteRange[] | null>(null);
  const [reading, setReading] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>(initial.conflicts);
  const [nameInput, setNameInput] = useState('');
  const [limitText, setLimitText] = useState(initial.maxInterviews === null ? '' : String(initial.maxInterviews));
  const [sentAt, setSentAt] = useState<string | null>(initial.sentAt);
  const [summary, setSummary] = useState<string[]>(data.summary);
  const [changing, setChanging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);

  const sent = sentAt !== null && !changing;
  const limit = parseLimit(limitText);
  const sentLine = `${totalsPlain(mergeRanges(ranges))}. ${limit === null || limit === undefined ? 'No limit on interviews.' : `Most interviews: ${limit}.`}`;

  // Any hand edit to the times: it is no longer "sent as is". The reader's note stays put so the grid does not jump
  // under the pointer mid-drag.
  function edit(next: MinuteRange[]) {
    setRanges(next);
    setChanging(true);
  }

  async function fillFromText() {
    setError('');
    if (text.trim() === '') {
      setNotice({ kind: 'fail', message: "Type when you're free first, or pick one of the quick times." });
      return;
    }
    setReading(true);
    const r = await readTypedAvailability(text);
    setReading(false);
    if (!r.ok) {
      setNotice({ kind: 'fail', message: r.message });
      return;
    }
    // The reader's times replace what was on the grid; Undo puts it back.
    setBefore(ranges);
    setRanges(mergeRanges(toMinuteList(r.ranges), { start: days[0], end: days[days.length - 1] }));
    setNotice({ kind: 'ok', unread: r.unread });
    setChanging(true);
  }

  function quick(pick: QuickPick) {
    setNotice(null);
    setBefore(null);
    edit(mergeRanges([...ranges, ...quickPickRanges(pick, days)]));
  }

  function undo() {
    if (before) setRanges(before);
    setBefore(null);
    setNotice(null);
  }

  function addName() {
    const n = nameInput.replace(/\s+/g, ' ').trim();
    if (n === '') return;
    if (!conflicts.some((c) => c.toLowerCase() === n.toLowerCase())) setConflicts([...conflicts, n.slice(0, 120)]);
    setNameInput('');
    setChanging(true);
  }

  async function send() {
    setError('');
    if (limit === undefined) {
      setError('Most interviews must be a whole number from 1 to 50, or leave it empty.');
      return;
    }
    setSending(true);
    const r = await saveAvailability({ ranges: mergeRanges(ranges).map(toRange), maxInterviews: limit, text, conflicts, send: true });
    setSending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setRanges(toMinuteList(r.ranges));
    setSummary(r.summary);
    setSentAt(r.sentAt);
    setChanging(false);
    setBefore(null);
    setNotice(null);
  }

  function saveEditor() {
    if (!editing) return;
    let next = editing.old ? removeTime(ranges, editing.day, editing.old.startMin, editing.old.endMin) : ranges;
    next = addTime(next, editing.day, editing.start, editing.end);
    setEditing(null);
    edit(next);
  }

  const totals = totalsText(mergeRanges(ranges));
  const sentCard = (
    <section className="o-card av-sent" aria-label="Sent">
      <div className="av-sent-h">
        <span className="av-ok" aria-hidden="true">
          <OIcon name="check" size={14} />
        </span>
        <b>Sent {sentAt ? `${dayLabel(sentAt)}, ${timeLabel(sentAt)}` : ''}</b>
        <button type="button" className="av-link" onClick={() => setChanging(true)}>
          Change
        </button>
      </div>
      <p>{sentLine}</p>
      {summary.length > 0 ? (
        <ul>
          {summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  return (
    <div className="av-page">
      <PageHeader
        title="Your availability"
        sub={
          <>
            <span className="o-lg">{[data.cycleName, `interviews ${data.windowText}`, data.dueText ? `due ${data.dueText}` : ''].filter(Boolean).join(' · ')}</span>
            <span className="o-ph">{[data.windowShort, data.dueText ? `due ${data.dueText}` : ''].filter(Boolean).join(' · ')}</span>
          </>
        }
      />
      {sent ? <div className="o-ph">{sentCard}</div> : null}
      <div className="av-body">
        <div className="av-left">
          <section className="o-card av-card">
            <div className="av-head">
              <h2>When are you free?</h2>
              {data.dueText ? <span>Due {data.dueText}</span> : null}
            </div>
            <div className="av-sec">
              <label htmlFor="av-text" className="av-lab">
                Tell us when you’re free, in your own words
              </label>
              <textarea
                id="av-text"
                className={`av-box${notice?.kind === 'fail' ? ' bad' : ''}`}
                rows={2}
                value={text}
                placeholder="Weekdays after 5 except Tuesday and Thursday next week. Saturday 10 to 2."
                aria-describedby="av-note"
                onChange={(e) => {
                  setText(e.target.value);
                  if (notice?.kind === 'ok') setNotice(null);
                }}
              />
              <div id="av-note" aria-live="polite">
                {notice?.kind === 'fail' ? (
                  <p className="av-note bad">
                    <span className="av-bang" aria-hidden="true">
                      !
                    </span>
                    {notice.message}
                  </p>
                ) : null}
                {notice?.kind === 'ok' ? (
                  <p className="av-note">
                    Filled in your times.{' '}
                    <button type="button" className="av-link" onClick={undo}>
                      Undo
                    </button>
                    {notice.unread.length > 0 ? <span className="av-unread"> I couldn’t place: {notice.unread.join('; ')}.</span> : null}
                  </p>
                ) : null}
              </div>
              <div className={`av-picks${notice?.kind === 'ok' ? ' done' : ''}`}>
                <span className="av-pl">Quick picks</span>
                <button type="button" className="av-chip" onClick={() => quick('weekday-evenings')}>
                  Weekday evenings, 5 to 9
                </button>
                <button type="button" className="av-chip" onClick={() => quick('weekends')}>
                  Weekends
                </button>
                <button type="button" className="av-chip" onClick={() => quick('every-day')}>
                  Every day
                </button>
                <button type="button" className="o-btn s xl av-fill" onClick={fillFromText} disabled={reading}>
                  {reading ? 'Reading…' : 'Fill in my times'}
                </button>
              </div>
            </div>
            <div className="av-sec av-times">
              <div className="av-tot">
                <b>{totals}</b>
                <span className="o-lg">{ranges.length === 0 ? 'Drag on the grid to add a time.' : 'Tap a block to remove. Drag to add.'}</span>
              </div>
              <div className="o-lg">
                <TimeGrid days={days} ranges={ranges} onChange={edit} />
              </div>
              <div className="o-ph av-list">
                {days.map((day) => (
                  <DayRow key={day} day={day} ranges={rangesOn(ranges, day)} editing={editing?.day === day ? editing : null} setEditing={setEditing} onSave={saveEditor} onRemove={(r) => edit(removeTime(ranges, day, r.startMin, r.endMin))} />
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="av-right">
          <section className="o-card av-card">
            <div className="av-head">
              <h2>Students I know</h2>
            </div>
            <div className="av-sec av-know">
              <p>If you know someone who might apply (family, a mentee, a coworker), add their name. You’ll never be paired with them, and nobody else sees this list.</p>
              {conflicts.length === 0 ? (
                <p className="av-none">No names yet.</p>
              ) : (
                <ul className="av-names">
                  {conflicts.map((n) => (
                    <li key={n}>
                      <b>{n}</b>
                      <button
                        type="button"
                        className="av-link"
                        aria-label={`Remove ${n}`}
                        onClick={() => {
                          setConflicts(conflicts.filter((c) => c !== n));
                          setChanging(true);
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="av-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addName();
                }}
              >
                <input className="av-in" value={nameInput} maxLength={120} placeholder="Add a name" aria-label="Add a name" autoComplete="off" onChange={(e) => setNameInput(e.target.value)} />
                <button type="submit" className="o-btn s xl">
                  Add
                </button>
              </form>
            </div>
          </section>

          {sent ? (
            <div className="o-lg">{sentCard}</div>
          ) : (
            <section className="o-card av-card">
              <div className="av-sec">
                <label htmlFor="av-limit" className="av-lab">
                  Most interviews I can do (optional)
                </label>
                <input
                  id="av-limit"
                  className={`av-in av-limit${limit === undefined ? ' bad' : ''}`}
                  inputMode="numeric"
                  value={limitText}
                  placeholder="No limit"
                  aria-invalid={limit === undefined}
                  onChange={(e) => {
                    setLimitText(e.target.value);
                    setChanging(true);
                  }}
                />
                <p className="av-totline o-ph">{totals}</p>
                <button type="button" className="o-btn p xl av-send" onClick={send} disabled={sending}>
                  {sending ? 'Sending…' : 'Send availability'}
                </button>
                {error ? (
                  <p className="av-err" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- laptop: the grid ---------------------------------------------------------------------------------------------

// One column per day, one row per half hour, 8:00 AM to 10:00 PM. A click toggles a half hour; press and drag paints
// or erases depending on the first cell's state. Arrow keys move, Space or Enter toggles.
function TimeGrid({ days, ranges, onChange }: { days: string[]; ranges: MinuteRange[]; onChange: (r: MinuteRange[]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<boolean | null>(null);
  const latest = useRef(ranges);
  const [focus, setFocus] = useState({ c: 0, r: 0 });

  useEffect(() => {
    latest.current = ranges;
  }, [ranges]);

  useEffect(() => {
    const up = () => {
      drag.current = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const apply = (c: number, r: number, on: boolean) => {
    const next = setCell(latest.current, days[c], GRID_ROWS[r], on);
    latest.current = next;
    onChange(next);
  };

  // The runs inside the grid's rows, for the "5 to 9 PM" labels.
  const runs = useMemo(() => {
    const out: { c: number; r: number; n: number; text: string }[] = [];
    days.forEach((day, c) => {
      for (const m of rangesOn(ranges, day)) {
        const s = Math.max(m.startMin, GRID_ROWS[0]);
        const e = Math.min(m.endMin, GRID_ROWS[GRID_ROWS.length - 1] + 30);
        if (e > s) out.push({ c, r: (s - GRID_ROWS[0]) / 30, n: (e - s) / 30, text: rangeText(m.startMin, m.endMin) });
      }
    });
    return out;
  }, [ranges, days]);

  function onKey(e: React.KeyboardEvent, c: number, r: number) {
    const move = (nc: number, nr: number) => {
      e.preventDefault();
      const cc = Math.max(0, Math.min(days.length - 1, nc));
      const rr = Math.max(0, Math.min(GRID_ROWS.length - 1, nr));
      setFocus({ c: cc, r: rr });
      ref.current?.querySelector<HTMLElement>(`[data-c="${cc}"][data-r="${rr}"]`)?.focus();
    };
    if (e.key === 'ArrowRight') move(c + 1, r);
    else if (e.key === 'ArrowLeft') move(c - 1, r);
    else if (e.key === 'ArrowDown') move(c, r + 1);
    else if (e.key === 'ArrowUp') move(c, r - 1);
    else if (e.key === 'Home') move(0, r);
    else if (e.key === 'End') move(days.length - 1, r);
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      apply(c, r, !isFree(latest.current, days[c], GRID_ROWS[r]));
    }
  }

  return (
    <div ref={ref} className="av-grid" role="grid" aria-label={`Your free times, ${dayText(days[0])} to ${dayText(days[days.length - 1])}`} aria-multiselectable="true" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
      <div role="row" className="av-row">
        <div className="av-corner" aria-hidden="true" style={{ gridColumn: 1, gridRow: 1 }} />
        {days.map((d, c) => (
          <div key={d} role="columnheader" aria-label={dayText(d)} className="av-dh" style={{ gridColumn: c + 2, gridRow: 1 }}>
            <span>{weekdayShort(d)}</span>
            <b>{dayOfMonth(d)}</b>
          </div>
        ))}
      </div>
      {GRID_ROWS.map((min, r) => (
        <div key={min} role="row" className="av-row">
          <div role="rowheader" className="av-th" style={{ gridColumn: 1, gridRow: r + 2 }}>
            {min % 60 === 0 ? clockShort(min) : <span className="av-sr">{clockShort(min)}</span>}
          </div>
          {days.map((d, c) => {
            const free = isFree(ranges, d, min);
            return (
              <div
                key={d}
                role="gridcell"
                data-c={c}
                data-r={r}
                aria-selected={free}
                aria-label={`${dayText(d)}, ${clockShort(min)}, ${free ? 'free' : 'not free'}`}
                tabIndex={focus.c === c && focus.r === r ? 0 : -1}
                className={`av-c${free ? ' av-on' : ''}${isWeekend(d) ? ' av-wk' : ''}${min % 60 === 0 ? ' av-hr' : ''}`}
                style={{ gridColumn: c + 2, gridRow: r + 2 }}
                onFocus={() => setFocus({ c, r })}
                onKeyDown={(e) => onKey(e, c, r)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  try {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  } catch {
                    /* no capture to release */
                  }
                  drag.current = !free;
                  setFocus({ c, r });
                  (e.currentTarget as HTMLElement).focus({ preventScroll: true });
                  apply(c, r, !free);
                }}
                onPointerEnter={() => {
                  if (drag.current !== null) apply(c, r, drag.current);
                }}
              />
            );
          })}
        </div>
      ))}
      {runs
        .filter((x) => x.n >= 3)
        .map((x) => (
          <div key={`${x.c}-${x.r}`} className="av-run" aria-hidden="true" style={{ gridColumn: x.c + 2, gridRow: `${x.r + 2} / span ${x.n}` }}>
            {x.text}
          </div>
        ))}
    </div>
  );
}

// ---- phone: times per day -----------------------------------------------------------------------------------------

function DayRow({ day, ranges, editing, setEditing, onSave, onRemove }: { day: string; ranges: MinuteRange[]; editing: Editing | null; setEditing: (e: Editing | null) => void; onSave: () => void; onRemove: (r: MinuteRange) => void }) {
  const add = () => setEditing({ day, old: null, start: ranges.length ? Math.min(1260, ranges[ranges.length - 1].endMin) : 17 * 60, end: ranges.length ? Math.min(1440, ranges[ranges.length - 1].endMin + 120) : 21 * 60 });
  const bad = editing ? editing.end <= editing.start : false;
  return (
    <div className="av-day">
      <b>{dayText(day)}</b>
      <div className="av-dr">
        {ranges.length === 0 ? <span className="av-nf">Not free</span> : null}
        {ranges.map((r) => (
          <span className="av-pill" key={`${r.startMin}-${r.endMin}`}>
            <button type="button" aria-label={`Change ${dayText(day)} ${rangeText(r.startMin, r.endMin)}`} onClick={() => setEditing({ day, old: r, start: r.startMin, end: r.endMin })}>
              {rangeText(r.startMin, r.endMin)}
            </button>
            <button type="button" className="x" aria-label={`Remove ${dayText(day)} ${rangeText(r.startMin, r.endMin)}`} onClick={() => onRemove(r)}>
              ×
            </button>
          </span>
        ))}
        <button type="button" className="av-link add" onClick={add}>
          + Add a time
        </button>
      </div>
      {editing ? (
        <div className="av-ed">
          <label>
            From
            <select value={editing.start} onChange={(e) => setEditing({ ...editing, start: Number(e.target.value) })}>
              {START_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {clockShort(m)}
                </option>
              ))}
            </select>
          </label>
          <label>
            To
            <select value={editing.end} onChange={(e) => setEditing({ ...editing, end: Number(e.target.value) })}>
              {END_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {clockShort(m)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="o-btn p" onClick={onSave} disabled={bad}>
            Done
          </button>
          <button type="button" className="o-btn s" onClick={() => setEditing(null)}>
            Cancel
          </button>
          {bad ? <p className="av-err">The end has to be after the start.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
