'use client';

// The refreshed Sponsorships page (demo p-sponsorships, Ops Hub refresh 2026-11-12): the title with the year, the news card
// (a sponsorship not started yet), this year's sponsorships with "Log a sponsorship" in place (type one line, Enter reads it
// into chips, then a money confirm "Log $600 for ...?" and the gold "Log $600"), and "How a sponsorship works".
//
// Mock mode changes its own state, like the demo (Undo included). Live mode logs through rpc log_sponsorship
// (lib/sponsorships-writes.ts), which saves the sponsorship and its Budget spending in one step. That call takes no browser
// id, so after ANY failure the page never resends on its own: it reloads the list, says "Checking whether it saved…", reads
// the rows with the same title, amount and date, and only when no new one exists offers "Try again". A log whose outcome is
// not settled is remembered while the page is open, through Change, Cancel and closing the line (lib/sponsorships-log.ts).
// This read-back check narrows the double-log risk; it does not remove it (see that file). One log at a time; the control
// is disabled while it runs, and the gold button only acts 400 ms after it appears and a fresh key-up, so a held or double
// Enter cannot confirm money. There is no Undo in live mode.
import '@/components/refresh/refresh.css';
import './sponsorships.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { clock } from '@/lib/refresh-time';
import { easternDay } from '@/lib/refresh-time';
import { createLogger, guarded, isArmed, type Logger, type LogOutcome } from '@/lib/sponsorships-log';
import {
  byDate,
  draftProblem,
  fullDate,
  KIND_ICON,
  KIND_LABEL,
  LOG_WORDS,
  money,
  newsOf,
  plural,
  readLine,
  rowFromInput,
  toInput,
  totals,
  type Draft,
  type LogInput,
} from '@/lib/sponsorships-map';
import type { MockWrite, SponsorRow, SponsorsView } from '@/lib/sponsorships-view';
import { logSponsorshipOnce, matchingRows, type LogResult } from '@/lib/sponsorships-writes';
import { ProgramsNav, SponsorsHead, SponsorsHowSk, SponsorsListSk } from './sponsorships-skeleton';

type Props = { view: SponsorsView; live: boolean };

/** Where the add form is: closed, typing, the money confirm, the log running, the check running, or the check failed. */
type Phase = 'closed' | 'editing' | 'confirm' | 'saving' | 'checking' | 'unknown';

/** The two calls a log needs (live: the database; mock: the page's own rows). */
type Writer = { match: (p: LogInput) => Promise<SponsorRow[] | null>; log: (p: LogInput) => Promise<LogResult> };

/** How long to wait after a failed log before checking, so a request still finishing on the server is seen. */
const CHECK_WAIT_LIVE = 2000;
const CHECK_WAIT_MOCK = 700;

// Waits `ms` milliseconds.
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// True when two logs describe the same row (title, amount, date): what the check compares.
const same = (r: SponsorRow, p: LogInput) => r.title === p.title && r.cents === p.cents && r.on === p.on;

// The mock writer: matches and logs against the page's own rows. `failsave`: the first log fails as a timeout would and did
// NOT save. `unsure`: the first log fails but DID save, and the first check after it fails.
function mockWriter(mode: MockWrite, rowsNow: () => SponsorRow[], saved: { current: { id: string; p: LogInput }[] }): Writer {
  let logs = 0;
  let checks = 0;
  let seq = 0;
  return {
    async match(p) {
      checks += 1;
      if (mode === 'unsure' && logs === 1 && checks === 2) return null;
      const rows = rowsNow().filter((r) => same(r, p));
      const ids = rows.map((r) => r.id);
      return [...rows, ...saved.current.filter((x) => same(rowFromInput(x.id, x.p), p) && !ids.includes(x.id)).map((x) => rowFromInput(x.id, x.p))];
    },
    async log(p) {
      logs += 1;
      const id = `sz-new-${++seq}`;
      if (mode === 'failsave' && logs === 1) return { ok: false, reason: 'maybe' };
      if (mode === 'unsure' && logs === 1) {
        saved.current.push({ id, p });
        return { ok: false, reason: 'maybe' };
      }
      return { ok: true, id };
    },
  };
}

// The live writer: the database calls in lib/sponsorships-writes.ts.
const liveWriter: Writer = { match: (p) => matchingRows(p), log: (p) => logSponsorshipOnce(p) };

// The chips under the field: kind, students, amount (or "Amount needed"), when.
function Chips({ d }: { d: Draft }) {
  return (
    <>
      {d.kind ? <span className="sz-pchip">{KIND_LABEL[d.kind]}</span> : null}
      {d.students !== null ? <span className="sz-pchip">{plural(d.students, 'student', 'students')}</span> : null}
      {d.cents !== null ? <span className="sz-pchip">{money(d.cents)}</span> : <span className="sz-pchip sz-miss">Amount needed</span>}
      {d.when ? (
        <span className="sz-pchip">
          <Icon name="cal" />
          {d.dated ? fullDate(d.on) : d.when}
        </span>
      ) : null}
    </>
  );
}

// One sponsorship row: kind icon | kind, title, students and when | students | spent | state.
function SponsorLine({ r, flash }: { r: SponsorRow; flash: boolean }) {
  const done = r.state === 'done';
  const students = plural(r.students, 'student', 'students');
  return (
    <div className={`sz-sp${flash ? ' sz-flash' : ''}`} data-row={r.id} id={`sz-row-${r.id}`}>
      <span className="sz-kt" aria-hidden="true">
        <Icon name={KIND_ICON[r.kind]} />
      </span>
      <div className="sz-main">
        <span className="sz-eb">
          <span>{KIND_LABEL[r.kind]}</span>
        </span>
        <span className="sz-t">{r.title}</span>
        <span className="sz-meta">
          <span className="sz-ph-only">{students}</span>
          <span>{r.when}</span>
          {done ? (
            <Link className="rf-lnk" href="/finance/budget">
              On Budget
            </Link>
          ) : null}
        </span>
      </div>
      <span className="sz-stu">{students}</span>
      <span className="sz-amt">{money(r.cents)}</span>
      <span className="sz-stc">
        <span className={`sz-mark${done ? ' sz-done' : ''}`}>
          {done ? <Icon name="check" /> : null}
          {done ? 'Done' : 'Not started'}
        </span>
      </span>
    </div>
  );
}

// The page.
export function SponsorshipsBoard({ view, live }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { caps, year } = view;

  // Rows this page logged that the server data does not show yet (dropped once it does), and, in mock mode, rows undone.
  const [local, setLocal] = useState<SponsorRow[]>([]);
  const serverIds = useMemo(() => new Set(view.rows.map((r) => r.id)), [view.rows]);
  const rows = useMemo(() => [...view.rows, ...local.filter((r) => !serverIds.has(r.id))].sort(byDate), [view.rows, local, serverIds]);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const [phase, setPhase] = useState<Phase>('closed');
  const [text, setText] = useState('');
  const [pending, setPending] = useState<LogInput | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [recent, setRecent] = useState<{ text: string; id: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [, startRefresh] = useTransition();
  const [retrying, startRetry] = useTransition();

  // One log at a time (a second tap while one runs does nothing). When the money confirm appeared, and whether a key was let go
  // (or a pointer pressed) since: the gold button acts only once both hold (lib/sponsorships-log.ts isArmed).
  const busy = useRef(false);
  const openedAt = useRef(0);
  const freshUp = useRef(true);
  const mockSaved = useRef<{ id: string; p: LogInput }[]>([]);
  const minute = useRef(14);
  const focusSel = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const flashT = useRef(0);

  // The logger, made on first use (in a handler, never during render); it keeps the unresolved attempts while the page is open.
  // The board is keyed by the demo flag, so its writer never changes.
  const loggerRef = useRef<Logger | null>(null);
  const logger = () => {
    if (!loggerRef.current) {
      const w = live ? liveWriter : mockWriter(view.mockWrite, () => rowsRef.current, mockSaved);
      loggerRef.current = createLogger({ match: w.match, log: w.log, wait, checkWait: live ? CHECK_WAIT_LIVE : CHECK_WAIT_MOCK });
    }
    return loggerRef.current;
  };

  // Fresh rows from the server settle any attempt whose row now shows (seeing the row is the answer).
  useEffect(() => {
    loggerRef.current?.settleWith(view.rows);
  }, [view.rows]);

  // A key let go or a pointer pressed anywhere: the confirm's gold button may act (once 400 ms have passed).
  useEffect(() => {
    const up = () => {
      freshUp.current = true;
    };
    document.addEventListener('keyup', up);
    document.addEventListener('pointerdown', up, true);
    return () => {
      document.removeEventListener('keyup', up);
      document.removeEventListener('pointerdown', up, true);
    };
  }, []);

  // Says one line in the page's polite live region (cleared first, so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);

  // Moves focus after a render to the first of the selectors that exists; the request waits (render to render) until one does.
  useEffect(() => {
    const sel = focusSel.current;
    if (!sel) return;
    for (const s of sel.split('|')) {
      const el = rootRef.current?.querySelector<HTMLElement>(s);
      if (el && el.offsetParent !== null) {
        focusSel.current = null;
        el.focus({ preventScroll: true });
        // The field may sit below a long list: bring it into view (the buttons stay where they are).
        if (s === '#sz-add-in') el.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
  });

  // Stops the row flash timer when the page goes away.
  useEffect(() => () => window.clearTimeout(flashT.current), []);

  // Flashes a row gold for a moment (the demo's "flash").
  const flashRow = (id: string) => {
    setFlash(null);
    window.requestAnimationFrame(() => setFlash(id));
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setFlash(null), 1700);
  };

  // The time words for "Logged 9:14 AM": the demo's ticking clock in mock mode, Eastern time now in live mode.
  const nowWords = () => (live ? clock(new Date().toISOString()) : `9:${String(minute.current++).padStart(2, '0')} AM`);

  const adding = phase !== 'closed';
  const locked = phase === 'saving' || phase === 'checking';
  const draft = text.trim() ? readLine(text, view.today) : null;

  // Opens the form and puts the cursor in the field.
  const openAdd = () => {
    setPhase('editing');
    setErr('');
    focusSel.current = '#sz-add-in';
  };

  // Closes the form, clears it, and puts focus on "Log a sponsorship" (or the empty line's link).
  const closeAdd = () => {
    setPhase('closed');
    setPending(null);
    setErr('');
    setNote('');
    setText('');
    focusSel.current = '#sz-add-open|#sz-addfirst';
  };

  // Back from the confirm to typing (Change, Escape, or a tap in the field).
  const backToEdit = () => {
    if (locked) return;
    setPending(null);
    setNote('');
    setPhase('editing');
    focusSel.current = '#sz-add-in';
  };

  // Enter in the field: an empty line closes the form; a line that can be logged opens the money confirm.
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (phase !== 'editing') return;
    if (!text.trim()) return closeAdd();
    // The year and future-date rules use the Eastern day at this moment (a tab left open over midnight has a stale view.today).
    const d = readLine(text, live ? easternDay(new Date().toISOString()) : view.today);
    const problem = draftProblem(d);
    if (problem) {
      setErr(problem);
      say(problem);
      focusSel.current = '#sz-add-in';
      return;
    }
    setErr('');
    setNote('');
    setPending(toInput(d));
    setPhase('confirm');
    openedAt.current = Date.now();
    freshUp.current = false;
    focusSel.current = '#sz-log';
  };

  // Keys in the field: a held Enter does nothing more; Escape leaves the confirm, or closes the form.
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.repeat) {
      e.preventDefault();
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (pending) backToEdit();
    else closeAdd();
  };

  // A log that saved: the row joins this year's list (and flashes) when its date is in the shown year, the "Logged ..." line
  // appears (naming the year when it is another one), the form closes.
  const logged = (id: string, p: LogInput) => {
    busy.current = false;
    const y = Number(p.on.slice(0, 4));
    if (y === year) setLocal((l) => [...l.filter((r) => r.id !== id), rowFromInput(id, p)]);
    setRecent({ text: `Logged ${nowWords()}, also on Budget${y === year ? '' : `, dated ${y}`}`, id });
    setPhase('closed');
    setPending(null);
    setText('');
    setNote('');
    setErr('');
    if (y === year) flashRow(id);
    say(`Logged ${money(p.cents)}`);
    focusSel.current = caps.undo ? '#sz-undo|#sz-add-open|#sz-addfirst' : '#sz-add-open|#sz-addfirst';
    if (live) startRefresh(() => router.refresh());
  };

  // An earlier attempt of this line turned out to have saved: that row shows (as stored, never the edited words) and flashes,
  // the form stays open with the words kept, and the next armed Log adds another one on purpose (the memory is cleared).
  const savedEarlier = (id: string, row: SponsorRow | null) => {
    busy.current = false;
    if (row && row.on?.startsWith(String(year))) {
      setLocal((l) => [...l.filter((r) => r.id !== id), row]);
      flashRow(id);
    }
    setPhase('confirm');
    setNote(LOG_WORDS.savedEarlier);
    say(LOG_WORDS.savedEarlier);
    openedAt.current = Date.now();
    freshUp.current = false;
    focusSel.current = '#sz-log';
    if (live) startRefresh(() => router.refresh());
  };

  // Shows one outcome of a log or a check, in the confirm box and once in the live region.
  const show = (out: LogOutcome, p: LogInput) => {
    if (out.kind === 'logged') return out.earlier ? savedEarlier(out.id, out.row) : logged(out.id, p);
    busy.current = false;
    const words =
      out.kind === 'not_saved'
        ? LOG_WORDS.notSaved
        : out.kind === 'unknown'
          ? LOG_WORDS.unknown
          : out.kind === 'failed'
            ? LOG_WORDS.failed
            : out.reason === 'no_category'
              ? LOG_WORDS.noCategory
              : out.reason === 'denied'
                ? LOG_WORDS.denied
                : LOG_WORDS.invalid;
    setNote(words);
    say(words);
    if (out.kind === 'unknown') {
      setPhase('unknown');
      focusSel.current = '#sz-recheck';
    } else {
      setPhase('confirm');
      // A definite refusal: the fix is in the line, so focus goes to Change; otherwise the gold button may be tried again.
      focusSel.current = out.kind === 'refused' ? '#sz-change' : '#sz-log';
    }
  };

  // While a log fails and is checked: "Checking whether it saved…". No page refresh here: the check reads the matching rows
  // itself, and a refresh that fails (or meets an expired sign-in) reloads the whole page and loses the open attempt.
  const checking = () => {
    setPhase('checking');
    setNote(LOG_WORDS.checking);
    say(LOG_WORDS.checking);
    focusSel.current = '#sz-log';
  };

  // The gold "Log $X": once armed, logs the line at most once (lib/sponsorships-log.ts logOnce).
  const logIt = async (e: MouseEvent<HTMLButtonElement>) => {
    const p = pending;
    if (!p || busy.current || !caps.log) return;
    // Too soon after the confirm appeared: nothing new is said, and focus stays on the button.
    if (!isArmed(openedAt.current, Date.now(), freshUp.current)) return e.currentTarget.focus();
    const out = await guarded(busy, async () => {
      setPhase('saving');
      setNote('');
      say('Logging…');
      return logger().logOnce(p, checking);
    });
    if (out) show(out, p);
  };

  // "Check again" after a check that could not read (a rejection reads as "couldn't check"; busy always resets).
  const recheck = async () => {
    const p = pending;
    if (!p) return;
    const out = await guarded(busy, async () => {
      checking();
      return logger().recheck(p);
    });
    if (out) show(out, p);
  };

  // Undo (mock only): the logged row goes away again.
  const undo = () => {
    if (!recent || !caps.undo) return;
    const id = recent.id;
    setLocal((l) => l.filter((r) => r.id !== id));
    setRecent(null);
    say('Undone. Removed from Budget too.');
    focusSel.current = '#sz-add-open|#sz-addfirst';
  };

  // The "n" key opens the form (not while typing somewhere, not with a modifier key).
  useEffect(() => {
    if (!caps.log || view.loadFailed) return;
    const onDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      if (phase !== 'closed') return;
      e.preventDefault();
      setPhase('editing');
      setErr('');
      focusSel.current = '#sz-add-in';
    };
    document.addEventListener('keydown', onDown);
    return () => document.removeEventListener('keydown', onDown);
  }, [caps.log, view.loadFailed, phase]);

  // "Try again" on the error card: mock mode goes back to the sample (drops ?demo), live mode reloads the server data.
  const retry = () =>
    startRetry(() => {
      if (live) router.refresh();
      else router.replace(pathname);
    });

  // "See it" on the news card: brings the waiting row into view and flashes it.
  const seeIt = (id: string) => {
    const el = document.getElementById(`sz-row-${id}`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    flashRow(id);
  };

  const news = view.loadFailed ? null : newsOf(rows);
  const newsCard = news ? (
    <NewsCard icon={KIND_ICON[news.row.kind]} gold kicker={news.open > 1 ? `${news.open} not started` : 'Not started'} title={news.row.title} go="See it" onClick={() => seeIt(news.row.id)} />
  ) : null;

  const live_ = (
    <p className="rf-sr" aria-live="polite">
      {announce}
    </p>
  );

  if (view.loadFailed) {
    return (
      <div className="rf sz" ref={rootRef}>
        <SponsorsHead year={year} />
        <ProgramsNav />
        <div className="rf-board sz-board sz-solo">
          <div className="rf-col">
            {retrying ? (
              <div aria-busy="true">
                <SponsorsListSk />
              </div>
            ) : (
              <section className="rf-panel sz-panel" aria-label="Sponsorships">
                <div className="rf-pcard">
                  <div className="sz-err" role="alert">
                    <div>
                      <b>Sponsorships didn&apos;t load.</b>
                      <p>Check your connection, then try again.</p>
                    </div>
                    <button type="button" className="rf-btn" onClick={retry}>
                      <Icon name="refresh" />
                      Try again
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
          {retrying ? (
            <div className="rf-col">
              <SponsorsHowSk />
            </div>
          ) : null}
        </div>
        {live_}
      </div>
    );
  }

  const n = rows.length;
  const tot = totals(rows);
  const p = pending;
  const showConfirm = !!p && phase !== 'editing' && phase !== 'closed';

  return (
    <div className="rf sz" ref={rootRef}>
      <SponsorsHead year={year} news={newsCard} />
      <ProgramsNav />

      <div className="rf-board sz-board">
        <div className="rf-col">
          <section className="rf-panel sz-panel" aria-labelledby="sz-yh">
            <div className="rf-ph">
              <h2 id="sz-yh">{year}</h2>
              {n > 1 ? (
                <span className="sz-tot" data-design-keep="Stress sample has exactly one paid row, so the year total equals that row; real data differs">
                  <b>{money(tot.cents)}</b> spent · {plural(tot.students, 'student', 'students')}
                </span>
              ) : null}
            </div>
            <div className="rf-pcard">
              {n === 0 ? (
                <p className="sz-none">
                  Nothing logged in {year} yet.
                  {caps.log && !adding ? (
                    <button type="button" className="rf-lnk" id="sz-addfirst" onClick={openAdd}>
                      Log a sponsorship
                    </button>
                  ) : null}
                </p>
              ) : (
                <>
                  <div className="sz-cols" aria-hidden="true">
                    <span />
                    <span>Sponsorship</span>
                    <span>Students</span>
                    <span className="sz-r">Spent</span>
                    <span>State</span>
                  </div>
                  <div>
                    {rows.map((r) => (
                      <SponsorLine key={r.id} r={r} flash={flash === r.id} />
                    ))}
                  </div>
                </>
              )}

              {recent ? (
                <p className="sz-year-after">
                  <span className="sz-after">
                    <span className="sz-tk">
                      <Icon name="check" />
                    </span>
                    {recent.text}
                    {caps.undo ? (
                      <>
                        &nbsp;·&nbsp;
                        <button type="button" className="rf-lnk" id="sz-undo" onClick={undo}>
                          Undo
                        </button>
                      </>
                    ) : null}
                  </span>
                </p>
              ) : null}

              {caps.log ? (
                <div className={`sz-add${recent ? ' sz-add-gap' : ''}`}>
                  <button type="button" className="sz-add-open" id="sz-add-open" hidden={adding || n === 0} onClick={openAdd}>
                    <span className="sz-plus">
                      <Icon name="plus" />
                    </span>
                    <span className="sz-lab">Log a sponsorship</span>
                    <span className="sz-kbd" aria-hidden="true">
                      N
                    </span>
                  </button>
                  <form className="sz-add-form" hidden={!adding} autoComplete="off" noValidate onSubmit={onSubmit}>
                    <div className="sz-add-field">
                      <span className="sz-plus">
                        <Icon name="plus" />
                      </span>
                      <input
                        id="sz-add-in"
                        type="text"
                        enterKeyHint="done"
                        aria-label="New sponsorship: what it was for, students, amount and when. e.g. NSBE regional conference 3 students $600 Dec 5"
                        aria-describedby={err ? 'sz-add-err' : undefined}
                        aria-invalid={err ? true : undefined}
                        placeholder="e.g. NSBE regional conference 3 students $600 Dec 5"
                        maxLength={200}
                        value={text}
                        readOnly={!!p}
                        onChange={(e) => {
                          setText(e.target.value);
                          if (err) setErr('');
                        }}
                        onKeyDown={onKey}
                        onClick={() => {
                          if (p) backToEdit();
                        }}
                      />
                      <span className="sz-hint">Enter to check</span>
                    </div>
                    <div className="sz-chips">{draft ? <Chips d={draft} /> : null}</div>
                    {err ? (
                      <p className="sz-add-err" id="sz-add-err">
                        {err}
                      </p>
                    ) : null}
                    {showConfirm && p ? (
                      <div className="sz-confirm" role="group" aria-label="Confirm the amount">
                        <p>
                          Log <b>{money(p.cents)}</b> for <b>{p.title}</b>, spent <b>{fullDate(p.on)}</b>? <span>It&apos;s also recorded on Budget, under Sponsorships.</span>
                        </p>
                        {note ? <p className="sz-note">{note}</p> : null}
                        <div className="sz-dact">
                          {phase === 'unknown' ? (
                            <button type="button" className="rf-btn rf-btn-gold" id="sz-recheck" onClick={recheck}>
                              Check again
                            </button>
                          ) : (
                            <button type="button" className="rf-btn rf-btn-gold" id="sz-log" aria-disabled={locked || undefined} onClick={logIt}>
                              {phase === 'saving' ? 'Logging…' : phase === 'checking' ? 'Checking…' : `Log ${money(p.cents)}`}
                            </button>
                          )}
                          <button type="button" className="rf-lnk" id="sz-change" disabled={locked} onClick={backToEdit}>
                            Change
                          </button>
                          <button type="button" className="rf-lnk" disabled={locked} onClick={closeAdd}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </form>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="rf-col">
          <section className="rf-panel sz-panel sz-how" aria-labelledby="sz-hh">
            <div className="rf-ph">
              <h2 id="sz-hh">How a sponsorship works</h2>
            </div>
            <div className="rf-pcard">
              <ol>
                {view.how.map((s, i) => (
                  <li key={s.title} className={s.here ? 'sz-here' : undefined}>
                    <span className="sz-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <b>{s.title}</b>
                      {s.body ? <span>{s.body}</span> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      </div>
      {live_}
    </div>
  );
}
