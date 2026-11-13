'use client';

// The refreshed Applicants list (demo p-applicants, Ops Hub refresh 2026-11-12): the title with the cycle, search and
// Export (admins), the Scoring strip (one segment per application, gold = both scores in, and the gold "Score <name>" for
// the viewer's next one), the tabs with counts, the Interviewer and Sort pickers, the list (grouped by what it needs, or
// flat), and on wide laptops (1240px and up) the side preview of the selected applicant. Phones get the search behind an
// icon. Every row is a link to the full application. Read-only: "Score" goes to the Scoring page; the nudge and reminder
// drafts exist in mock mode only (nothing is ever sent).
import '@/components/refresh/refresh.css';
import './applicants.css';
import { useEffect, useMemo, useRef, useState, useTransition, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fold } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { StateLine } from '@/components/refresh/state-line';
import { Tabs } from '@/components/refresh/tabs';
import {
  barParts,
  csvFor,
  emptyLine,
  dueLine,
  firstName,
  fullWhen,
  GROUPS,
  inGroup,
  matches,
  mineToScore,
  nudgeFor,
  pairWords,
  relDay,
  SORTS,
  sortList,
  stageOf,
  TABS,
  whenText,
  type ApSort,
  type ApStage,
  type ApTab,
} from '@/lib/applicants-map';
import { clock, fullDate, easternDay } from '@/lib/refresh-time';
import type { ApApplicant, ApplicantsView } from '@/lib/applicants-view';
import { apNav, appHref, Av, Faces, InterviewBlock, ScoreMark, StepsList, StepsMark, useNudges } from './applicants-parts';
import { ApSkelRows } from './applicants-skeleton';

type Props = { view: ApplicantsView; live: boolean; loading?: boolean };
type Item = { a: ApApplicant; st: ApStage };

// One row: initials | when, name, code and the pair | the stage drawn | the score drawn. The whole row is the link.
function Row({ it, grouped, selected, flash, cycleTotal, now, onClick }: { it: Item; grouped: boolean; selected: boolean; flash: boolean; cycleTotal: number; now: string; onClick: (e: MouseEvent, code: string) => void }) {
  const { a, st } = it;
  const quiet = grouped && (st.kind === 'needs' || st.kind === 'scored');
  const mine = st.kind === 'needs' || (a.pair.some((p) => p.me) && st.kind !== 'scored');
  return (
    <Link className={`ap-ar${selected ? ' ap-sel-row' : ''}${flash ? ' ap-flash' : ''}`} href={appHref(a.code)} data-code={a.code} aria-current={selected ? 'true' : undefined} onClick={(e) => onClick(e, a.code)}>
      <Av name={a.name} mine={mine} />
      <span className="ap-who">
        <span className="ap-eb ap-m-when" title={a.interviewAt ? fullWhen(a.interviewAt) : undefined}>
          {whenText(now, a.interviewAt)}
        </span>
        <span className="ap-nm">
          <span className="ap-n">{a.name}</span>
          {a.test ? <span className="ap-tag">Board test</span> : null}
        </span>
        <span className="ap-meta">
          <span>{a.code}</span>
          {a.pair.length ? (
            <span className="ap-pair">
              <Faces pair={a.pair} />
              <span className="ap-pn">{pairWords(a.pair)}</span>
            </span>
          ) : null}
        </span>
      </span>
      <span className="ap-when" title={a.interviewAt ? fullDate(easternDay(a.interviewAt)) : undefined}>
        {a.interviewAt ? relDay(now, a.interviewAt) : 'Not booked'}
        {a.interviewAt ? <span className="ap-w2">{clock(a.interviewAt)}</span> : null}
      </span>
      <span className="ap-stage">
        <StepsMark now={st.now} />
        <span className={`ap-st-l${st.you ? ' ap-you' : ''}${quiet ? ' rf-sr' : ''}`}>
          {st.kind === 'waiting' && st.open.length === 1 ? (
            <>
              Waiting on <span className="rf-nowrap">{st.open[0].name}</span>
            </>
          ) : (
            st.label
          )}
        </span>
      </span>
      <span className="ap-score">
        <ScoreMark a={a} st={st} total={cycleTotal} />
      </span>
    </Link>
  );
}

export function ApplicantsBoard({ view, live, loading = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [retrying, startRetry] = useTransition();
  const { now, cycle, caps } = view;
  const items: Item[] = useMemo(() => view.applicants.map((a) => ({ a, st: stageOf(a, now, view.me) })), [view, now]);
  const mine = useMemo(() => mineToScore(view.applicants, now, view.me), [view, now]);

  const [tab, setTab] = useState<ApTab>('all');
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [sort, setSort] = useState<ApSort>('attention');
  // Back from a full application (client navigation only): that applicant is selected, focused and flashed.
  const [back] = useState<string | null>(() => (typeof window === 'undefined' ? null : apNav.returnTo));
  const [pick, setPick] = useState<string | null>(back ?? mine[0]?.code ?? items[0]?.a.code ?? null);
  const [flash, setFlash] = useState<string | null>(back);
  const [qOpen, setQOpen] = useState(false);
  const [exported, setExported] = useState('');
  const [announce, setAnnounce] = useState('');
  const [wide, setWide] = useState(false);
  const [phone, setPhone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  // The one polite announcement (cleared first, so the same words are read again).
  const say = (m: string) => {
    setAnnounce('');
    timers.current.push(window.setTimeout(() => setAnnounce(m), 30));
  };
  const nudges = useNudges(say);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Wide laptops get the side preview; phones the short picker label. Both follow the window.
  useEffect(() => {
    const w = window.matchMedia('(min-width: 1240px)');
    const p = window.matchMedia('(max-width: 759px)');
    const sync = () => {
      setWide(w.matches);
      setPhone(p.matches);
    };
    sync();
    w.addEventListener('change', sync);
    p.addEventListener('change', sync);
    return () => {
      w.removeEventListener('change', sync);
      p.removeEventListener('change', sync);
    };
  }, []);

  // Back from a full application: focus its row; the flash class goes once its animation has run.
  useEffect(() => {
    if (!back) return;
    apNav.returnTo = null;
    rootRef.current?.querySelector<HTMLElement>(`.ap-ar[data-code="${CSS.escape(back)}"]`)?.focus({ preventScroll: true });
    const t = window.setTimeout(() => setFlash(null), 1700);
    return () => window.clearTimeout(t);
  }, [back]);

  // Laptop: "/" jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (t?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || window.matchMedia('(max-width: 759px)').matches) return;
      e.preventDefault();
      document.getElementById('ap-q')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const failed = view.loadFailed;
  const filter = { tab, who, q };
  const count = (t: ApTab) => items.filter((it) => matches(it.a, it.st.kind, { ...filter, tab: t })).length;
  const shown = sortList(
    items.filter((it) => matches(it.a, it.st.kind, filter)),
    sort,
  );
  const pickInList = shown.some((it) => it.a.code === pick) ? pick : (shown[0]?.a.code ?? null);
  const picked = items.find((it) => it.a.code === pickInList) ?? null;
  const scored = items.filter((it) => it.st.kind === 'scored').length;
  const bar = barParts(items.length, scored);
  const due = dueLine(cycle, now);

  // A row on a wide laptop selects it into the preview (Cmd/Ctrl-click still opens it); elsewhere it opens the application.
  const onRow = (e: MouseEvent, code: string) => {
    if (wide && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setPick(code);
      return;
    }
    apNav.fromList = true;
  };

  // "Try again": mock mode goes back to the sample (drops ?demo), live mode reloads the server data.
  const retry = () =>
    startRetry(() => {
      if (live) router.refresh();
      else router.replace(pathname);
    });

  const clearSearch = () => setQ('');
  const showAll = () => {
    setQ('');
    setWho('');
    setTab('all');
  };

  // Export: the rows on screen as a CSV (admins), with the moment after.
  const doExport = () => {
    try {
      const url = URL.createObjectURL(new Blob([csvFor(shown)], { type: 'text/csv' }));
      const l = document.createElement('a');
      l.href = url;
      l.download = 'applicants.csv';
      l.click();
      timers.current.push(window.setTimeout(() => URL.revokeObjectURL(url), 1000));
    } catch {
      // A browser that refuses downloads still gets the line below.
    }
    setExported(`Exported ${shown.length} · applicants.csv`);
    say(`Exported ${shown.length} applicants`);
    timers.current.push(window.setTimeout(() => setExported(''), 5000));
  };

  const toggleSearch = () => {
    const open = !qOpen;
    setQOpen(open);
    if (open) timers.current.push(window.setTimeout(() => document.getElementById('ap-qph')?.focus(), 30));
    else if (q) setQ('');
  };

  // Typing in search: the list follows at once; the count is announced once typing pauses.
  const searchTimer = useRef<number | null>(null);
  const onSearch = (v: string) => {
    setQ(v);
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    const n = items.filter((it) => matches(it.a, it.st.kind, { ...filter, q: v })).length;
    searchTimer.current = window.setTimeout(() => say(`${n || 'No'} applicants shown`), 700);
    timers.current.push(searchTimer.current);
  };

  const onWho = (v: string) => {
    setWho(v);
    const n = items.filter((it) => matches(it.a, it.st.kind, { ...filter, who: v })).length;
    say(`${n || 'No'} applicants shown`);
  };

  // The list body: loading rows, the error line, the empty and no-match lines, the groups, or the flat list.
  let body: ReactNode;
  if (loading) body = <ApSkelRows />;
  else if (failed) {
    body = (
      <StateLine kind="error" onRetry={retry} retrying={retrying} skeleton={<ApSkelRows />}>
        Couldn&apos;t load applicants.
      </StateLine>
    );
  } else if (items.length === 0) body = <p className="rf-none">{emptyLine(cycle, now)}</p>;
  else if (shown.length === 0) {
    body = q.trim() ? (
      <p className="rf-none">
        No one matches &ldquo;{q.trim()}&rdquo;.
        <button type="button" className="rf-lnk" onClick={clearSearch}>
          Clear search
        </button>
      </p>
    ) : (
      <p className="rf-none">
        No applicants here with these filters.
        <button type="button" className="rf-lnk" onClick={showAll}>
          Show all
        </button>
      </p>
    );
  } else if (sort === 'attention') {
    body = GROUPS.map((g) => {
      const its = inGroup(shown, g.id);
      if (!its.length) return null;
      return (
        <div key={g.id} className="ap-gwrap" role="group" aria-labelledby={`ap-g-${g.id}`}>
          <div className={`ap-grp${g.id === 'needs' ? ' ap-g-you' : ''}`} id={`ap-g-${g.id}`}>
            <span className="ap-gi" aria-hidden="true">
              <Icon name={g.icon} />
            </span>
            <span className="ap-gl">{g.label}</span> <b>{its.length}</b>
          </div>
          {its.map((it) => (
            <Row key={it.a.id} it={it} grouped selected={wide && pickInList === it.a.code} flash={flash === it.a.code} cycleTotal={cycle.criteriaTotal} now={now} onClick={onRow} />
          ))}
        </div>
      );
    });
  } else {
    body = shown.map((it) => <Row key={it.a.id} it={it} grouped={false} selected={wide && pickInList === it.a.code} flash={flash === it.a.code} cycleTotal={cycle.criteriaTotal} now={now} onClick={onRow} />);
  }

  const pv = picked;
  const pvNudge = pv ? nudgeFor(pv.a, pv.st, cycle) : null;

  return (
    <div className="rf ap" ref={rootRef} data-state={loading ? 'loading' : failed ? 'error' : undefined}>
      <header className="rf-head ap-head">
        <div>
          <div className="rf-ptitle">
            <h1 id="ap-h" tabIndex={-1}>
              Applicants
            </h1>
            {cycle.term ? <span className="rf-pdate">{cycle.term}</span> : null}
          </div>
        </div>
        <div className="ap-tools">
          <label className="rf-search ap-search">
            <Icon name="search" />
            <input type="search" id="ap-q" placeholder="Search name or code" aria-label="Search name or code" autoComplete="off" value={q} onChange={(e) => onSearch(e.target.value)} />
          </label>
          {caps.export ? (
            <>
              <button type="button" className="rf-btn ap-exp" onClick={doExport} disabled={loading || failed}>
                <Icon name="upload" />
                Export
              </button>
              <span className="ap-exported">
                {exported}
              </span>
            </>
          ) : null}
          <button type="button" className="ap-iconbtn ap-q-open" aria-label="Search name or code" aria-expanded={qOpen} aria-controls="ap-qrow" onClick={toggleSearch}>
            <Icon name="search" />
          </button>
        </div>
      </header>
      <Fold open={qOpen} id="ap-qrow" className="ap-qrow">
        <label className="rf-search ap-search">
          <Icon name="search" />
          <input type="search" id="ap-qph" placeholder="Search name or code" aria-label="Search name or code" autoComplete="off" value={q} onChange={(e) => onSearch(e.target.value)} />
        </label>
      </Fold>

      {items.length > 0 ? (
        <section className="ap-needs" aria-labelledby="ap-sh">
          <div className="ap-n-top">
            <h2 id="ap-sh">Scoring</h2>
            {due ? (
              <span className="ap-n-due" title={due.title}>
                {due.text}
              </span>
            ) : null}
          </div>
          <div className={`ap-bk${mine.length ? '' : ' ap-bk-one'}`}>
            <div className="ap-bar" role="img" aria-label={`${scored} of ${items.length} fully scored`} title={`${scored} of ${items.length} fully scored`}>
              {Array.from({ length: bar.segs }, (_, i) => (
                <span key={i} className={i < bar.on ? 'ap-on' : undefined} />
              ))}
            </div>
            {mine.length ? (
              <div className="ap-bk-act">
                <Link className="rf-btn rf-btn-gold" href="/scholarships/scoring">
                  <span>Score {firstName(mine[0].name)}</span>
                </Link>
              </div>
            ) : null}
            <p className="ap-bk-lab">
              <b>
                {scored} of {items.length} scored
              </b>
            </p>
          </div>
        </section>
      ) : null}

      <div className="ap-filters">
        <Tabs label="Show" idBase="ap" tabs={TABS.map((t) => ({ ...t, count: count(t.id) }))} value={tab} onChange={setTab} />
        <div className="ap-sels">
          <label className={`rf-sel${who ? ' rf-on' : ''}`}>
            <span>Interviewer</span>
            <select aria-label="Interviewer" value={who} onChange={(e) => onWho(e.target.value)}>
              <option value="">{phone ? 'All interviewers' : 'Everyone'}</option>
              {view.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.me ? 'You' : p.name}
                </option>
              ))}
            </select>
            <Icon name="down" />
          </label>
          <label className="rf-sel">
            <span>Sort</span>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as ApSort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <Icon name="down" />
          </label>
        </div>
      </div>

      <div className="ap-work">
        <section className="ap-alist" role="tabpanel" id={`ap-p-${tab}`} aria-labelledby={`ap-tab-${tab}`} aria-busy={loading || undefined}>
          <div className="ap-cols" aria-hidden="true">
            <span>Applicant</span>
            <span className="ap-c-when">Interview</span>
            <span>Stage</span>
            <span>Score</span>
          </div>
          {body}
          {loading ? <p className="rf-sr">Loading applicants</p> : null}
        </section>
        {TABS.filter((t) => t.id !== tab).map((t) => (
          <div key={t.id} role="tabpanel" id={`ap-p-${t.id}`} aria-labelledby={`ap-tab-${t.id}`} hidden />
        ))}
        {wide ? (
          <aside className="ap-pv" aria-label="Selected applicant">
            {loading || failed ? null : !pv ? (
              <p className="rf-none">Pick an applicant to see where they are.</p>
            ) : (
              <>
                <div className="ap-pv-h">
                  <Av name={pv.a.name} mine={pv.st.kind === 'needs'} big />
                  <h2>
                    <span className="ap-n">{pv.a.name}</span>
                    {pv.a.test ? <span className="ap-tag">Board test</span> : null}
                  </h2>
                  <p>
                    <span className="rf-nowrap">{pv.a.code}</span> · {cycle.awardName}
                  </p>
                </div>
                <div className="ap-pv-sec">
                  <StepsList a={pv.a} st={pv.st} cycle={cycle} now={now} kind="v" />
                </div>
                <div className="ap-pv-sec">
                  <h3>Interview</h3>
                  <InterviewBlock
                    a={pv.a}
                    st={pv.st}
                    cycle={cycle}
                    now={now}
                    canNudge={caps.nudge}
                    nudge={nudges.of(pv.a.code)}
                    where="pv"
                    onNudge={() => nudges.toggle(pv.a.code, '[data-ap-send="pv"]')}
                    onCancel={() => nudges.cancel(pv.a.code, '[data-ap-nudge="pv"]')}
                    onSend={() => pvNudge && nudges.send(pv.a.code, pvNudge.said)}
                  />
                </div>
                <div className="ap-pv-act">
                  <Link
                    className="rf-btn"
                    href={appHref(pv.a.code)}
                    onClick={() => {
                      apNav.fromList = true;
                    }}
                  >
                    Open application
                  </Link>
                </div>
              </>
            )}
          </aside>
        ) : null}
      </div>
      <div className="rf-sr" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
