'use client';

// The refreshed Selection page (demo p-selection, Ops Hub refresh). Before the meeting: the scores coming in, the dates on
// the way to the decision, and what the meeting will need. At the meeting: the ranking by combined score (information for
// the board: the board decides) and the decisions card (the main award, extra awards, who calls the winners, and the
// release of decisions to every applicant).
//
// Mock mode changes only its own state, like the demo, and never calls a server action. Live mode writes only through
// lib/actions/selection.ts, called exactly as the old page called it: recordAward and undoAward (no optimistic change;
// the page shows the result once the action answers, then re-reads), and releaseAndNotify, which emails every applicant
// and cannot be undone. The release asks first, disables its control at the click, runs at most once per page visit,
// never retries, and after any failure or timeout re-reads the page and says plainly what already happened. Only admins
// see the release control (lib/release.ts canShowRelease); the server action checks the role again.
import '@/components/refresh/refresh.css';
import './selection.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Fold } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { recordAward, releaseAndNotify, undoAward } from '@/lib/actions/selection';
import { clock, easternDay, shortDate } from '@/lib/refresh-time';
import { canShowRelease } from '@/lib/release';
import { emailLine, releaseTitle, type EmailOutcome } from '@/lib/release-copy';
import {
  BAR_MAX,
  CALL_NOTE,
  CALL_STEP,
  NO_ANSWER,
  NO_OVER,
  UNDO_RULE,
  barSegments,
  canUndo,
  checkExtraForm,
  dayTime,
  dropOver,
  dueWords,
  emailsKicker,
  extraConfirmBody,
  firstOf,
  mainConfirmBody,
  mockStamp,
  money,
  newsFor,
  openCandidates,
  pdateOf,
  phaseOf,
  releaseParts,
  timeline,
  trackPos,
  viewSig,
  withOver,
  type AwardOver,
  type SlCandidate,
  type SlNews,
} from '@/lib/selection-map';
import type { SelectionView, SlAward, SlRow, SlUnscored } from '@/lib/selection-view';
import { SL_ARM_MS, createSlArm, slNowMs } from '@/lib/selection-arm';
import {
  canSettleCheck,
  confirmOpener,
  failText,
  focusAfterRecord,
  notReleasedLine,
  relAfterReread,
  releasedLines,
  twoMainsWarning,
  type RelState,
} from '@/lib/selection-state';
import { SlBodySkel, SlHead } from './selection-skeleton';
import { guarded, newGuard, runRelease, writeRecord, writeUndo, type SlActions, type WriteResult } from './selection-writes';

type Props = { view: SelectionView; live: boolean };

/** The server actions live mode writes through. */
const ACTIONS: SlActions = { recordAward, undoAward, releaseAndNotify };
/** Ranked rows shown before "N more applicants". */
const SHOW = 10;
/** Below this width the decisions sit above the ranking (the news card scrolls to them). */
const STACK_Q = '(max-width: 1179px)';

/** An extra award waiting for its confirm. */
type PendingX = { applicationId: string; code: string; name: string; awardName: string; cents: number };

// True when the person asked the system for reduced motion.
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The page.
export function SelectionBoard({ view, live }: Props) {
  const router = useRouter();
  const { caps, cycle, meeting, crit } = view;

  // Local changes over the server's awards (mock: the whole truth; live: what an answered write did, until the re-read).
  const [over, setOver] = useState<AwardOver>(NO_OVER);
  const [releasedLocal, setReleasedLocal] = useState<string | null>(null);
  const [emails, setEmails] = useState<EmailOutcome | null>(null);
  const [rel, setRel] = useState<RelState>('idle');
  const [relMsg, setRelMsg] = useState('');
  // The server's clock on the data shown when a release attempt failed (the answer is trusted only from newer data), and
  // when the release confirm opened (its go button waits for the fresh counts).
  const [relFrom, setRelFrom] = useState<string | null>(null);
  const [confirmFrom, setConfirmFrom] = useState<string | null>(null);
  const [pickMain, setPickMain] = useState('');
  const [confirm, setConfirm] = useState<'main' | 'extra' | null>(null);
  const [adding, setAdding] = useState(false);
  const [x, setX] = useState({ name: '', amt: '', who: '' });
  const [xErr, setXErr] = useState('');
  const [pendingX, setPendingX] = useState<PendingX | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState(false);
  const [recording, setRecording] = useState<'main' | 'extra' | null>(null);
  const [recErr, setRecErr] = useState<{ where: 'main' | 'extra'; text: string } | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoErr, setUndoErr] = useState<{ id: string; text: string } | null>(null);
  const [joined, setJoined] = useState(false);
  const [flash, setFlash] = useState('');
  const [announce, setAnnounce] = useState('');
  // Mock "Try again": a short skeleton, then the page (the demo's 900 ms). Live: a server refresh.
  const [mockFailed, setMockFailed] = useState(view.loadFailed);
  const [reloading, setReloading] = useState(false);
  const [retrying, startRetry] = useTransition();
  const loadFailed = live ? view.loadFailed : mockFailed;

  // Live writes still running, and the re-read once they settle. New server data is taken in (local changes dropped)
  // only when nothing is running and no re-read is pending; `refreshed` makes the next idle render take it in even when
  // it looks unchanged (a failed write's local value must give way to the server's).
  const [busy, setBusy] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const [refreshed, setRefreshed] = useState(false);
  const [seen, setSeen] = useState(() => viewSig(view));
  const idle = busy === 0 && !refreshing;
  const sig = viewSig(view);
  if ((sig !== seen || refreshed) && idle) {
    setSeen(sig);
    setRefreshed(false);
    setOver(NO_OVER);
  }
  // A release that failed or never answered: once data read after the attempt lands, it says what already happened.
  if (canSettleCheck({ rel, idle, from: relFrom, now: view.now })) {
    setRelFrom(null);
    setRel(relAfterReread({ loadFailed: view.loadFailed, releasedAt: view.cycle?.releasedAt ?? null }));
  }

  const actions = useRef(0);
  const focusK = useRef<string | null>(null);
  const scrollDec = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // True while focus is inside the page (so a control removed under it sends focus to the page, never the body).
  const inside = useRef(false);
  const timers = useRef<number[]>([]);
  const failedOnce = useRef(new Set<string>());
  // One record or undo at a time; the release at most once per page visit (it emails every applicant).
  const writeGuard = useRef(newGuard());
  const releaseGuard = useRef(newGuard());

  const releasedAt = releasedLocal ?? cycle?.releasedAt ?? null;
  const awards = withOver(view.awards, over);
  const mains = awards.filter((a) => a.kind === 'main');
  const main = mains[0];
  // Two main awards (the server doesn't stop a race): a warning, and no release until one is removed.
  const twoMains = twoMainsWarning(awards);
  const extras = awards.filter((a) => a.kind === 'extra');
  const phase = phaseOf(view, releasedAt);
  const awardOf = (applicationId: string) => awards.find((a) => a.applicationId === applicationId);
  const cands = openCandidates(view.rows, view.unscored, awards);
  const all: SlCandidate[] = openCandidates(view.rows, view.unscored, []);
  const byApp = (id: string) => all.find((c) => c.applicationId === id);
  const picked = pickMain ? cands.find((c) => c.applicationId === pickMain) : undefined;
  const showRelease = canShowRelease({ role: caps.release ? 'admin' : null, hasMainAward: Boolean(main), releasedAt }) && !twoMains;

  // The release confirm's counts are being re-read (live): its go button waits.
  const countsWait = live && rel === 'confirm' && (refreshing || confirmFrom === view.now);

  // Reads a message to screen readers once (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);

  // Clears every pending timer when the page goes.
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Moves focus where the last action asked (the title when the target is gone, so focus never falls to the page body),
  // then scrolls the decisions into view when a row or the news card asked for it (only where they sit above the ranking).
  // Only an action sets a target, so a re-read never pulls focus out of a field the person is typing in.
  useEffect(() => {
    const root = rootRef.current;
    if (focusK.current && root) {
      const k = focusK.current;
      focusK.current = null;
      const el = root.querySelector<HTMLElement>(`[data-k="${k}"]`) ?? root.querySelector<HTMLElement>('#sl-pt');
      el?.focus({ preventScroll: true });
    } else if (root && inside.current && (document.activeElement == null || document.activeElement === document.body)) {
      // The focused control went away with a re-read (a confirm closed under it): the error line if one shows, else the
      // title. Never runs while focus is in a field (focus is then not on the body).
      (root.querySelector<HTMLElement>('[data-k="recErr"]') ?? root.querySelector<HTMLElement>('#sl-pt'))?.focus({ preventScroll: true });
    }
    if (scrollDec.current && root) {
      scrollDec.current = false;
      if (window.matchMedia(STACK_Q).matches) root.querySelector('.sl-dec')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    }
  });

  // After a failed or unanswered release, once the re-read lands: says what happened and moves focus to that line.
  useEffect(() => {
    if (rel === 'was-released') say("Decisions are released. The page couldn't confirm the emails.");
    else if (rel === 'not-released') say("Decisions weren't released, so no emails went out.");
    else if (rel === 'check-failed') say("Couldn't check the release. Reload the page to check.");
    else return;
    focusK.current = 'release-note';
    // The focus effect above runs before this one in the same pass; run it again for this target.
    const t = window.setTimeout(() => {
      const el = rootRef.current?.querySelector<HTMLElement>('[data-k="release-note"]');
      if (el && focusK.current === 'release-note') {
        focusK.current = null;
        el.focus({ preventScroll: true });
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [rel, say]);

  // Live "Try again": says "Selection loaded" once the refreshed data reads.
  const wasFailed = useRef(view.loadFailed);
  useEffect(() => {
    if (live && wasFailed.current && !view.loadFailed) say('Selection loaded');
    wasFailed.current = view.loadFailed;
  }, [view.loadFailed, live, say]);

  // Runs `fn` after `ms` (cleared if the page goes first).
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // The time an award or release is stamped with: now (live), or the demo's moment plus three minutes per action (mock).
  const stamp = () => {
    actions.current += 1;
    return live ? new Date().toISOString() : mockStamp(view.now, actions.current);
  };

  // Re-reads the page after a live write settled (the server's data then replaces the local changes).
  const reread = () => {
    if (!live) return;
    startRefresh(() => {
      setRefreshed(true);
      router.refresh();
    });
  };

  // Mock ?demo=failsave's stand-in write: the first try of each key fails after 600 ms, later tries work.
  const mockWrite = (k: string): Promise<WriteResult> =>
    new Promise((res) =>
      later(() => {
        const first = !failedOnce.current.has(k);
        failedOnce.current.add(k);
        res(first ? { kind: 'failed' } : { kind: 'saved', id: null });
      }, 600),
    );

  // Runs one record or undo: the live action (counted as running until it settles, then a re-read), the mock failsave
  // stand-in, or nothing (plain mock: saved at once). Null when another write is still running.
  const write = async (k: string, live_: () => Promise<WriteResult>): Promise<WriteResult | null> => {
    if (!live && !view.failFirst) return { kind: 'saved', id: null };
    return guarded(writeGuard.current, false, async () => {
      if (!live) return mockWrite(k);
      setBusy((b) => b + 1);
      try {
        return await live_();
      } finally {
        setBusy((b) => b - 1);
        reread();
      }
    });
  };


  // ---------- The main award ----------

  // "Choose for the Legacy award" in a row (or the news card): the pick goes into the list and focus moves there.
  const choose = (r: { applicationId: string; name: string } | null) => {
    if (r) {
      setPickMain(r.applicationId);
      say(`${r.name} chosen. Record the award to confirm.`);
    }
    setConfirm(null);
    setRecErr(null);
    focusK.current = 'mainSel';
    scrollDec.current = true;
  };

  // "Record the award": asks first (or, with nobody picked, points at the list).
  const askMain = () => {
    if (!picked) {
      focusK.current = 'mainSel';
      say('Choose the applicant first');
      return;
    }
    setRecErr(null);
    setConfirm('main');
    // Focus goes to the confirm's words, never onto its go button (a held Enter must not confirm).
    focusK.current = 'cfMainText';
  };

  // Records an award after its confirm (main or extra). Live: shown once the action answers.
  const record = async (kind: 'main' | 'extra', p: { applicationId: string; code: string; name: string; awardName: string; cents: number }) => {
    if (!caps.record || recording || !cycle) return;
    setRecording(kind);
    setRecErr(null);
    const r = await write(`record:${kind}:${p.applicationId}`, () =>
      writeRecord(ACTIONS, { cycleId: cycle.id, applicationId: p.applicationId, code: p.code, name: p.name, kind, awardName: kind === 'main' ? cycle.mainAwardName : p.awardName, amountCents: p.cents }),
    );
    setRecording(null);
    if (r == null) return;
    if (r.kind !== 'saved') {
      const text = failText(r);
      // The error stays until the person acts again; focus goes to it (it survives a re-read that closes the confirm).
      setRecErr({ where: kind, text });
      focusK.current = focusAfterRecord(kind, r);
      say(text);
      return;
    }
    const a: SlAward = {
      id: r.id ?? `local-${kind}-${p.applicationId}`,
      applicationId: p.applicationId,
      code: p.code,
      name: p.name,
      kind,
      awardName: kind === 'main' ? cycle.mainName : p.awardName,
      amountCents: p.cents,
      decidedAt: stamp(),
      letterDone: false,
    };
    setOver((o) => ({ added: [...o.added, a], removed: o.removed.filter((id) => id !== a.id) }));
    setConfirm(null);
    setFlash(p.applicationId);
    later(() => setFlash(''), 1600);
    if (kind === 'main') {
      setPickMain('');
      focusK.current = focusAfterRecord('main', r);
      say(`${p.name} recorded for the ${cycle.mainName} award. ${UNDO_RULE}`);
    } else {
      setPendingX(null);
      setAdding(false);
      setX({ name: '', amt: '', who: '' });
      focusK.current = focusAfterRecord('extra', { kind: 'saved', id: a.id });
      say(`${p.awardName} recorded for ${p.name}, ${money(p.cents)}.`);
    }
  };

  // Undoes an award (until its letter goes out or decisions are released). Live: removed once the action answers.
  const undo = async (a: SlAward) => {
    if (!canUndo(a, releasedAt, caps.undo) || undoing) return;
    setUndoing(a.id);
    setUndoErr(null);
    const r = await write(`undo:${a.id}`, () => writeUndo(ACTIONS, a.id));
    setUndoing(null);
    if (r == null) return;
    if (r.kind !== 'saved') {
      // The server's value wins: any local copy of this award goes.
      setOver((o) => dropOver(o, a.id));
      const text = failText(r);
      setUndoErr({ id: a.id, text });
      focusK.current = a.kind === 'main' ? 'undoMain' : `undoX-${a.id}`;
      say(text);
      return;
    }
    setOver((o) => ({ added: o.added.filter((y) => y.id !== a.id), removed: [...o.removed, a.id] }));
    if (a.kind === 'main') {
      setPickMain(a.applicationId);
      focusK.current = 'recordMain';
      say(`Undone. ${a.name} is no longer recorded.`);
    } else {
      focusK.current = 'addX';
      say(`Undone. ${a.awardName} for ${a.name} removed.`);
    }
  };

  // ---------- Extra awards ----------

  // Opens the extra-award form (from the card, or a row with that applicant picked).
  const openExtra = (who = '') => {
    setAdding(true);
    setXErr('');
    setRecErr(null);
    if (who) setX((v) => ({ ...v, who }));
    focusK.current = 'xName';
    if (who) scrollDec.current = true;
  };

  // Checks the form; a good one goes to its confirm.
  const askExtra = () => {
    const c = checkExtraForm(x);
    if (!c.ok) {
      setXErr(c.message);
      focusK.current = 'recordX';
      say(c.message);
      return;
    }
    const who = byApp(x.who);
    if (!who) return;
    setXErr('');
    setRecErr(null);
    setPendingX({ applicationId: who.applicationId, code: who.code, name: who.name, awardName: c.awardName, cents: c.cents });
    setConfirm('extra');
    focusK.current = 'cfXText';
  };

  // ---------- Release ----------

  // Opens the release confirm.
  // Live: re-reads first (another member may have just added an award), and the go button waits for the fresh counts.
  const askRelease = () => {
    if (!showRelease || rel !== 'idle') return;
    setRel('confirm');
    focusK.current = 'cfRelText';
    if (live) {
      setConfirmFrom(view.now);
      reread();
    }
  };

  // Closes a confirm (Back or Escape) and returns focus to the control that opened it.
  const closeConfirm = (which: 'main' | 'extra' | 'release') => {
    if (which === 'release') {
      if (rel !== 'confirm') return;
      setRel('idle');
      setConfirmFrom(null);
    } else {
      if (recording) return;
      setConfirm(null);
      setRecErr(null);
      if (which === 'extra') setPendingX(null);
    }
    focusK.current = confirmOpener(which);
  };

  // Escape on a confirm closes it.
  const escTo = (which: 'main' | 'extra' | 'release') => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeConfirm(which);
  };

  // Releases the decisions and sends the emails: once, never retried. Any failure or timeout re-reads the page first.
  const release = async () => {
    if (!showRelease || rel !== 'confirm' || !cycle || countsWait) return;
    if (releaseGuard.current.used || releaseGuard.current.inFlight) return;
    // The data this attempt was made from: a failure is only settled from data read after it.
    const from = view.now;
    setRel('running');
    if (!live) {
      // Mock: the demo's 600 ms, then released ("failsave": the first try fails and nothing is released).
      releaseGuard.current.used = true;
      later(() => {
        if (view.failFirst) {
          setRelMsg(NO_ANSWER.replace(' Reload to check.', ''));
          setRel('not-released');
          return;
        }
        const at = stamp();
        const out: EmailOutcome = { state: 'sent', sent: cycle.total, skipped: 0, failed: 0 };
        setReleasedLocal(at);
        setEmails(out);
        setRel('idle');
        setAdding(false);
        setConfirm(null);
        focusK.current = 'go-awardees';
        say(`Released. ${releasedLines({ emailLine: emailLine(out), emails: out, rel: 'idle' }).join(' ')}`);
      }, 600);
      return;
    }
    setBusy((b) => b + 1);
    const r = await runRelease(ACTIONS, cycle.id ?? '', releaseGuard.current);
    setBusy((b) => b - 1);
    if (r.kind === 'busy') return;
    if (r.kind === 'released') {
      setReleasedLocal(r.releasedAt);
      setEmails(r.emails);
      setRel('idle');
      setAdding(false);
      setConfirm(null);
      focusK.current = 'go-awardees';
      say(`Released. ${releasedLines({ emailLine: emailLine(r.emails), emails: r.emails, rel: 'idle' }).join(' ')}`);
    } else {
      setRelMsg(r.kind === 'refused' ? r.message : 'No answer in time.');
      setRelFrom(from);
      setRel('checking');
      focusK.current = 'release-note';
      say('Checking what happened. Decisions may already be released and emails may have been sent.');
    }
    reread();
  };

  // ---------- The rest ----------

  // "Try again" on the load error: mock shows the skeleton for 900 ms, then the page; live reloads the server data.
  const retry = () => {
    if (live) {
      startRetry(() => router.refresh());
      return;
    }
    setReloading(true);
    later(() => {
      setMockFailed(false);
      setReloading(false);
      say('Selection loaded');
    }, 900);
  };

  // Mock "Join the call": the demo's "Opening the Teams call" for a moment (live opens the real link).
  const joinMock = () => {
    setJoined(true);
    say('Opening the Teams call');
    later(() => setJoined(false), 2400);
  };

  const liveRegion = (
    <p className="rf-sr" aria-live="polite">
      {announce}
    </p>
  );

  if (reloading || retrying) {
    return (
      <div className="rf sl" data-state="loading" aria-busy="true" ref={rootRef}>
        <h1 className="rf-sr">Selection</h1>
        {liveRegion}
        <SlBodySkel />
      </div>
    );
  }

  const term = cycle?.term ?? '';

  if (loadFailed) {
    return (
      <div className="rf sl" ref={rootRef}>
        {liveRegion}
        <SlHead pdate={term} />
        <section className="sl-card">
          <div className="sl-load-err" role="alert">
            <p>
              <Icon name="alert" />
              Selection didn&apos;t load.
            </p>
            <button type="button" className="rf-btn" data-k="retry" onClick={retry}>
              Try again
            </button>
            {rel !== 'idle' ? (
              <p className="sl-why" tabIndex={-1} data-k="release-note">
                Couldn&apos;t check the release. Decisions may already be released and emails may have been sent. Reload the page to check.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  // Focus inside the page; a blur counts as leaving only when the blurred control is still on the page (a control that
  // was removed takes focus with it, and the focus effect then puts it back on the page).
  const onRootFocus = () => {
    inside.current = true;
  };
  const onRootBlur = (e: { target: EventTarget | null }) => {
    const t = e.target as Node | null;
    queueMicrotask(() => {
      if (t?.isConnected) inside.current = false;
    });
  };

  // ---------- Head ----------
  // Two main awards: the news says so (no Release), instead of offering a release that would tell both they won.
  const news: SlNews | null =
    twoMains && !releasedAt && phase === 'meeting'
      ? { kicker: 'Two main awards recorded', title: 'Remove one before releasing', icon: 'award', gold: false, go: null, cta: '' }
      : newsFor({ phase, cycle, releasedAt, main, canRecord: caps.record, canRelease: showRelease && rel === 'idle', emailsKicker: emailsKicker(emails ? emailLine(emails) : null) });
  const onNews = () => {
    if (!news) return;
    if (news.go === 'choose') choose(null);
    if (news.go === 'release') {
      askRelease();
      scrollDec.current = true;
    }
  };
  const newsCard = news ? (
    news.go === 'open' ? (
      <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go={news.cta} gold={news.gold} href="/scholarships/awardees" />
    ) : news.go ? (
      <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go={news.cta} gold={news.gold} onClick={onNews} />
    ) : (
      <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} gold={news.gold} />
    )
  ) : null;
  const showJoin = phase === 'meeting' && !releasedAt && meeting != null && (live ? meeting.videoUrl != null : true);
  const joinBtn = (k: string) =>
    live ? (
      <a className="rf-btn" href={meeting?.videoUrl ?? undefined} target="_blank" rel="noopener noreferrer" data-k={k}>
        <Icon name="video" />
        Join the call
      </a>
    ) : (
      <button type="button" className="rf-btn" data-k={k} onClick={joinMock}>
        <Icon name="video" />
        Join the call
      </button>
    );
  const opened = joined ? <span className="sl-opened">Opening the Teams call</span> : null;
  const head = (
    <SlHead
      pdate={pdateOf(phase, cycle, meeting)}
      news={newsCard}
      join={
        showJoin ? (
          <div className="sl-join">
            {joinBtn('join-ph')}
            {opened}
          </div>
        ) : null
      }
      tools={
        showJoin ? (
          <div className="sl-tools">
            {opened}
            {joinBtn('join')}
          </div>
        ) : null
      }
    />
  );

  // ---------- Empty ----------
  if (phase === 'empty' || !cycle) {
    return (
      <div className="rf sl" ref={rootRef}>
        {liveRegion}
        {head}
        <section className="sl-card">
          <div className="sl-none">
            <p>Selection fills in once applicants are interviewed and scored. {cycle ? 'No one has applied to this cycle yet.' : 'There is no open cycle yet.'}</p>
            <Link className="rf-lnk" href="/scholarships/cycle" data-k="go-cycle">
              {cycle ? `Open the ${cycle.term} cycle` : 'Open the cycle'}
              <Icon name="chev" />
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // ---------- Before the meeting ----------
  const pre = () => {
    const scored = view.rows.length;
    const due = dueWords(view.today, cycle.scoresDue);
    return (
      <div className="sl-pre">
        <div className="sl-pre-a">
          <section className="sl-sec" aria-labelledby="sl-sch">
            <h2 id="sl-sch">
              <span>Scores</span> <span className="sl-hnote">the ranking fills in as each interview is scored</span>
            </h2>
            <div className="sl-pcard sl-in">
              <div className="sl-bar" role="img" aria-label={`${scored} of ${cycle.total} scored`}>
                {barSegments(scored, cycle.total).map((on, i) => (
                  <span key={i} className={on ? 'sl-on' : undefined} />
                ))}
              </div>
              <p className="sl-barlab">
                <span>
                  <b>
                    {scored} of {cycle.total} scored
                  </b>
                </span>
                {due ? <span>{due}</span> : null}
              </p>
              <p className="sl-go">
                <Link className="rf-lnk" href="/scholarships/scoring" data-k="go-scoring">
                  <span>Open Scoring</span>
                  <Icon name="chev" />
                </Link>
              </p>
            </div>
          </section>
          <section className="sl-sec" aria-labelledby="sl-tlh">
            <h2 id="sl-tlh">
              <span>On the way to the decision</span>
            </h2>
            <div className="sl-pcard sl-in">
              <ol className="sl-tl">
                {timeline(view.today, cycle, meeting).map((t) => (
                  <li key={t.title} className={[t.now ? 'sl-now' : '', t.key ? 'sl-key' : ''].join(' ').trim() || undefined}>
                    <b>{t.title}</b>
                    <span className="sl-d">
                      {t.when.map((w, i) => (w.trim() ? <span key={i}>{w}</span> : w))}
                    </span>
                    {t.rel ? <span className="sl-rel">{t.rel}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
        <div className="sl-pre-b">
          <section className="sl-sec" aria-labelledby="sl-mth">
            <h2 id="sl-mth">
              <span>What the meeting will need</span>
            </h2>
            <div className="sl-pcard sl-in">
              <ol className="sl-vsteps">
                <li>
                  <span className="sl-vdot">1</span>
                  <span>
                    <b>The ranking by combined score</b>
                    <span className="sl-vn">Input for the discussion. The board decides; the top score doesn&apos;t win on its own.</span>
                  </span>
                </li>
                <li>
                  <span className="sl-vdot">2</span>
                  <span>
                    <b>
                      Record the {cycle.mainName} award, <span className="sl-nowrap">{money(cycle.mainCents)}</span>
                    </b>
                    <span className="sl-vn">One main award this semester</span>
                  </span>
                </li>
                <li>
                  <span className="sl-vdot">3</span>
                  <span>
                    <b>
                      Extra awards <span className="sl-opt">if the board wants them</span>
                    </b>
                    <span className="sl-vn">Any number, each with its own name and amount</span>
                  </span>
                </li>
                <li>
                  <span className="sl-vdot">4</span>
                  <span>
                    <b>{CALL_STEP}</b>
                  </span>
                </li>
                <li>
                  <span className="sl-vdot">5</span>
                  <span>
                    <b>Release decisions to all {cycle.total}</b>
                    <span className="sl-vn">Award and decline emails go out, and each student sees the result in the Portal</span>
                  </span>
                </li>
              </ol>
            </div>
          </section>
        </div>
      </div>
    );
  };

  // ---------- The ranking ----------

  // Interviewer ticks and the combined dot on a 1 to 5 track.
  const marks = (r: SlRow) => (
    <span className="sl-mt" role="img" aria-label={`${r.pair[0].first} ${r.parts[0].toFixed(1)}, ${r.pair[1].first} ${r.parts[1].toFixed(1)}, combined ${r.combined.toFixed(1)}`}>
      {[2, 3, 4].map((v) => (
        <span key={v} className="sl-g" style={{ left: trackPos(v) }} />
      ))}
      <span className="sl-t" style={{ left: trackPos(r.parts[0]) }} />
      <span className="sl-t" style={{ left: trackPos(r.parts[1]) }} />
      <span className="sl-dot" style={{ left: trackPos(r.combined) }} />
    </span>
  );

  // Five squares for one pick ("4 of 5"); a question without a pick shows none filled and a dash.
  const sq = (v: number | null) => (
    <span className="sl-sq" aria-label={v == null ? 'No pick' : `${v} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={v != null && i <= v ? 'sl-on' : undefined} />
      ))}
      <b aria-hidden="true">{v ?? '–'}</b>
    </span>
  );

  // The quiet action at the foot of an opened row.
  const chooseAction = (r: SlRow): ReactNode => {
    const aw = awardOf(r.applicationId);
    if (aw) {
      return (
        <span className="sl-has">
          <span className="sl-tick" aria-hidden="true">
            <Icon name="check" />
          </span>
          {aw.awardName} recorded
        </span>
      );
    }
    if (releasedAt || !caps.record) return null;
    if (!main) {
      return (
        <button type="button" className="rf-lnk" data-k={`choose-${r.code}`} onClick={() => choose(r)}>
          Choose for the {cycle.mainName} award
        </button>
      );
    }
    return (
      <button type="button" className="rf-lnk" data-k={`extra-${r.code}`} onClick={() => openExtra(r.applicationId)}>
        <Icon name="plus" />
        Give an extra award
      </button>
    );
  };

  // A ranked row: the button that opens it, and what it opens (scores by question, the notes, the action).
  const rowEl = (r: SlRow, rank: number) => {
    const aw = awardOf(r.applicationId);
    const isOpen = !!open[r.code];
    return (
      <div key={r.code} className={`sl-rk${aw ? ' sl-won' : ''}${flash === r.applicationId ? ' sl-flash' : ''}`}>
        <button
          type="button"
          className="sl-rh"
          aria-expanded={isOpen}
          aria-controls={`sl-rd-${r.code}`}
          data-k={`row-${r.code}`}
          onClick={() => setOpen((o) => ({ ...o, [r.code]: !o[r.code] }))}
        >
          <span className="sl-rn">{rank}</span>
          <span className="sl-rw">
            <span className="sl-nm">
              <span className="sl-n">{r.name}</span>
              {r.test ? <span className="sl-chip">Board test</span> : null}
              {aw ? <span className="sl-tag">{aw.awardName}</span> : null}
            </span>
            <span className="sl-cd">{r.code}</span>
          </span>
          {marks(r)}
          <span className="sl-rc">{r.combined.toFixed(1)}</span>
          <svg className="rf-i sl-rv" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <Fold open={isOpen} id={`sl-rd-${r.code}`}>
          <div className="sl-rd">
            <div>
              <h3>Scores by question</h3>
              {crit.length ? (
                <table className="sl-qs">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>{r.pair[0].first}</th>
                      <th>{r.pair[1].first}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crit.map((c, i) => (
                      <tr key={c.key}>
                        <td>
                          {c.short} <span className="sl-w sl-nowrap">· {c.weight}%</span>
                        </td>
                        <td>{sq(r.picks[0][i] ?? null)}</td>
                        <td>{sq(r.picks[1][i] ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p className="sl-ws">
                <b>{r.pair[0].name}</b> {r.parts[0].toFixed(1)} · <b>{r.pair[1].name}</b> {r.parts[1].toFixed(1)}
              </p>
            </div>
            <div>
              <h3>Interview notes</h3>
              {r.summary ? (
                <>
                  <p className="sl-sum">{r.summary}</p>
                  {r.quotes.map((q, i) => (
                    <figure key={i} className="sl-quote">
                      <figcaption>
                        {q.criterion ? <b>{q.criterion}</b> : null}
                        {q.criterion && q.at ? ' · ' : null}
                        {q.at}
                      </figcaption>
                      <blockquote>{q.text}</blockquote>
                    </figure>
                  ))}
                </>
              ) : (
                <p className="sl-sum sl-quiet">No summary written for this interview.</p>
              )}
            </div>
            <div className="sl-act">{chooseAction(r)}</div>
          </div>
        </Fold>
      </div>
    );
  };

  // An applicant without both scores published (no track, no scores: nothing about an unpublished score is drawn).
  const unscoredEl = (u: SlUnscored) => {
    const aw = awardOf(u.applicationId);
    return (
      <div key={u.code} className={`sl-rk${aw ? ' sl-won' : ''}`}>
        <div className="sl-rh">
          <span className="sl-rn" />
          <span className="sl-rw">
            <span className="sl-nm">
              <span className="sl-n">{u.name}</span>
              {u.test ? <span className="sl-chip">Board test</span> : null}
              {aw ? <span className="sl-tag">{aw.awardName}</span> : null}
            </span>
            <span className="sl-cd">{u.code}</span>
          </span>
          <span className="sl-mt sl-empty" aria-hidden="true" />
          <span className="sl-rc sl-na">{u.why}</span>
          <span />
        </div>
      </div>
    );
  };

  const ranking = () => {
    const top = view.rows.slice(0, SHOW);
    const rest = view.rows.slice(SHOW);
    const hidden = rest.length + view.unscored.length;
    return (
      <section className="sl-sec" aria-labelledby="sl-rkh">
        <div className="sl-rkh">
          <div>
            <h2 id="sl-rkh">Ranking by combined score</h2>
            <p>
              {view.rows.length} of {cycle.total} scored
            </p>
          </div>
          <span className="sl-legend" aria-hidden="true">
            <span>
              <i className="sl-lt" />
              Each interviewer
            </span>
            <span>
              <i className="sl-ld" />
              Combined
            </span>
          </span>
        </div>
        <div className="sl-pcard">
          <div className="sl-cols" aria-hidden="true">
            <span>#</span>
            <span>Applicant</span>
            <span className="sl-sc">
              <span>1</span>
              <span>Interviewers</span>
              <span>5</span>
            </span>
            <span className="sl-r">Combined</span>
            <span />
          </div>
          {top.map((r, i) => rowEl(r, i + 1))}
          {hidden > 0 ? (
            <>
              <Fold open={more} id="sl-more-rows">
                {rest.map((r, i) => rowEl(r, SHOW + i + 1))}
                {view.unscored.map(unscoredEl)}
              </Fold>
              <button type="button" className="sl-more" aria-expanded={more} aria-controls="sl-more-rows" data-k="more" onClick={() => setMore((m) => !m)}>
                {more ? 'Show fewer' : `${hidden} more applicants`}
                <Icon name="down" />
              </button>
            </>
          ) : null}
        </div>
      </section>
    );
  };

  // ---------- Decisions ----------

  // The applicant list for an award (those who already have one are left out).
  const select = (id: string, value: string, label: string, onChange: (v: string) => void) => (
    <label className="sl-sel">
      <span className="rf-sr">{label}</span>
      <select id={`sl-${id}`} data-k={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose the applicant</option>
        {cands.map((c) => (
          <option key={c.applicationId} value={c.applicationId}>
            {c.name}
            {c.test ? ' (Board test)' : ''} · {c.combined != null ? c.combined.toFixed(1) : 'not scored'}
          </option>
        ))}
      </select>
      <Icon name="down" />
    </label>
  );

  // An "Undo" link (or its in-flight state) for an award that can still be undone.
  const undoLink = (a: SlAward, k: string) =>
    canUndo(a, releasedAt, caps.undo) ? (
      <>
        &nbsp;·&nbsp;
        <button type="button" className="rf-lnk" data-k={k} aria-disabled={undoing === a.id || undefined} onClick={() => void undo(a)}>
          {undoing === a.id ? 'Undoing' : 'Undo'}
        </button>
      </>
    ) : null;

  // An error line; `k` makes it a focus target (the record error keeps focus when its confirm closes).
  const errLine = (text: string | null | undefined, k?: string) =>
    text ? (
      <p className="sl-err" tabIndex={k ? -1 : undefined} data-k={k}>
        <Icon name="alert" />
        {text}
      </p>
    ) : null;

  const step1 = (): ReactNode => {
    const head = (
      <b>
        {cycle.mainName} award · <span className="sl-nowrap">{money(cycle.mainCents)}</span>
      </b>
    );
    if (main) {
      return (
        <div className="sl-ds sl-done">
          <div className="sl-dst">
            <span className="sl-vdot">
              <Icon name="check" />
            </span>
            <span>{head}</span>
          </div>
          <div className="sl-dsb">
            {twoMains ? errLine(`${twoMains} Recorded: ${mains.map((m) => `${m.name} (${m.code})`).join(' and ')}.`) : null}
            {mains.map((m, i) => (
              <div key={m.id}>
                <p className="sl-wonline">
                  <b>{m.name}</b>
                  <span className="sl-cdm">{m.code}</span>
                </p>
                <p className="sl-moment">
                  {m.decidedAt ? `Recorded ${clock(m.decidedAt)}` : 'Recorded'}
                  {undoLink(m, i === 0 ? 'undoMain' : `undoMain-${m.id}`)}
                </p>
                {undoErr?.id === m.id ? errLine(undoErr.text) : null}
              </div>
            ))}
            {recErr?.where === 'main' ? errLine(recErr.text, 'recErr') : null}
          </div>
        </div>
      );
    }
    if (releasedAt) return null;
    if (!caps.record) {
      return (
        <div className="sl-ds">
          <div className="sl-dst">
            <span className="sl-vdot">1</span>
            <span>
              {head}
              <span className="sl-vn">Not recorded yet. The board discusses, then decides.</span>
            </span>
          </div>
          {recErr?.where === 'main' ? <div className="sl-dsb">{errLine(recErr.text, 'recErr')}</div> : null}
        </div>
      );
    }
    const conf = confirm === 'main' && picked;
    const busyMain = recording === 'main';
    return (
      <div className="sl-ds sl-cur">
        <div className="sl-dst">
          <span className="sl-vdot">1</span>
          <span>
            {head}
            <span className="sl-vn">One award. The board discusses, then decides.</span>
          </span>
        </div>
        <div className="sl-dsb">
          {conf ? (
            <div className="sl-confirm" role="group" aria-labelledby="sl-cfmain" onKeyDown={escTo('main')}>
              <h3 id="sl-cfmain">
                Record <span className="sl-nowrap">{picked.name}</span> for the {cycle.mainName} award?
              </h3>
              <p id="sl-cfmain-t" tabIndex={-1} data-k="cfMainText">
                {mainConfirmBody({ name: picked.name, code: picked.code, mainName: cycle.mainName, cents: cycle.mainCents })}
              </p>
              {recErr?.where === 'main' ? errLine(recErr.text, 'recErr') : null}
              <div className="sl-cact">
                <SlGo
                  k="confirmMain"
                  className="rf-btn rf-btn-gold"
                  describedBy="sl-cfmain-t"
                  busy={busyMain}
                  onGo={() => void record('main', { applicationId: picked.applicationId, code: picked.code, name: picked.name, awardName: cycle.mainAwardName, cents: cycle.mainCents })}
                >
                  <Icon name="award" />
                  <span>{busyMain ? 'Recording' : `Record ${firstOf(picked.name)}`}</span>
                </SlGo>
                {busyMain ? null : (
                  <button type="button" className="rf-lnk" data-k="cancelMain" onClick={() => closeConfirm('main')}>
                    Back
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="sl-pick">
                {select('mainSel', pickMain, `Who gets the ${cycle.mainName} award`, (v) => {
                  setPickMain(v);
                  focusK.current = 'mainSel';
                })}
                <button type="button" className="rf-btn rf-btn-gold" data-k="recordMain" aria-disabled={!picked || undefined} onClick={askMain}>
                  <Icon name="award" />
                  Record the award
                </button>
              </div>
              {picked ? null : <p className="sl-hint">Choose from the list, or open a row in the ranking.</p>}
              {recErr?.where === 'main' ? errLine(recErr.text, 'recErr') : null}
            </>
          )}
        </div>
      </div>
    );
  };

  const extraStep = (): ReactNode => {
    if (!caps.record && extras.length === 0) return null;
    let body: ReactNode = null;
    const busyX = recording === 'extra';
    if (confirm === 'extra' && pendingX) {
      const p = pendingX;
      body = (
        <div className="sl-confirm" role="group" aria-labelledby="sl-cfx" onKeyDown={escTo('extra')}>
          <h3 id="sl-cfx">Record {p.awardName}?</h3>
          <p id="sl-cfx-t" tabIndex={-1} data-k="cfXText">
            {extraConfirmBody({ name: p.name, code: p.code, awardName: p.awardName, cents: p.cents })}
          </p>
          {recErr?.where === 'extra' ? errLine(recErr.text, 'recErr') : null}
          <div className="sl-cact">
            <SlGo k="confirmX" className="rf-btn" describedBy="sl-cfx-t" busy={busyX} onGo={() => void record('extra', p)}>
              {busyX ? 'Recording' : 'Record the award'}
            </SlGo>
            {busyX ? null : (
              <button type="button" className="rf-lnk" data-k="cancelX" onClick={() => closeConfirm('extra')}>
                Back
              </button>
            )}
          </div>
        </div>
      );
    } else if (adding && caps.record && !releasedAt) {
      body = (
        <div className="sl-xf">
          <label>
            Award name
            <input className="sl-inp" data-k="xName" maxLength={120} placeholder="e.g. Empowerment Award" value={x.name} onChange={(e) => setX((v) => ({ ...v, name: e.target.value }))} />
          </label>
          <label>
            Amount
            <span className="sl-dol">
              <i>$</i>
              <input className="sl-inp" data-k="xAmt" inputMode="numeric" placeholder="500" aria-label="Amount in dollars" value={x.amt} onChange={(e) => setX((v) => ({ ...v, amt: e.target.value }))} />
            </span>
          </label>
          <div className="sl-full">{select('xWho', x.who, 'Who gets the extra award', (v) => setX((o) => ({ ...o, who: v })))}</div>
          {xErr ? <p className="sl-errl">{xErr}</p> : null}
          {recErr?.where === 'extra' ? <div className="sl-full">{errLine(recErr.text, 'recErr')}</div> : null}
          <div className="sl-cact sl-full">
            <button type="button" className="rf-btn" data-k="recordX" onClick={askExtra}>
              Record the award
            </button>
            <button
              type="button"
              className="rf-lnk"
              data-k="closeX"
              onClick={() => {
                setAdding(false);
                setXErr('');
                setX({ name: '', amt: '', who: '' });
                focusK.current = 'addX';
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    } else if (caps.record && !releasedAt) {
      body = (
        <p className="sl-addx">
          <button type="button" className="rf-lnk" data-k="addX" onClick={() => openExtra()}>
            <Icon name="plus" />
            Add an extra award
          </button>
        </p>
      );
    }
    return (
      <div className="sl-ds">
        <div className="sl-dst">
          <span className="sl-vdot">
            <Icon name="plus" />
          </span>
          <span>
            <b>
              Extra awards <span className="sl-vn sl-inl">· optional</span>
            </b>
            {extras.length ? null : <span className="sl-vn">As many as the board decides, each with its own name and amount</span>}
          </span>
        </div>
        <div className="sl-dsb">
          {extras.length ? (
            <ul className="sl-xa">
              {extras.map((a) => (
                <li key={a.id}>
                  <span>
                    <b>{a.awardName}</b> · <span className="sl-nowrap">{money(a.amountCents)}</span> · <span className="sl-nowrap">{a.name}</span>
                  </span>
                  {undoLink(a, `undoX-${a.id}`)}
                  {undoErr?.id === a.id ? errLine(undoErr.text) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {body}
          {recErr?.where === 'extra' && !(confirm === 'extra' && pendingX) && !adding ? errLine(recErr.text, 'recErr') : null}
        </div>
      </div>
    );
  };

  const step2 = (
    <div className="sl-ds">
      <div className="sl-dst">
        <span className="sl-vdot">2</span>
        <span>
          <b>{CALL_STEP}</b>
          <span className="sl-vn">{CALL_NOTE}</span>
        </span>
      </div>
    </div>
  );

  const step3 = (): ReactNode => {
    if (releasedAt) {
      const [sub, ...warn] = releasedLines({ emailLine: emails ? emailLine(emails) : null, emails, rel });
      return (
        <div className="sl-ds sl-done">
          <div className="sl-dst">
            <span className="sl-vdot">
              <Icon name="check" />
            </span>
            <span>
              <b>Released {dayTime(releasedAt)}</b>
              <span className="sl-vn" tabIndex={rel === 'was-released' ? -1 : undefined} data-k={rel === 'was-released' ? 'release-note' : undefined}>
                {sub}
              </span>
            </span>
          </div>
          {warn.length ? <div className="sl-dsb">{warn.map((w) => errLine(w))}</div> : null}
          <div className="sl-dsb">
            <Link className="rf-lnk" href="/scholarships/awardees" data-k="go-awardees">
              Follow up on Awardees
              <Icon name="chev" />
            </Link>
          </div>
        </div>
      );
    }
    const t = (vn: string, cur: boolean, inner: ReactNode = null) => (
      <div className={`sl-ds${cur ? ' sl-cur' : ''}`}>
        <div className="sl-dst">
          <span className="sl-vdot">3</span>
          <span>
            <b>Release decisions</b>
            <span className="sl-vn">{vn}</span>
          </span>
        </div>
        {inner ? <div className="sl-dsb">{inner}</div> : null}
      </div>
    );
    if (rel === 'checking' || rel === 'not-released' || rel === 'check-failed') {
      const note =
        rel === 'checking'
          ? 'Checking what happened. Decisions may already be released and emails may have been sent.'
          : rel === 'not-released'
            ? notReleasedLine(relMsg)
            : "Couldn't check the release. Decisions may already be released and emails may have been sent. Reload the page to check.";
      return t(
        'Students hear nothing until you release',
        true,
        <p className="sl-err" tabIndex={-1} data-k="release-note">
          <Icon name="alert" />
          {note}
        </p>,
      );
    }
    if (!main) return t(`Opens once the ${cycle.mainName} award is recorded`, false);
    if (twoMains) return t('Unavailable while two main awards are recorded. Remove one first.', false);
    if (!showRelease) return t('A board member with admin rights releases the decisions', false);
    const won = awards.length;
    const total = cycle.total;
    const n = Math.min(total, BAR_MAX);
    const running = rel === 'running';
    return t(
      'Students hear nothing until you release',
      true,
      rel === 'confirm' || running ? (
        <div className="sl-confirm" role="group" aria-labelledby="sl-cfr" onKeyDown={escTo('release')}>
          <h3 id="sl-cfr">{releaseTitle(total)}</h3>
          <div id="sl-cfr-t" tabIndex={-1} data-k="cfRelText">
            <div className="sl-cnt" aria-hidden="true">
              {Array.from({ length: n }, (_, i) => {
                const at = Math.floor((i * total) / n);
                return <span key={i} className={at === 0 ? 'sl-w' : at < won ? 'sl-x' : undefined} />;
              })}
            </div>
            <p className="sl-cl">
              {releaseParts({ total, mainName: cycle.mainName, extras: extras.length, recorded: won }).map((p) => (
                <span key={p.words}>
                  <b>{p.n}</b>
                  {p.words}
                </span>
              ))}
            </p>
            <p>Each student sees the result in the Portal and gets an email.</p>
            <p className="sl-warn">This can&apos;t be undone.</p>
          </div>
          {countsWait ? <p className="sl-hint">Getting the latest counts</p> : null}
          <div className="sl-cact">
            <SlGo k="confirmRelease" className="rf-btn rf-btn-gold" describedBy="sl-cfr-t" busy={running} wait={countsWait} onGo={() => void release()}>
              <Icon name="send" />
              <span>{running ? 'Releasing' : `Release and email ${total}`}</span>
            </SlGo>
            {running ? null : (
              <button type="button" className="rf-lnk" data-k="cancelRelease" onClick={() => closeConfirm('release')}>
                Back
              </button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" className="rf-btn rf-btn-gold" data-k="release" onClick={askRelease}>
          <Icon name="send" />
          Release decisions
        </button>
      ),
    );
  };

  const decisions = () => {
    const done = (main ? 1 : 0) + (releasedAt ? 1 : 0);
    return (
      <section className="sl-sec sl-dec" aria-labelledby="sl-dech">
        <h2 id="sl-dech">
          <span>Decisions</span>{' '}
          <span className="sl-hnote">
            <span className="sl-steps2" aria-hidden="true">
              <span className={done > 0 ? 'sl-on' : undefined} />
              <span className={done > 1 ? 'sl-on' : undefined} />
            </span>
            {done} of 2 done
          </span>
        </h2>
        <div className="sl-pcard">
          {step1()}
          {extraStep()}
          {step2}
          {step3()}
        </div>
      </section>
    );
  };

  return (
    <div className="rf sl" ref={rootRef} onFocus={onRootFocus} onBlur={onRootBlur} data-phase={phase} data-today={easternDay(view.now) === view.today ? undefined : view.today}>
      {liveRegion}
      {head}
      {phase === 'pre' ? (
        pre()
      ) : (
        <div className="sl-work">
          {ranking()}
          {decisions()}
        </div>
      )}
    </div>
  );
}

/** The short day of an instant (kept for the skeleton's callers). */
export const slShortDay = (instant: string) => shortDate(easternDay(instant));

/**
 * A confirm's go button (lib/selection-arm.ts, the house pattern). Unarmed (aria-disabled) for SL_ARM_MS after its confirm
 * appears, so a held or double Enter, a double tap or a second click on the control that opened the confirm can't fire it.
 * From the keyboard it acts on the key-up of an Enter or Space whose key-down began on it (repeats ignored); a click acts
 * once armed. `busy` (the write is running) and `wait` (fresh data still loading) keep it from acting at all.
 */
export function SlGo({
  k,
  onGo,
  busy = false,
  wait = false,
  describedBy,
  className,
  children,
}: {
  k: string;
  onGo: () => void;
  busy?: boolean;
  wait?: boolean;
  describedBy?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [arm] = useState(createSlArm);
  const [ready, setReady] = useState(false);
  // When a key-up last acted (the click some browsers add right after is ignored).
  const keyActed = useRef(0);
  // Arms the button SL_ARM_MS after it appears.
  useEffect(() => {
    arm.open(slNowMs());
    const t = window.setTimeout(() => setReady(true), SL_ARM_MS);
    return () => window.clearTimeout(t);
  }, [arm]);
  const off = !ready || busy || wait;
  return (
    <button
      type="button"
      className={className}
      data-k={k}
      aria-describedby={describedBy}
      aria-disabled={off || undefined}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (e.detail === 0 && slNowMs() - keyActed.current < 500) return;
        if (busy || wait) return;
        if (arm.click(slNowMs())) onGo();
      }}
      onKeyDown={(e) => {
        if (arm.keyDown(k, e.key, e.repeat)) e.preventDefault();
      }}
      onKeyUp={(e) => {
        const r = arm.keyUp(k, e.key, slNowMs());
        if (!r.handled) return;
        e.preventDefault();
        if (!r.act || busy || wait) return;
        keyActed.current = slNowMs();
        onGo();
      }}
    >
      {children}
    </button>
  );
}
