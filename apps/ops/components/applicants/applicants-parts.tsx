'use client';

// Pieces the Applicants list, its side preview and the full application share (demo p-applicants): the initials circle,
// the interviewers' faces, the drawn marks (five slim steps, the average on a 1-5 track, the draft squares, the published
// pips), the five steps as a list (vertical in the preview and on the phone, horizontal on the laptop detail), and the
// interview block with its mock-only nudge draft. Also the small "came from the list" note the back link reads.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Fold, foldMs } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { interviewHref } from '@/lib/interview-href';
import { avgText, fullWhen, initialsOf, nudgeFor, orderPair, STEP_LABELS, stepAria, stepNotes, whenText, type ApStage } from '@/lib/applicants-map';
import { clock, easternDay, fullDate, shortDate } from '@/lib/refresh-time';
import type { ApApplicant, ApCycle, ApPerson } from '@/lib/applicants-view';

/** Where the person came from, so "Applicants" on the full application goes back (scroll kept) instead of reloading. */
export const apNav: { fromList: boolean; returnTo: string | null } = { fromList: false, returnTo: null };

/** The nudge draft's state on one application (mock mode). */
export type NudgeState = 'none' | 'draft' | 'sending' | 'closing' | 'sent';

/** The page's link for one application (the code is the only applicant fact in a URL). */
export const appHref = (code: string) => `/scholarships/applicants/${encodeURIComponent(code)}`;

// The initials circle (gold ring when it is the viewer's to act on).
export function Av({ name, mine = false, big = false }: { name: string; mine?: boolean; big?: boolean }) {
  return (
    <span className={`ap-av${mine ? ' ap-mine' : ''}${big ? ' ap-big' : ''}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

// The interviewers as small initial circles, the viewer first (gold).
export function Faces({ pair }: { pair: ApPerson[] }) {
  return (
    <span className="ap-faces" aria-hidden="true">
      {orderPair(pair).map((p) => (
        <span key={p.id} className={`ap-fc${p.me ? ' ap-me' : ''}`}>
          {p.initials}
        </span>
      ))}
    </span>
  );
}

// The five slim steps of a row.
export function StepsMark({ now }: { now: number }) {
  return (
    <span className="ap-steps" role="img" aria-label={stepAria(now)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={i < now ? 'ap-done' : i === now ? 'ap-now' : undefined} />
      ))}
    </span>
  );
}

// A value on a track (the average on 1-5, words on 400).
export function Trk({ v, max }: { v: number; max: number }) {
  return (
    <span className="ap-trk" aria-hidden="true">
      <i style={{ width: `${Math.min(100, Math.round((v / max) * 100))}%` }} />
    </span>
  );
}

// The draft squares (criteria filled in of the rubric).
function Squares({ n, total, label }: { n: number; total: number; label?: string }) {
  return (
    <span className="ap-sqs" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < n ? 'ap-on' : undefined} />
      ))}
    </span>
  );
}

// The row's score mark: the average, the viewer's draft, or how many of the two scores are in.
export function ScoreMark({ a, st, total }: { a: ApApplicant; st: ApStage; total: number }) {
  if (st.kind === 'scored' && a.avg !== null) {
    return (
      <span className="ap-avg" title="Average of both published scores" role="img" aria-label={`Average ${avgText(a.avg)} of 5`}>
        <b aria-hidden="true">{avgText(a.avg)}</b>
        <Trk v={a.avg} max={5} />
      </span>
    );
  }
  if (st.kind === 'needs') {
    return (
      <span className="ap-mk">
        <Squares n={a.draft} total={total} label={`Your draft: ${a.draft} of ${total} criteria`} />
        <span className={`ap-mk-l${a.draft ? ' ap-ink' : ''}`}>{a.draft ? `Draft ${a.draft} of ${total}` : 'Not started'}</span>
      </span>
    );
  }
  if (st.kind === 'waiting' && a.pair.length) {
    const n = a.published.length;
    return (
      <span className="ap-mk">
        <span className="ap-pips" role="img" aria-label={`${n} of 2 scores published`}>
          <span className={n > 0 ? 'ap-on' : undefined} />
          <span className={n > 1 ? 'ap-on' : undefined} />
        </span>
        <span className="ap-mk-l">{n} of 2 in</span>
      </span>
    );
  }
  return null;
}

// The five steps with their notes: vertical dots (preview, phone detail) or horizontal segments (laptop detail).
export function StepsList({ a, st, cycle, now, kind }: { a: ApApplicant; st: ApStage; cycle: ApCycle; now: string; kind: 'v' | 'h' }) {
  const notes = stepNotes(a, st, cycle, now);
  return (
    <ol className={kind === 'v' ? 'ap-vsteps' : 'ap-hsteps'}>
      {STEP_LABELS.map((l, i) => {
        const s = i < st.now ? 'ap-done' : i === st.now ? 'ap-now' : undefined;
        return (
          <li key={l} className={s} aria-current={i === st.now ? 'step' : undefined}>
            {kind === 'v' ? <span className="ap-vdot">{i < st.now ? <Icon name="check" /> : null}</span> : <span className="ap-seg" />}
            <span>
              <b>{l}</b>
              {notes[i] ? <span className="ap-vn">{i === 3 ? <NwDate text={notes[i]} /> : notes[i]}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// "Tue Nov 24, 7:00 PM" with the date and the time each kept on one line.
function NwDate({ text }: { text: string }) {
  const [d, t] = text.split(', ');
  return (
    <>
      <span className="rf-nowrap">{t ? `${d},` : d}</span>
      {t ? (
        <>
          {' '}
          <span className="rf-nowrap">{t}</span>
        </>
      ) : null}
    </>
  );
}

type IvProps = {
  a: ApApplicant;
  st: ApStage;
  cycle: ApCycle;
  now: string;
  /** Mock mode: nudges and reminders work on the page's own state. */
  canNudge: boolean;
  nudge: NudgeState;
  /** "preview" or "detail": keeps the draft's ids apart. */
  where: string;
  onNudge: () => void;
  onCancel: () => void;
  onSend: () => void;
};

// The interview block: when, who and each person's score state, the average once both are in, the privacy line, the
// waiting line with its nudge (mock mode), the next links, and the interview summary.
export function InterviewBlock({ a, st, cycle, now, canNudge, nudge, where, onNudge, onCancel, onSend }: IvProps) {
  const k = st.kind;
  const total = cycle.criteriaTotal;
  const n = canNudge ? nudgeFor(a, st, cycle) : null;
  const draftId = `ap-draft-${where}`;
  const mins = a.interviewMinutes ? `Video, ${a.interviewMinutes} min` : 'Video';
  return (
    <>
      {a.interviewAt ? (
        <>
          <p className="ap-iv-when" title={fullDate(easternDay(a.interviewAt))}>
            <span>{k === 'interview' ? whenText(now, a.interviewAt) : `${shortDate(easternDay(a.interviewAt))}, ${clock(a.interviewAt)}`}</span>
          </p>
          <p className="ap-iv-sub">{mins}</p>
          {a.slotId ? (
            <p className="ap-iv-open">
              <Link className="rf-lnk" href={interviewHref(a.slotId)}>
                Open interview
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="ap-iv-when">Not booked</p>
          {cycle.interviewEnd ? (
            <p className="ap-iv-sub">
              Interviews run to <span className="rf-nowrap">{shortDate(cycle.interviewEnd)}</span>
            </p>
          ) : null}
        </>
      )}
      {a.pair.length ? (
        <ul className="ap-ppl">
          {orderPair(a.pair).map((p) => {
            let state = null;
            if (k === 'needs' || k === 'waiting') {
              if (a.published.includes(p.id)) {
                state = (
                  <span className="ap-st ap-ink">
                    <Icon name="check" />
                    Published
                  </span>
                );
              } else if (p.me && a.draft) {
                state = (
                  <span className="ap-st ap-ink">
                    <Squares n={a.draft} total={total} />
                    Draft {a.draft} of {total}
                  </span>
                );
              } else state = <span className="ap-st">Not published</span>;
            } else if (k === 'scored') {
              state = (
                <span className="ap-st ap-ink">
                  <Icon name="check" />
                  Published
                </span>
              );
            }
            return (
              <li key={p.id}>
                <span className="ap-pnm">
                  <span className={`ap-fc${p.me ? ' ap-me' : ''}`} aria-hidden="true">
                    {p.initials}
                  </span>
                  {p.me ? 'You' : p.name}
                </span>
                {state}
              </li>
            );
          })}
        </ul>
      ) : null}
      {k === 'scored' && a.avg !== null ? (
        <div className="ap-bigavg">
          <b>{avgText(a.avg)}</b>
          <Trk v={a.avg} max={5} />
          <span>average of 2</span>
        </div>
      ) : null}
      {k === 'needs' || k === 'waiting' ? (
        <p className="ap-lock">
          <Icon name="lock" />
          <span>Scores stay private until both interviewers publish.</span>
        </p>
      ) : null}
      {n ? (
        nudge === 'sent' ? (
          <div className="rf-waitbar rf-done ap-wb">
            <span className="ap-nudged">
              <Icon name="check" />
              {n.done}
            </span>
          </div>
        ) : (
          <div className="rf-waitbar ap-wb">
            <span className="rf-wt">
              <Icon name="wait" />
              {n.waitOn}
            </span>
            <button type="button" className="ap-nudge" aria-expanded={nudge === 'draft' || nudge === 'sending'} aria-controls={draftId} onClick={onNudge} data-ap-nudge={where}>
              {n.label}
            </button>
          </div>
        )
      ) : null}
      {(k === 'interview' && st.you) || k === 'scored' ? (
        <div className="ap-ivacts">
          {k === 'interview' ? (
            <Link className="rf-lnk" href="/scholarships/interviews/questions">
              Interview questions
            </Link>
          ) : (
            <Link className="rf-lnk" href="/scholarships/scoring">
              Open scores
            </Link>
          )}
        </div>
      ) : null}
      {n && nudge !== 'sent' ? (
        <Fold open={nudge === 'draft' || nudge === 'sending'} id={draftId}>
          <div className="ap-draft">
            <span className="ap-dl">
              To{' '}
              {n.toNames.map((nm, i) => (
                <span key={nm}>
                  {i ? ' and ' : ''}
                  <span className="rf-nowrap">{nm}</span>
                </span>
              ))}{' '}
              {n.toWhere}
            </span>
            <p className="ap-dtext">{n.text}</p>
            <div className="ap-dact">
              <button type="button" className="rf-btn" onClick={onSend} disabled={nudge === 'sending'} data-ap-send={where}>
                <Icon name="send" />
                <span>{nudge === 'sending' ? 'Sending…' : 'Send'}</span>
              </button>
              <button type="button" className="rf-lnk" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        </Fold>
      ) : null}
      {a.summary ? (
        <p className="ap-sum">
          <span className="ap-sum-l">Interview summary</span>
          {a.summary}
        </p>
      ) : k === 'needs' || k === 'waiting' || k === 'scored' ? (
        <p className="ap-sum ap-muted">No interview summary yet.</p>
      ) : null}
    </>
  );
}

/** The when-line's hover title on a row ("Thursday, November 12, 5:30 PM"). */
export { fullWhen };

/**
 * The mock-mode nudge drafts, per application code: open / close the draft, and "Send" (450 ms of "Sending…", the draft
 * folds away, then "Nudged just now" and one announcement), as in the demo. Nothing is sent anywhere.
 */
export function useNudges(say: (m: string) => void) {
  const [state, setState] = useState<Record<string, NudgeState>>({});
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const set = (code: string, s: NudgeState) => setState((m) => ({ ...m, [code]: s }));
  const of = (code: string): NudgeState => state[code] ?? 'none';
  const toggle = (code: string, focusSel: string) => {
    const open = of(code) !== 'draft';
    set(code, open ? 'draft' : 'none');
    if (open) timers.current.push(window.setTimeout(() => document.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true }), 30));
  };
  const cancel = (code: string, focusSel: string) => {
    set(code, 'none');
    document.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  };
  const send = (code: string, said: string) => {
    set(code, 'sending');
    timers.current.push(
      window.setTimeout(() => {
        set(code, 'closing');
        timers.current.push(
          window.setTimeout(() => {
            set(code, 'sent');
            say(said);
          }, foldMs()),
        );
      }, 450),
    );
  };
  return { of, toggle, cancel, send };
}
