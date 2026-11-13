'use client';

// One row of "Your tasks" on Today, and the slim "Done · Undo" line that replaces a finished row for 5 seconds.
// The row: kind icon | eyebrow (due word, area) + title + one quiet link + the waiting line | hover Snooze (laptop) | check.
// Under it, three things can open in place: the Schedule list, the snooze strip and the nudge draft. On the phone the row
// slides left to show Snooze and Done (the board runs the swipe). Purely presentational: the board owns the state.
import Link from 'next/link';
import type { TodayCaps, TodayTask, TodayTaskKind } from '@/lib/today-view';
import { daysFrom, dueTitle, rel, rowActions, shortDate } from '@/lib/today-time';
import { Fold, Nw } from './parts';
import { TdIcon, type TdIconName } from './td-icons';

/** Where a row is in its life: on the list, ticked (strike + spring), folding away, as the Undo line, gone, or moving. */
export type Phase = 'open' | 'checking' | 'closing' | 'undo' | 'undoClosing' | 'gone' | 'moving';

/** A task as the board holds it: the contract's task plus its phase and the remount key used for enter animations. */
export type BoardTask = TodayTask & { phase: Phase; nonce: number; fx: 'enter' | null };

/** The nudge draft's state on a waiting task. */
export type NudgeUi = { state: 'none' | 'draft' | 'sent'; editing: boolean; text: string; sending: boolean };

export type Scope = 'mine' | 'appr';

// The kind icon and word of a row (approvals in gold-ink: only the viewer can do them; late rows in gold-ink too).
function kindOf(kind: TodayTaskKind, late: boolean): [TdIconName, string, string] {
  const tint = late ? ' rf-k-tint' : '';
  switch (kind) {
    case 'approval':
      return ['approve', 'Approval', ' rf-k-gold'];
    case 'post':
      return ['mega', 'Post', ''];
    case 'schedule':
      return ['cal', 'Schedule', tint];
    case 'prep':
      return ['video', 'Interview prep', tint];
    case 'request':
      return ['cal', 'Request', tint];
    case 'scoring':
      return ['scoring', 'Scoring', tint];
    default:
      return ['task', '', tint];
  }
}

export type RowHandlers = {
  onDone: (id: string) => void;
  onSnoozeToggle: (id: string, sc: Scope) => void;
  onSnooze: (id: string, to: 'tomorrow' | 'monday' | null, sc: Scope) => void;
  onSched: (id: string) => void;
  onNudge: (id: string, sc: Scope) => void;
  onNudgeEdit: (id: string, sc: Scope) => void;
  onNudgeCancel: (id: string) => void;
  onNudgeSend: (id: string, sc: Scope) => void;
  onNudgeText: (id: string, text: string) => void;
};

type RowProps = {
  t: BoardTask;
  sc: Scope;
  today: string;
  caps: TodayCaps;
  /** Names that must never break (applicants in titles). */
  names: string[];
  schedOpen: boolean;
  snoozeOpen: boolean;
  nudge: NudgeUi;
  canNudge: boolean;
  /** The snooze choices' weekdays; `same` when tomorrow is next Monday (Sunday), so only one choice is drawn. */
  snoozeWd: { tomorrow: string; monday: string; same: boolean };
  /** Phone long-press: show the exact date in place of the due word (for 2 seconds; the board times it). */
  exact: boolean;
  h: RowHandlers;
};

// The row and what opens under it.
export function TaskRow({ t, sc, today, caps, names, schedOpen, snoozeOpen, nudge, canNudge, snoozeWd, exact, h }: RowProps) {
  const id = t.id;
  const k = `${sc}:${id}`;
  const late = !!t.dueOn && daysFrom(today, t.dueOn) < 0;
  const ticked = t.phase === 'checking' || t.phase === 'closing';
  const [icon, word, kCls] = kindOf(t.kind, late);
  // A prompt that is not a stored task (the availability request) has nothing to tick or snooze; an approval is done only on
  // its own page unless caps.approveInPlace (then only its link shows). See rowActions in lib/today-time.ts.
  const acts = rowActions(t, caps);
  const canDone = acts.done;
  // Snooze only while the row is plainly on the list (not ticked, folding or moving), so it cannot race a Done.
  const canSnooze = acts.snooze && t.phase === 'open';
  const swipeable = canDone || canSnooze;
  const kw = t.areaName || word;

  // The one quiet link: it navigates (the video-links task goes to the Interviews page, where each ticket has its link).
  const link = t.link ? (
    <Link className="rf-lnk" href={t.link.href} data-k={`${k}:link`}>
      {t.link.label}
    </Link>
  ) : null;
  const sched = t.schedule && t.schedule.length > 0 ? (
    <button type="button" className="rf-lnk" aria-expanded={schedOpen} data-k={`${k}:sched`} onClick={() => h.onSched(id)}>
      Schedule
      <TdIcon name="down" />
    </button>
  ) : null;

  let wait = null;
  if (t.waiting) {
    wait =
      nudge.state === 'sent' ? (
        <div className="rf-waitbar rf-done">
          <span className="td-nudged">
            <TdIcon name="check" />
            Nudged just now
          </span>
        </div>
      ) : (
        <div className="rf-waitbar">
          <span className="rf-wt">
            <TdIcon name="wait" />
            <span>
              Waiting on <span className="rf-nowrap">{t.waiting.on}&apos;s</span> {t.waiting.what}
            </span>
          </span>
          {canNudge ? (
            <button type="button" className="td-nudge" aria-expanded={nudge.state === 'draft'} data-k={`${k}:nudge`} onClick={() => h.onNudge(id, sc)}>
              Nudge {t.waiting.on}
            </button>
          ) : null}
        </div>
      );
  }

  return (
    <Fold open={t.phase !== 'closing' && t.phase !== 'moving'} appear={t.fx === 'enter'} className="rf-item" data-id={id}>
      <div className="td-swipe">
        {swipeable ? (
          <div className="td-under" aria-hidden="true">
            {canSnooze ? (
              <button type="button" className="td-u-snooze" tabIndex={-1} onClick={() => h.onSnoozeToggle(id, sc)}>
                <TdIcon name="snooze" />
                Snooze
              </button>
            ) : null}
            {canDone ? (
              <button type="button" className="td-u-done" tabIndex={-1} data-swipe-done={id}>
                <TdIcon name="check" />
                Done
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={`rf-row${kCls}${ticked ? ' rf-done' : ''}${t.fx === 'enter' ? ' rf-flash' : ''}`} data-id={id}>
          <span className="rf-kt" aria-hidden="true">
            <TdIcon name={icon} />
          </span>
          <div className="rf-main">
            <span className="rf-eb">
              <span className="rf-due" title={dueTitle(today, t.dueOn)} data-full={t.dueOn ? shortDate(t.dueOn) : 'No date'}>
                {exact ? (t.dueOn ? shortDate(t.dueOn) : 'No date') : late ? <span className="rf-late">{rel(today, t.dueOn)}</span> : rel(today, t.dueOn)}
              </span>
              {kw ? <span className="rf-kw">{kw}</span> : null}
            </span>
            <span className="rf-t">
              <Nw text={t.title} names={names} />
            </span>
            {link || sched ? (
              <span className="rf-meta">
                {link}
                {sched}
              </span>
            ) : null}
            {wait}
          </div>
          <span className="td-hacts">
            {canSnooze ? (
              <button type="button" className="td-ha" data-k={`${k}:hsnooze`} title="Snooze" aria-label={`Snooze: ${t.title}`} aria-expanded={snoozeOpen} onClick={() => h.onSnoozeToggle(id, sc)}>
                <TdIcon name="snooze" />
              </button>
            ) : null}
          </span>
          {canDone ? (
            <button type="button" className={`rf-check${t.phase === 'checking' ? ' rf-pop' : ''}`} aria-pressed={ticked} data-k={`${k}:check`} aria-label={`Done: ${t.title}`} onClick={() => h.onDone(id)}>
              <TdIcon name="check" />
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>
      {t.schedule && t.schedule.length > 0 ? (
        <Fold open={schedOpen}>
          <div className="rf-sub-in">
            <ul className="td-sched">
              {t.schedule.map((s) => (
                <li key={s.code + s.whenLabel} className={s.yours ? 'td-yours' : undefined}>
                  <span className="td-nm">
                    <span className="rf-nowrap">{s.name}</span>
                    <span className="td-code rf-nowrap">{s.code}</span>
                  </span>
                  <span className="td-when rf-nowrap">{s.whenLabel}</span>
                  <span className="td-pair">
                    <Nw text={s.pair} names={s.pair.split(' + ').filter((n) => n !== 'You')} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Fold>
      ) : null}
      {acts.snooze ? (
        <Fold open={snoozeOpen && canSnooze}>
          <div className="rf-sub-in">
            <div className="td-strip">
              <span>Snooze until</span>
              <button type="button" className="rf-pick" data-k={`${k}:snz1`} onClick={() => h.onSnooze(id, 'tomorrow', sc)}>
                Tomorrow <span>{snoozeWd.tomorrow}</span>
              </button>
              {snoozeWd.same ? null : (
                <button type="button" className="rf-pick" data-k={`${k}:snz6`} onClick={() => h.onSnooze(id, 'monday', sc)}>
                  Next week <span>{snoozeWd.monday}</span>
                </button>
              )}
              <button type="button" className="rf-lnk" onClick={() => h.onSnooze(id, null, sc)}>
                Cancel
              </button>
            </div>
          </div>
        </Fold>
      ) : null}
      {t.waiting && canNudge && nudge.state !== 'sent' ? (
        <Fold open={nudge.state === 'draft'}>
          <div className="rf-sub-in">
            <div className="td-draft">
              <span className="td-dl">
                To <span className="rf-nowrap">{t.waiting.on}</span> in Board chat
              </span>
              {nudge.editing ? (
                <textarea className="td-dtext" rows={3} aria-label={`Message to ${t.waiting.on}`} data-k={`${k}:ntext`} value={nudge.text} onChange={(e) => h.onNudgeText(id, e.target.value)} />
              ) : (
                <p className="td-dtext">{nudge.text}</p>
              )}
              <div className="td-dact">
                <button type="button" className="rf-btn" data-k={`${k}:nsend`} disabled={nudge.sending} onClick={() => h.onNudgeSend(id, sc)}>
                  <TdIcon name="send" />
                  {nudge.sending ? 'Sending…' : 'Send'}
                </button>
                <button type="button" className="rf-lnk" onClick={() => h.onNudgeEdit(id, sc)}>
                  Edit
                </button>
                <button type="button" className="rf-lnk" onClick={() => h.onNudgeCancel(id)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Fold>
      ) : null}
    </Fold>
  );
}

// The slim line that replaces a finished row for 5 seconds.
export function UndoLine({ t, sc, onUndo }: { t: BoardTask; sc: Scope; onUndo: (id: string, sc: Scope) => void }) {
  return (
    <Fold open={t.phase === 'undo'} appear className="rf-item" data-id={`u-${t.id}`}>
      <div className="td-undo-line" role="status">
        <span className="td-ul-tick">
          <TdIcon name="check" />
        </span>
        <span>Done</span>
        <span aria-hidden="true">·</span>
        <button type="button" className="rf-lnk" data-k={`${sc}:${t.id}:undo`} onClick={() => onUndo(t.id, sc)}>
          Undo
        </button>
      </div>
    </Fold>
  );
}
