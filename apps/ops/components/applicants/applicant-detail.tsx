'use client';

// The refreshed full application (demo p-applicants, its `#/APP-...` view): "Applicants" back, the name with the code
// (and "Board test"), the nudge news card (mock mode only), the gold "Score <first name>" when it is the viewer's to score
// (a link to the Scoring page), where the application is (five steps), then the Interview and Short answers beside the
// Applicant facts, Documents and Answers (one column on phones, in the demo's order). Every staff member sees the name,
// contact details and every answer (D2). The PDFs open through /file/<kind> (a fresh 60-second signed link) in a new tab.
import '@/components/refresh/refresh.css';
import './applicants.css';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SHORT_ANSWER_QUESTIONS } from '@btx/data';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { firstName, nudgeFor, stageOf, WORD_LIMIT, words } from '@/lib/applicants-map';
import type { ApFact, ApplicantDetailView } from '@/lib/applicants-view';
import { apNav, appHref, InterviewBlock, StepsList, Trk, useNudges } from './applicants-parts';

type Props = { view: ApplicantDetailView };

// Labels above values, in as many columns as fit; long values (and Terpmail) take the whole row.
function Facts({ rows, nowrap = [] }: { rows: ApFact[]; nowrap?: string[] }) {
  return (
    <dl className="ap-facts">
      {rows.map((f) => {
        const wide = f.label === 'Terpmail' || (f.value !== null && f.value.length > 18);
        const nw = nowrap.includes(f.label);
        return (
          <div key={f.label} className={wide ? 'ap-wide' : undefined}>
            <dt>{f.label}</dt>
            <dd className={[nw ? 'ap-nw' : '', f.value ? '' : 'ap-na'].filter(Boolean).join(' ') || undefined}>{f.value ?? 'Not answered'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function ApplicantDetail({ view }: Props) {
  const router = useRouter();
  const { applicant: a, cycle, now, caps } = view;
  const st = stageOf(a, now, view.me);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [announce, setAnnounce] = useState('');
  const timers = useRef<number[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // The one polite announcement (cleared first, so the same words are read again).
  const say = (m: string) => {
    setAnnounce('');
    timers.current.push(window.setTimeout(() => setAnnounce(m), 30));
  };
  const nudges = useNudges(say);
  const n = caps.nudge ? nudgeFor(a, st, cycle) : null;
  const state = nudges.of(a.code);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  // Opening the application puts focus on its name (the demo's route change).
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  // "Applicants": back in history when the list opened this page (its place and filters kept), else a plain link.
  const back = (e: MouseEvent) => {
    apNav.returnTo = a.code;
    if (apNav.fromList && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      apNav.fromList = false;
      router.back();
    }
  };

  // The news card: opens the nudge draft, brings the Interview card into view and flashes it.
  const goNudge = () => {
    if (state !== 'draft') nudges.toggle(a.code, '[data-ap-send="dt"]');
    const h = document.getElementById('ap-h-iv');
    const card = h?.closest('section');
    if (!h || !card) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    h.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    card.classList.remove('ap-flash-card');
    void card.offsetWidth;
    card.classList.add('ap-flash-card');
  };

  const fileHref = (kind: string) => `${appHref(a.code)}/file/${kind}`;

  return (
    <div className="rf ap ap-detail">
      <Link className="rf-lnk ap-back" href="/scholarships/applicants" onClick={back}>
        <Icon name="back" />
        Applicants
      </Link>
      <header className="ap-dhead">
        <div>
          <div className="rf-ptitle">
            <h1 tabIndex={-1} ref={titleRef} className={a.name.length > 22 ? 'ap-long' : undefined}>
              <span className="ap-n">{a.name}</span>
              {a.test ? <span className="ap-tag">Board test</span> : null}
            </h1>
            <span className="rf-pdate">{a.code}</span>
          </div>
          {n && state !== 'sent' ? <NewsCard icon="wait" kicker={n.kicker} title={n.news} go={n.go} onClick={goNudge} /> : null}
        </div>
        {st.kind === 'needs' ? (
          <div className="ap-dgo">
            <Link className="rf-btn rf-btn-gold" href="/scholarships/scoring">
              Score {firstName(a.name)}
            </Link>
          </div>
        ) : null}
      </header>

      <section className="ap-card ap-stagecard" aria-label="Where this application is">
        <div className="ap-card-in">
          <StepsList a={a} st={st} cycle={cycle} now={now} kind="h" />
          <StepsList a={a} st={st} cycle={cycle} now={now} kind="v" />
        </div>
      </section>

      <div className="ap-dgrid">
        <div className="ap-dcol">
          <section className="ap-card ap-o1" aria-labelledby="ap-h-iv">
            <h2 id="ap-h-iv">Interview</h2>
            <div className="ap-card-in">
              <InterviewBlock
                a={a}
                st={st}
                cycle={cycle}
                now={now}
                canNudge={caps.nudge}
                nudge={state}
                where="dt"
                onNudge={() => nudges.toggle(a.code, '[data-ap-send="dt"]')}
                onCancel={() => nudges.cancel(a.code, '[data-ap-nudge="dt"]')}
                onSend={() => n && nudges.send(a.code, n.said)}
              />
            </div>
          </section>
          <section className="ap-card ap-o5" aria-labelledby="ap-h-sa" id="ap-short">
            <h2 id="ap-h-sa">
              Short answers <span className="ap-h-note">{WORD_LIMIT} words each at most</span>
            </h2>
            <div className="ap-card-in">
              {SHORT_ANSWER_QUESTIONS.map((q, i) => {
                const ans = view.shortAnswers[i] ?? '';
                const w = words(ans);
                return (
                  <div key={q} className="ap-qa">
                    <p className="ap-q">{q}</p>
                    <p className={`ap-a${ans.trim() ? '' : ' ap-empty'}`}>{ans.trim() ? ans : 'Not answered'}</p>
                    <p className="ap-wc">
                      <Trk v={w} max={WORD_LIMIT} />
                      <span>
                        {w} of {WORD_LIMIT} words
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <div className="ap-dcol">
          <section className="ap-card ap-o2" aria-labelledby="ap-h-ap">
            <h2 id="ap-h-ap">Applicant</h2>
            <div className="ap-card-in">
              <Facts rows={view.identity} nowrap={['Name', 'Terpmail', 'Phone']} />
            </div>
          </section>
          <section className="ap-card ap-o3" aria-labelledby="ap-h-doc">
            <h2 id="ap-h-doc">Documents</h2>
            <div className="ap-card-in">
              <ul className="ap-files">
                {view.files.map((f) => (
                  <li key={f.kind}>
                    <span className="ap-kt" aria-hidden="true">
                      <Icon name="file" />
                    </span>
                    <span>
                      <b>{f.label}</b>
                      <i>{f.filename ?? 'Not uploaded'}</i>
                    </span>
                    {f.filename ? (
                      <a
                        className="rf-btn"
                        href={fileHref(f.kind)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          setOpened((o) => ({ ...o, [f.kind]: true }));
                          say(`Opening ${f.label.toLowerCase()} in a new tab`);
                        }}
                      >
                        Open PDF<span className="rf-sr"> ({f.label})</span>
                      </a>
                    ) : null}
                    {opened[f.kind] ? <span className="ap-opened">Opening in a new tab</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="ap-card ap-o4" aria-labelledby="ap-h-an">
            <h2 id="ap-h-an">Answers</h2>
            <div className="ap-card-in">
              <Facts rows={view.answers} />
            </div>
          </section>
        </div>
      </div>
      <div className="rf-sr" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
