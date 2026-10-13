'use client';

// None of these times work (Figma "Options: interview flow", (a) typing and (b) read back as times; laptop and phone).
// She types when she is free. The server action reads it into time ranges per day; she fixes them and presses Send.
// When the reader is not set up, cannot read the text, fails, or her daily limit is used, she gets the same editor
// without the reading ("Add the days and times you're free."), which is complete on its own.
// If an open time fits her ranges it is offered as a button and the gold button books it. Live, Send saves her ranges
// and what she typed in interview_free_times (saveFreeRanges, one row per application).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Icon } from '@btx/ui';
import { getAuthMode, getBrowserClient, saveFreeRanges } from '@btx/data';
import {
  clock,
  dayLabel,
  dayName,
  daysFrom,
  encodeRanges,
  hhmmMinutes,
  mergeFreeRanges,
  slotsFitRanges,
  spanLabel,
  TIME_CHOICES,
  type FreeRange,
  type Slot,
} from '@/lib/journey';
import { ErrorBox, useBook } from './booking-parts';
import { JourneyPage } from './journey-page';
import { readStudentFreeTimes } from '@/app/status/no-time/actions';
import b from './booking.module.css';
import n from './no-time.module.css';

export type NoTimeProps = {
  accountName: string;
  slots: Slot[];
  scheduleHref: string;
  /** What she already sent (ranges and the words she typed), or empty. */
  initialRanges: FreeRange[];
  initialSaid: string;
  /** The days she can add times on ("YYYY-MM-DD", first to last). */
  windowStart: string;
  windowEnd: string;
  stress: boolean;
  /** Live only: the application the answer is saved on. */
  applicationId: string | null;
};

const SHOW = 6;
const MAX_TEXT = 1000;

/** What the editor row is doing: changing a time, adding one to a day, or adding a new day. */
type Editor = { kind: 'edit'; original: FreeRange; start: string; end: string } | { kind: 'add'; day: string; start: string; end: string } | { kind: 'day'; day: string; start: string; end: string };

export function NoTimeView(p: NoTimeProps) {
  const router = useRouter();
  const days = daysFrom(p.windowStart, p.windowEnd);
  const [stage, setStage] = useState<'type' | 'edit'>(p.initialRanges.length > 0 ? 'edit' : 'type');
  const [said, setSaid] = useState(p.initialSaid);
  const [readFor, setReadFor] = useState<string | null>(p.initialRanges.length > 0 ? p.initialSaid : null);
  const [ranges, setRanges] = useState<FreeRange[]>(p.initialRanges);
  // why she is editing by hand: null = the reader read it (or this is her saved answer)
  const [intro, setIntro] = useState<'read' | 'saved' | 'hand' | 'limit'>(p.initialRanges.length > 0 ? 'saved' : 'read');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorProblem, setEditorProblem] = useState(false);
  const [reading, setReading] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<'type' | 'pick' | 'failed' | null>(null);
  const { book, busy, problem: bookProblem } = useBook({ mode: 'schedule', stress: p.stress });

  const fit = slotsFitRanges(p.slots, ranges);
  const picked = fit.find((s) => s.id === pickedId) ?? null;
  const label = picked ? `Book ${dayLabel(picked.startsAt)}, ${clock(picked.startsAt)}` : 'Send';
  const rowsDays = [...new Set(ranges.map((r) => r.day))].sort();

  async function show() {
    if (said.trim() === '') return setProblem('type');
    setProblem(null);
    setReading(true);
    let r: Awaited<ReturnType<typeof readStudentFreeTimes>>;
    try {
      r = await readStudentFreeTimes(said);
    } catch {
      r = { ok: false, reason: 'unread' };
    }
    setReading(false);
    setReadFor(said);
    setEditor(null);
    setPickedId(null);
    if (r.ok) {
      setRanges(r.ranges);
      setIntro('read');
    } else {
      setRanges([]);
      setIntro(r.reason === 'limit' ? 'limit' : 'hand');
      // nothing to fix: open the first day so she can start adding right away
      setEditor({ kind: 'day', day: days[0], start: '18:00', end: '21:00' });
    }
    setStage('edit');
  }

  async function send() {
    if (picked) return void book(picked);
    if (stage === 'type') return void show();
    if (ranges.length === 0) return setProblem('pick');
    setProblem(null);
    if (getAuthMode() === 'mock') {
      router.push(`/status?demo=sent${p.stress ? '-stress' : ''}&r=${encodeURIComponent(encodeRanges(ranges))}`);
      return;
    }
    if (!p.applicationId) return setProblem('failed');
    setSaving(true);
    const r = await saveFreeRanges(getBrowserClient(), p.applicationId, { ranges, said });
    setSaving(false);
    if (!r.ok) return setProblem('failed');
    router.push('/status');
    router.refresh();
  }

  function commit() {
    if (!editor) return;
    if (hhmmMinutes(editor.end) <= hhmmMinutes(editor.start)) return setEditorProblem(true);
    const next: FreeRange = { day: editor.kind === 'edit' ? editor.original.day : editor.day, start: editor.start, end: editor.end };
    const rest = editor.kind === 'edit' ? ranges.filter((r) => r !== editor.original) : ranges;
    setRanges(mergeFreeRanges([...rest, next]));
    setEditor(null);
    setEditorProblem(false);
    setPickedId(null);
  }
  const open = (e: Editor | null) => {
    setEditor(e);
    setEditorProblem(false);
  };
  const remove = (r: FreeRange) => {
    setRanges(ranges.filter((x) => x !== r));
    setPickedId(null);
    if (editor?.kind === 'edit' && editor.original === r) open(null);
  };

  const sel = (id: string, text: string, value: string, set: (v: string) => void, options: { value: string; label: string }[]) => (
    <label className={n.sl} htmlFor={id}>
      <span className={n.slL}>{text}</span>
      <select id={id} className={n.sel} value={value} onChange={(e) => set(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  const editorRow = (e: Editor) => (
    <div className={n.ed} role="group" aria-label={e.kind === 'day' ? 'Add a day' : e.kind === 'add' ? `Add a time on ${dayName(e.day)}` : `Change the time on ${dayName(e.original.day)}`}>
      {e.kind === 'day'
        ? sel('nt-day', 'Day', e.day, (v) => open({ ...e, day: v }), days.map((d) => ({ value: d, label: dayName(d) })))
        : null}
      {sel('nt-from', 'From', e.start, (v) => setEditor({ ...e, start: v }), TIME_CHOICES.slice(0, -1))}
      {sel('nt-to', 'To', e.end, (v) => setEditor({ ...e, end: v }), TIME_CHOICES.slice(1))}
      <div className={n.edB}>
        <button type="button" className={`btn s ${n.edBtn}`} onClick={commit}>
          Save
        </button>
        <button type="button" className={`lk ${n.edCancel}`} onClick={() => open(null)}>
          Cancel
        </button>
      </div>
      {editorProblem ? <ErrorBox>The end has to be after the start.</ErrorBox> : null}
    </div>
  );

  const shown = all ? fit : fit.slice(0, SHOW);
  const changed = readFor !== null && said !== readFor;
  return (
    <JourneyPage
      accountName={p.accountName}
      back={
        <Link href={p.scheduleHref} className="btn s">
          <Icon name="left" />
          Back
        </Link>
      }
      primary={
        <Button onClick={() => void send()} disabled={busy || saving || reading}>
          {label}
        </Button>
      }
    >
      <div className={b.nc}>
        <Link href={p.scheduleHref} className={`lk ${b.bk}`}>
          <Icon name="left" small />
          <span>Back to the open times</span>
        </Link>
        <h1 className={`st ${b.title}`}>Tell us when you&apos;re free.</h1>
        <p className={b.lead}>None of the open times fit? Say when you&apos;re free in your own words.</p>
        {problem === 'type' ? <ErrorBox>Say when you&apos;re free first.</ErrorBox> : null}
        {problem === 'pick' ? <ErrorBox>Add at least one day and time.</ErrorBox> : null}
        {problem === 'failed' ? <ErrorBox>We couldn&apos;t send your times. Check your connection and try again.</ErrorBox> : null}
        {bookProblem === 'failed' ? <ErrorBox>We couldn&apos;t book that time. Check your connection and try again.</ErrorBox> : null}
        <div className={n.pw}>
          <label className={n.lb} htmlFor="nt-said">
            When are you free?
          </label>
          <textarea
            id="nt-said"
            className={`${b.ta} ${n.box} ${stage === 'edit' ? n.boxS : ''}`}
            value={said}
            maxLength={MAX_TEXT}
            aria-describedby={stage === 'type' ? 'nt-eg' : undefined}
            onChange={(e) => setSaid(e.target.value)}
          />
          {stage === 'type' ? (
            <>
              <p className={n.eg} id="nt-eg">
                For example: &lsquo;Weekdays after 5. Saturday 10 to 2.&rsquo;
              </p>
              <button type="button" className={`btn s ${n.show}`} onClick={() => void show()} disabled={reading}>
                {reading ? 'Reading…' : 'Show my times'}
              </button>
            </>
          ) : changed ? (
            <button type="button" className={`lk ${n.again}`} onClick={() => void show()} disabled={reading}>
              {reading ? 'Reading…' : 'Read it again'}
            </button>
          ) : null}
        </div>
        {stage === 'edit' ? (
          <div className={n.pw} role="group" aria-labelledby="nt-hd">
            <p className={n.hd} id="nt-hd">
              {intro === 'read'
                ? 'Here’s what we read. Fix anything that’s off.'
                : intro === 'saved'
                  ? 'Here’s what you sent. Fix anything that’s off.'
                  : intro === 'limit'
                    ? 'You’ve used the reader a lot today. Fill in the times by hand.'
                    : 'Add the days and times you’re free.'}
            </p>
            {rowsDays.length > 0 ? (
              <ul className={n.list}>
                {rowsDays.map((day) => (
                  <li key={day} className={n.row}>
                    <span className={n.dn}>{dayName(day)}</span>
                    <div className={n.rs}>
                      {ranges
                        .filter((r) => r.day === day)
                        .map((r) => (
                          <span key={`${r.start}-${r.end}`} className={n.rg}>
                            <button
                              type="button"
                              className={n.rgT}
                              aria-label={`Change ${spanLabel(r)} on ${dayName(day)}`}
                              onClick={() => open({ kind: 'edit', original: r, start: r.start, end: r.end === '24:00' ? '22:00' : r.end })}
                            >
                              {spanLabel(r)}
                            </button>
                            <button type="button" className={n.rgX} aria-label={`Remove ${spanLabel(r)} on ${dayName(day)}`} onClick={() => remove(r)}>
                              ×
                            </button>
                          </span>
                        ))}
                      <button type="button" className={`lk ${n.add}`} onClick={() => open({ kind: 'add', day, start: '18:00', end: '21:00' })}>
                        + Add a time
                      </button>
                    </div>
                    {editor && editor.kind !== 'day' && (editor.kind === 'add' ? editor.day : editor.original.day) === day ? editorRow(editor) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {editor?.kind === 'day' ? <div className={n.dayEd}>{editorRow(editor)}</div> : null}
            {editor?.kind !== 'day' ? (
              <button
                type="button"
                className={`lk ${n.add} ${n.addDay}`}
                onClick={() => open({ kind: 'day', day: days.find((d) => !rowsDays.includes(d)) ?? days[0], start: '18:00', end: '21:00' })}
              >
                + Add a day
              </button>
            ) : null}
            {ranges.length > 0 ? (
              <div className={n.fit} role="status">
                {fit.length === 0 ? (
                  <>
                    <p className={b.fitN}>No open times fit.</p>
                    <p className={b.fitS}>Send these and we&apos;ll email you a time.</p>
                  </>
                ) : (
                  <>
                    <p className={b.fitN}>
                      {fit.length} open {fit.length === 1 ? 'time fits' : 'times fit'} what you added.
                    </p>
                    <div className={b.fitR}>
                      {shown.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`${b.chip} ${s.id === pickedId ? b.on : ''} ${n.slot}`}
                          aria-pressed={s.id === pickedId}
                          aria-label={`${dayLabel(s.startsAt)}, ${clock(s.startsAt)}`}
                          onClick={() => setPickedId(s.id === pickedId ? null : s.id)}
                        >
                          {s.id === pickedId ? <Icon name="check" /> : null}
                          {dayLabel(s.startsAt)}, {clock(s.startsAt)}
                        </button>
                      ))}
                      {!all && fit.length > SHOW ? (
                        <button type="button" className={`lk ${b.more}`} onClick={() => setAll(true)}>
                          +{fit.length - SHOW} more
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={b.nAct}>
          <Button size="xl" onClick={() => void send()} disabled={busy || saving || reading}>
            {label}
          </Button>
        </div>
      </div>
    </JourneyPage>
  );
}
