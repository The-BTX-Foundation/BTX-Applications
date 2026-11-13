'use client';

// The page for one interview (route /scholarships/interviews/[slot], built 2026-11-13 from board feedback). Top: the student
// (with a link to their application), the day and time in Eastern time, the award and the two interviewers. Then joining
// (a gold "Join on Teams" and "Copy link"), the interviewers with "Change" for admins, the cycle's interview questions with
// the viewer's own notes box under each and everyone else's notes read only, "Overall notes", and a link to score.
//
// Notes save by themselves a moment after typing stops and when a box loses focus (lib/interview-notes-flow.ts): one save
// per box at a time, a failed save keeps the words and says "Not saved" with Retry, words not yet saved are kept in memory
// for this person (lib/interview-notes-unsent.ts) and the page warns before closing. Change interviewer is admin only: it
// lists who is free (listReplacementsAction) and makes the change (changeInterviewerAction), then the page re-reads from the
// server and keeps the Change controls locked until that read lands. Mock mode plays every write on this device only.
import { useEffect, useRef, useState, useTransition, type ButtonHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fold, Nw } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { PageHeader } from '@/components/refresh/page-header';
import { Panel } from '@/components/refresh/panel';
import { StateLine } from '@/components/refresh/state-line';
import { changeInterviewerAction, listReplacementsAction, saveInterviewNoteAction } from '@/lib/actions/interview-page';
import { NOTE_MAX } from '@/lib/interview-notes-db';
import { anyUnsaved, boxReducer, boxStatus, DEBOUNCE_MS, dirty, newBox, shouldSave, type Box, type BoxEvent } from '@/lib/interview-notes-flow';
import { claimNotes, keepWords, unsentFor } from '@/lib/interview-notes-unsent';
import { minutesOf } from '@/lib/interview-page-map';
import { OVERALL, type InterviewPageView, type IpNote, type IpPerson } from '@/lib/interview-page-view';
import { armed, goKey } from '@/lib/interviews-map';
import { clock, easternDay, fullDate, shortDate } from '@/lib/refresh-time';
import { LIMIT_MS, within } from '@/lib/scoring-flow';
import '@/components/refresh/refresh.css';
import './interview-page.css';

const QUESTIONS = '/scholarships/interviews/questions';
const NO_ANSWER = 'No answer in time. Reload to check.';
const NO_ANSWER_CHANGE = 'No answer in time. Reload to check. An email may already have gone out.';
const CHANGE_FAILED = "Couldn't change the interviewer. Try again.";
const LIST_FAILED = "Couldn't check who is free. Try again.";

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// The clock, read only in event handlers (opening the Change sheet), never while drawing.
const nowMs = () => Date.now();

type Sheet = { out: string; openedAt: number; state: 'loading' | 'ok' | 'error'; people: IpPerson[]; pick: string | null; message: string | null; saving: boolean };
type Outcome = { ok: boolean; text: string } | null;

// Copies text: the Clipboard API, then the old select-and-copy way. True when one of them worked.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// The page.
export function InterviewPageBoard({ view, live, userId }: { view: InterviewPageView; live: boolean; userId: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const { slotId } = view;

  // ---- One polite live region: one line per result ----
  const [said, setSaid] = useState({ n: 0, text: '' });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // ---- Interviewers: the server's pair (mock: this device's copy after a change) ----
  const [mockPair, setMockPair] = useState<IpPerson[]>(view.pair);
  const pair = live ? view.pair : mockPair;

  // ---- Notes: one box per question and one overall, seeded from the server and from words not yet saved ----
  claimNotes(userId);
  const keys = [...view.groups.flatMap((g) => g.questions.map((q) => q.id)), OVERALL];
  const [boxes, setBoxes] = useState<Record<string, Box>>(() => {
    const kept = view.caps.notes ? unsentFor(userId, slotId) : {};
    const init: Record<string, Box> = {};
    for (const k of keys) {
      const b = newBox(view.mine[k] ?? '');
      init[k] = kept[k] !== undefined && kept[k] !== b.saved ? { ...b, text: kept[k] } : b;
    }
    return init;
  });
  const boxesRef = useRef(boxes);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);

  // Applies one event to one box (state and the ref the save loop reads), and returns the new box.
  const apply = (key: string, e: BoxEvent): Box => {
    const next = boxReducer(boxesRef.current[key] ?? newBox(''), e);
    boxesRef.current = { ...boxesRef.current, [key]: next };
    setBoxes(boxesRef.current);
    return next;
  };

  // One note write, in each mode. False = not saved (refused, thrown, or no answer in time).
  const writeNote = async (key: string, body: string): Promise<boolean> => {
    if (!live) {
      await wait(400);
      return !view.sim?.failSave;
    }
    try {
      const r = await within(saveInterviewNoteAction({ slotId, questionId: key === OVERALL ? null : key, body }), LIMIT_MS);
      return r.done && r.value.ok;
    } catch {
      return false;
    }
  };

  // Boxes whose Retry was pressed: their next successful save is announced.
  const retried = useRef(new Set<string>());

  // Saves one box now when it needs it; the next save of the same box waits for this one.
  const flush = async (key: string) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
    const b = boxesRef.current[key];
    if (!b || !shouldSave(b)) return;
    const started = apply(key, { type: 'start' });
    const ok = await writeNote(key, started.sending ?? '');
    if (!mounted.current) return;
    const after = apply(key, { type: 'done', ok });
    keepWords(userId, slotId, key, dirty(after) ? after.text : null);
    if (!ok) {
      say('Notes not saved. Try again.');
      return;
    }
    // Words typed while this save ran go in the next one.
    if (dirty(after)) {
      schedule(key);
      return;
    }
    if (retried.current.delete(key)) say('Notes saved.');
  };

  // Saves a box a moment after typing stops.
  const schedule = (key: string) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.set(
      key,
      setTimeout(() => void flush(key), DEBOUNCE_MS),
    );
  };

  const typeIn = (key: string, text: string) => {
    const b = apply(key, { type: 'type', text });
    keepWords(userId, slotId, key, dirty(b) ? b.text : null);
    schedule(key);
  };

  // Words kept from an earlier visit save as soon as the page is up; timers stop when it goes.
  useEffect(() => {
    mounted.current = true;
    const map = timers.current;
    for (const [k, b] of Object.entries(boxesRef.current)) if (dirty(b)) void flush(k);
    return () => {
      mounted.current = false;
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
    // Runs once per page: flush reads the latest boxes through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fresh read (live): a box with nothing unsaved and no save running takes the server's words.
  useEffect(() => {
    let changed = false;
    const next = { ...boxesRef.current };
    for (const k of Object.keys(view.mine)) {
      const b = next[k];
      if (!b) continue;
      const n = boxReducer(b, { type: 'server', saved: view.mine[k] });
      if (n !== b) {
        next[k] = n;
        changed = true;
      }
    }
    if (changed) {
      boxesRef.current = next;
      setBoxes(next);
    }
  }, [view.mine]);

  // Warn before closing the tab while words are not saved.
  const unsaved = anyUnsaved(boxes);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // ---- Join: copy the link ----
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyBox = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);
  const copy = async () => {
    if (!view.link) return;
    const ok = await copyText(view.link);
    setCopied(ok ? 'ok' : 'fail');
    say(ok ? 'Link copied.' : "Couldn't copy. Select the link and copy it.");
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (ok) copyTimer.current = setTimeout(() => setCopied(null), 2500);
    else requestAnimationFrame(() => copyBox.current?.select());
  };

  // ---- Change interviewer (admins) ----
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // After a live change: locked until the re-read view lands (the gate clears when `view` changes).
  const [gate, setGate] = useState<InterviewPageView | null>(null);
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    if (gate !== null && gate !== view) setGate(null);
  }
  const locked = (sheet?.saving ?? false) || gate !== null || refreshing;
  const sheetHead = useRef<HTMLParagraphElement>(null);

  const reread = () => {
    setGate(view);
    startRefresh(() => router.refresh());
  };

  const openChange = async (p: IpPerson) => {
    if (locked) return;
    setOutcome(null);
    const opened: Sheet = { out: p.id, openedAt: nowMs(), state: 'loading', people: [], pick: null, message: null, saving: false };
    setSheet(opened);
    requestAnimationFrame(() => sheetHead.current?.focus());
    let next: Partial<Sheet>;
    if (!live) {
      await wait(300);
      next = { state: 'ok', people: view.sim?.replacements[p.id] ?? [] };
    } else {
      try {
        const r = await within(listReplacementsAction(slotId), LIMIT_MS);
        next = !r.done ? { state: 'error', message: NO_ANSWER } : r.value.ok ? { state: 'ok', people: r.value.people.map((x) => ({ ...x, me: x.id === view.me })) } : { state: 'error', message: r.value.message };
      } catch {
        next = { state: 'error', message: LIST_FAILED };
      }
    }
    setSheet((s) => (s && s.out === p.id && s.openedAt === opened.openedAt ? { ...s, ...next } : s));
  };

  const closeSheet = (focusOn?: string) => {
    const out = sheet?.out;
    setSheet(null);
    requestAnimationFrame(() => document.getElementById(focusOn ?? `ip-chg-${out}`)?.focus());
  };

  const saveChange = async () => {
    if (!sheet || !sheet.pick || sheet.saving) return;
    const out = sheet.out;
    const pick = sheet.people.find((x) => x.id === sheet.pick);
    if (!pick) return;
    setSheet({ ...sheet, saving: true, message: null });
    if (!live) {
      await wait(500);
      setMockPair((ps) => ps.map((x) => (x.id === out ? { ...pick, me: pick.id === view.me } : x)));
      setSheet(null);
      setOutcome({ ok: true, text: `Changed to ${pick.name}.` });
      say(`Changed to ${pick.name}.`);
      requestAnimationFrame(() => document.getElementById('ip-outcome')?.focus());
      return;
    }
    let result: Outcome;
    try {
      const r = await within(changeInterviewerAction({ slotId, outgoingId: out, incomingId: pick.id }), LIMIT_MS);
      result = !r.done ? { ok: false, text: NO_ANSWER_CHANGE } : r.value.ok ? { ok: true, text: `Changed to ${r.value.incomingName}.` } : { ok: false, text: r.value.message || CHANGE_FAILED };
    } catch {
      result = { ok: false, text: CHANGE_FAILED };
    }
    // Whatever the answer, the server is the baseline now: re-read and keep Change locked until it lands.
    setSheet(null);
    setOutcome(result);
    say(result.text);
    reread();
    requestAnimationFrame(() => document.getElementById('ip-outcome')?.focus());
  };

  // ---- Words ----
  const day = view.startsAt ? easternDay(view.startsAt) : null;
  const when = view.startsAt && day ? `${shortDate(day)}, ${clock(view.startsAt)}` : null;
  const mins = minutesOf(view.startsAt, view.endsAt);
  const first = view.name.split(/\s+/)[0] || view.name;
  const note = (k: string): IpNote[] => view.others[k] ?? [];

  // One notes box (the viewer's own) with its state line.
  const box = (key: string, label: string, labelId?: string) => {
    const b = boxes[key] ?? newBox('');
    const st = boxStatus(b);
    const id = `ip-nb-${key}`;
    return (
      <div className="ip-box">
        {labelId ? null : (
          <label htmlFor={id} className="ip-box-l">
            {label}
          </label>
        )}
        <textarea
          id={id}
          aria-labelledby={labelId ? `${labelId} ${id}-l` : undefined}
          aria-describedby={`${id}-s`}
          placeholder="Your notes"
          maxLength={NOTE_MAX}
          value={b.text}
          onChange={(e) => typeIn(key, e.target.value)}
          onBlur={() => void flush(key)}
        />
        {labelId ? (
          <span id={`${id}-l`} className="rf-sr">
            {label}
          </span>
        ) : null}
        <p id={`${id}-s`} className={`ip-st${b.state === 'failed' ? ' ip-bad' : ''}`}>
          {b.state === 'saved' ? <Icon name="check" /> : b.state === 'failed' ? <Icon name="alert" /> : null}
          <span>{st}</span>
          {b.state === 'failed' ? (
            <button
              type="button"
              className="rf-lnk"
              onClick={() => {
                retried.current.add(key);
                void flush(key);
              }}
            >
              Retry
            </button>
          ) : null}
        </p>
      </div>
    );
  };

  // Other people's notes on one box, read only.
  const theirs = (key: string) =>
    note(key).length ? (
      <ul className="ip-theirs">
        {note(key).map((n) => (
          <li key={n.authorId}>
            <span className="ip-by">
              <Nw text={n.name} names={[n.name]} />
            </span>
            <p>{n.body}</p>
          </li>
        ))}
      </ul>
    ) : null;

  const canNotes = view.caps.notes;
  const outcomeLine = outcome ? (
    <p id="ip-outcome" tabIndex={-1} className={`ip-outcome${outcome.ok ? '' : ' ip-bad'}`}>
      <Icon name={outcome.ok ? 'check' : 'alert'} />
      <span>{outcome.text}</span>
    </p>
  ) : null;

  return (
    <div className="rf ip">
      <p className="ip-back">
        <Link className="rf-lnk" href="/scholarships/interviews">
          <Icon name="back" />
          Interviews
        </Link>
      </p>
      <PageHeader title={view.name} search={false}>
        <div className="ip-meta">
          <p className="ip-when">
            {when ? (
              <span title={day ? fullDate(day) : undefined}>
                <Nw text={when} />
                <span className="ip-tz"> Eastern</span>
              </span>
            ) : (
              <span>Time not known</span>
            )}
            {mins ? <span className="ip-dim">Video, {mins} min</span> : null}
          </p>
          <p className="ip-sub">
            {view.award ? <span>{view.award}</span> : null}
            <Link className="rf-lnk ip-app" href={`/scholarships/applicants/${encodeURIComponent(view.code)}`}>
              Application <span className="rf-nowrap">{view.code}</span>
            </Link>
          </p>
        </div>
      </PageHeader>

      <div className="ip-grid">
        <div className="ip-side">
          {/* Join: the two interviewers and admins get the link; everyone else sees whether one is set. */}
          <section className="ip-join rf-pcard" aria-labelledby="ip-jh">
            <h2 id="ip-jh" className="rf-sr">
              Join
            </h2>
            {view.link ? (
              <>
                <div className="ip-jrow">
                  <a className="rf-btn rf-btn-gold ip-jbtn" href={view.link} target="_blank" rel="noopener noreferrer">
                    <Icon name="video" />
                    Join on Teams
                  </a>
                  <button type="button" className="rf-btn ip-cbtn" onClick={() => void copy()} aria-describedby="ip-copied">
                    {copied === 'ok' ? <Icon name="check" /> : null}
                    {copied === 'ok' ? 'Copied' : 'Copy link'}
                  </button>
                </div>
                <p id="ip-copied" className="ip-copied">
                  {copied === 'ok' ? 'Link copied.' : ''}
                </p>
                {copied === 'fail' ? (
                  <div className="ip-cfail">
                    <label htmlFor="ip-linkbox">Copy didn&apos;t work. Select the link and copy it.</label>
                    <input id="ip-linkbox" ref={copyBox} readOnly value={view.link} onFocus={(e) => e.currentTarget.select()} />
                  </div>
                ) : null}
              </>
            ) : view.linkHidden ? (
              <p className="ip-nolink">
                <Icon name="lock" />
                <span>A Teams link is set. Only the two interviewers and admins see it.</span>
              </p>
            ) : (
              <p className="ip-nolink">
                <Icon name="clock" />
                <span>No Teams link yet.</span>
              </p>
            )}
          </section>

          <Panel id="ip-ph" title="Interviewers" className="ip-people">
            {pair.length === 0 ? (
              <StateLine kind="empty">Nobody is paired yet.</StateLine>
            ) : (
              <ul className="ip-pair">
                {pair.map((p) => {
                  const open = sheet?.out === p.id;
                  return (
                    <li key={p.id}>
                      <div className="ip-prow">
                        <span className={`ip-av${p.me ? ' ip-me' : ''}`} aria-hidden="true">
                          {p.initials}
                        </span>
                        <span className="ip-pn">
                          <span className="ip-pname">{p.name}</span>
                          {p.me ? <span className="ip-you">You</span> : null}
                        </span>
                        {view.caps.change ? (
                          <button
                            type="button"
                            id={`ip-chg-${p.id}`}
                            className="rf-lnk ip-chg"
                            aria-expanded={open}
                            aria-controls={`ip-sheet-${p.id}`}
                            aria-disabled={locked || undefined}
                            onClick={() => (open ? closeSheet() : void openChange(p))}
                          >
                            Change<span className="rf-sr"> {p.name}</span>
                          </button>
                        ) : null}
                      </div>
                      {view.caps.change ? (
                        <Fold open={open} id={`ip-sheet-${p.id}`} className="ip-sheet-f">
                          {open && sheet ? (
                            <div className="ip-sheet">
                              <p className="ip-sh" tabIndex={-1} ref={sheetHead} id={`ip-shh-${p.id}`}>
                                Who covers for <span className="rf-nowrap">{p.name}</span>?
                              </p>
                              {sheet.state === 'loading' ? (
                                <p className="ip-dim" role="status">
                                  Checking who is free…
                                </p>
                              ) : sheet.state === 'error' ? (
                                <StateLine kind="error" onRetry={() => void openChange(p)}>
                                  {sheet.message ?? LIST_FAILED}
                                </StateLine>
                              ) : sheet.people.length === 0 ? (
                                <StateLine kind="empty">Nobody else is free for the whole time.</StateLine>
                              ) : (
                                <fieldset className="ip-cands">
                                  <legend className="rf-sr">Board members free for the whole time</legend>
                                  {sheet.people.map((c) => (
                                    <label key={c.id} className={`ip-cand${sheet.pick === c.id ? ' ip-on' : ''}`}>
                                      <input
                                        type="radio"
                                        name={`ip-cand-${p.id}`}
                                        value={c.id}
                                        checked={sheet.pick === c.id}
                                        disabled={sheet.saving}
                                        onChange={() => setSheet((s) => (s ? { ...s, pick: c.id } : s))}
                                      />
                                      <span className="ip-av" aria-hidden="true">
                                        {c.initials}
                                      </span>
                                      <span className="ip-pname">{c.name}</span>
                                    </label>
                                  ))}
                                </fieldset>
                              )}
                              {sheet.message && sheet.state === 'ok' ? (
                                <p className="ip-outcome ip-bad" role="alert">
                                  <Icon name="alert" />
                                  <span>{sheet.message}</span>
                                </p>
                              ) : null}
                              <div className="ip-sact">
                                {sheet.state === 'ok' && sheet.people.length > 0 ? (
                                  <GoButton className="rf-btn" openedAt={sheet.openedAt} onGo={() => void saveChange()} aria-disabled={!sheet.pick || sheet.saving || undefined} aria-describedby={`ip-shh-${p.id}`}>
                                    {sheet.saving ? 'Saving…' : 'Save change'}
                                  </GoButton>
                                ) : null}
                                <button type="button" className="rf-lnk" onClick={() => closeSheet()} disabled={sheet.saving}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </Fold>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {outcomeLine}
          </Panel>
        </div>

        <div className="ip-main">
          <Panel
            id="ip-qh"
            title="Questions and notes"
            className="ip-qs"
            action={
              view.isAdmin ? (
                <Link className="rf-lnk" href={QUESTIONS}>
                  Edit questions
                </Link>
              ) : undefined
            }
          >
            {!canNotes && !view.notesFailed ? <p className="ip-why">Notes are for this interview&apos;s two interviewers and admins.</p> : null}
            {view.notesFailed ? (
              <StateLine kind="error" onRetry={() => startRefresh(() => router.refresh())}>
                Notes didn&apos;t load.
              </StateLine>
            ) : null}
            {view.questionsFailed ? (
              <StateLine kind="error" onRetry={() => startRefresh(() => router.refresh())}>
                The questions didn&apos;t load.
              </StateLine>
            ) : view.groups.length === 0 ? (
              <p className="rf-none">
                No interview questions yet.
                <Link className="rf-lnk" href={QUESTIONS}>
                  Add questions
                </Link>
              </p>
            ) : (
              <ol className="ip-qlist">
                {view.groups.map((g) => (
                  <li key={g.key} className="ip-grp">
                    <h3 className="ip-gname">{g.name}</h3>
                    <ol>
                      {g.questions.map((q) => (
                        <li key={q.id} className="ip-q">
                          <p className="ip-qt" id={`ip-qt-${q.id}`}>
                            <span className="ip-qn">{q.n}</span>
                            <span>{q.text}</span>
                          </p>
                          {theirs(q.id)}
                          {canNotes ? box(q.id, `Your notes on question ${q.n}`, `ip-qt-${q.id}`) : null}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {canNotes || note(OVERALL).length ? (
            <Panel id="ip-oh" title="Overall notes" className="ip-overall">
              {theirs(OVERALL)}
              {canNotes ? box(OVERALL, 'Your overall notes') : null}
            </Panel>
          ) : null}

          {view.caps.score ? (
            <p className="ip-private">
              <Icon name="lock" />
              <span>Your private notes stay on the Scoring page, where only you see them.</span>
            </p>
          ) : null}

          {view.caps.score ? (
            <p className="ip-score">
              <Link className="rf-btn" href={`/scholarships/scoring?code=${encodeURIComponent(view.code)}`}>
                <Icon name="scoring" />
                Score <Nw text={first} names={[first]} />
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      <p className="rf-sr" aria-live="polite" key={said.n}>
        {said.text}
      </p>
    </div>
  );
}

/**
 * The Save change button. It acts on a pointer click, or on Enter/Space key-up after a fresh key-down that began on it
 * (lib/interviews-map.ts goKey), never sooner than 400 ms after the sheet opened and never on a held, repeating key.
 */
function GoButton({ openedAt, onGo, children, ...rest }: { openedAt: number; onGo: () => void; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onKeyDown' | 'onKeyUp' | 'children' | 'type'>) {
  const keyDown = useRef(false);
  const keyActed = useRef(0);
  const isKey = (k: string) => k === 'Enter' || k === ' ';
  const blocked = rest['aria-disabled'] === true;
  return (
    <button
      type="button"
      {...rest}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (blocked) return;
        if (e.detail === 0 && Date.now() - keyActed.current < 500) return;
        if (armed(openedAt, Date.now())) onGo();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (!isKey(e.key)) return;
        e.preventDefault();
        keyDown.current = goKey('down', e.repeat, keyDown.current, armed(openedAt, Date.now())) === 'wait';
      }}
      onKeyUp={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (!isKey(e.key)) return;
        e.preventDefault();
        const r = goKey('up', false, keyDown.current, armed(openedAt, Date.now()));
        keyDown.current = false;
        if (r !== 'go' || blocked) return;
        keyActed.current = Date.now();
        onGo();
      }}
    >
      {children}
    </button>
  );
}
