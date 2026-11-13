'use client';

// One row of the Tasks list, and the slim "Done · Undo" line that replaces a finished row for 5 seconds (Today's row,
// plus the owner on Team, the comment count, an open state and the review chevron on approvals). Under the row, in this
// order: the Schedule list, the snooze strip, the nudge draft and (laptop) the task's detail, each folding open in place.
// On the phone the row slides left to show Snooze and Done (or Review); the board runs the swipe. Purely presentational:
// the board owns every piece of state. Reference: renderRow in apps/design/ops-refresh/directions/p-tasks/index.html.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { TasksCaps, TasksPerson, TasksTask } from '@/lib/tasks-view';
import { cnt, daysFrom, kindOf, rel, shortDate, taskRowActions, type TasksTab } from '@/lib/tasks-time';
import { dueTitle } from '@/lib/today-time';
import { Fold, Nw } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';

/** Where a row is in its life: on the list, ticked, folding away, the Undo line, gone, or moving after a snooze. */
export type Phase = 'open' | 'checking' | 'closing' | 'undo' | 'undoClosing' | 'gone' | 'moving';

/** A task as the board holds it: the contract's task plus its phase, remount key, enter effect and approval decision. */
export type BoardTask = TasksTask & { phase: Phase; nonce: number; fx: 'enter' | null; decided: 'approved' | 'declined' | null; decidedStep: number };

/** The nudge (or remind) draft's state on a waiting task. */
export type NudgeUi = { state: 'none' | 'draft' | 'sent'; editing: boolean; text: string; sending: boolean };

/** What the row's buttons call; the board decides what each does. */
export type RowHandlers = {
  onOpen: (id: string, k: string) => void;
  onDone: (id: string) => void;
  onSnoozeToggle: (id: string) => void;
  onSnooze: (id: string, to: 'tomorrow' | 'monday' | null) => void;
  onSched: (id: string) => void;
  onNudge: (id: string) => void;
  onNudgeEdit: (id: string) => void;
  onNudgeCancel: (id: string) => void;
  onNudgeSend: (id: string) => void;
  onNudgeText: (id: string, text: string) => void;
};

type RowProps = {
  t: BoardTask;
  tab: TasksTab;
  today: string;
  me: string;
  caps: TasksCaps;
  people: Map<string, TasksPerson>;
  /** Names that never break across lines (people and applicants in titles). */
  names: string[];
  /** This row's detail is the open one (gold tint and edge). */
  isOpen: boolean;
  schedOpen: boolean;
  snoozeOpen: boolean;
  nudge: NudgeUi;
  /** The snooze choices' weekdays; `same` when tomorrow is next Monday, so only one choice is drawn. */
  snoozeWd: { tomorrow: string; monday: string; same: boolean };
  /** Phone long-press: the exact date in place of the due word (the board times it). */
  exact: boolean;
  /** The detail in place (laptop only); null on the phone, where it opens as a sheet. */
  detail: ReactNode;
  detailOpen: boolean;
  h: RowHandlers;
};

// The row and what opens under it.
export function TaskRow({ t, tab, today, me, caps, people, names, isOpen, schedOpen, snoozeOpen, nudge, snoozeWd, exact, detail, detailOpen, h }: RowProps) {
  const id = t.id;
  const k = `list:${id}`;
  const late = !!t.dueOn && daysFrom(today, t.dueOn) < 0;
  const ticked = t.phase === 'checking' || t.phase === 'closing';
  const kind = kindOf(t.kind, late, tab === 'team' && t.ownerId === me);
  // What the row offers (lib/tasks-time.ts): an approval never gets a check (backlog B16); the availability prompt gets nothing.
  const acts = taskRowActions(t, caps);
  // Snooze only while the row is plainly on the list, so it cannot race a Done.
  const canSnooze = acts.snooze && t.phase === 'open';
  const swipeable = acts.check || canSnooze || acts.review;
  // A stored task opens its detail; the availability prompt is only its link.
  const opens = t.stored;
  const owner = t.ownerId ? people.get(t.ownerId) : undefined;
  const waitsOn = t.waiting ?? null;
  const remind = t.remind ?? null;
  const canNudge = (waitsOn && caps.nudge) || (remind && caps.remind);

  // The waiting line: who or what it waits on, with the one-tap nudge (or remind) beside it.
  let wait: ReactNode = null;
  if (waitsOn || remind) {
    wait =
      nudge.state === 'sent' ? (
        <div className="rf-waitbar rf-done">
          <span className="tk-nudged">
            <Icon name="check" />
            {remind ? 'Reminded just now' : 'Nudged just now'}
          </span>
        </div>
      ) : (
        <div className="rf-waitbar">
          <span className="rf-wt">
            <Icon name="wait" />
            {remind ? (
              <span>{remind.count} haven&apos;t booked</span>
            ) : (
              <span>
                Waiting on <span className="rf-nowrap">{waitsOn?.first}&apos;s</span> {waitsOn?.what}
              </span>
            )}
          </span>
          {canNudge ? (
            <button type="button" className="tk-nudge" aria-expanded={nudge.state === 'draft'} data-k={`${k}:nudge`} onClick={() => h.onNudge(id)}>
              {remind ? `Remind the ${remind.count}` : `Nudge ${waitsOn?.first}`}
            </button>
          ) : null}
        </div>
      );
  }

  // A tap on the row itself (not on one of its controls) opens the detail, as in the demo.
  const rowClick = (e: React.MouseEvent) => {
    if (!opens || (e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    h.onOpen(id, `${k}:open`);
  };

  return (
    <Fold open={t.phase !== 'closing' && t.phase !== 'moving'} appear={t.fx === 'enter'} className="rf-item" data-id={id}>
      <div className="tk-swipe">
        {swipeable ? (
          <div className="tk-under" aria-hidden="true">
            {canSnooze ? (
              <button type="button" className="tk-u-snooze" tabIndex={-1} onClick={() => h.onSnoozeToggle(id)}>
                <Icon name="snooze" />
                Snooze
              </button>
            ) : null}
            {acts.review ? (
              <button type="button" className="tk-u-open" tabIndex={-1} data-swipe-open={id}>
                <Icon name="open" />
                Review
              </button>
            ) : acts.check ? (
              <button type="button" className="tk-u-done" tabIndex={-1} data-swipe-done={id}>
                <Icon name="check" />
                Done
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={`rf-row${kind.cls}${ticked ? ' rf-done' : ''}${isOpen ? ' rf-open' : ''}${t.fx === 'enter' ? ' rf-flash' : ''}`} data-id={id} onClick={rowClick}>
          <span className="rf-kt" aria-hidden="true">
            <Icon name={kind.icon} />
          </span>
          <div className="rf-main">
            <span className="rf-eb">
              <span className="rf-due" title={dueTitle(today, t.dueOn)} data-full={t.dueOn ? shortDate(t.dueOn) : 'No date'}>
                {exact ? (t.dueOn ? shortDate(t.dueOn) : 'No date') : late ? <span className="rf-late">{rel(today, t.dueOn)}</span> : rel(today, t.dueOn)}
              </span>
              {kind.word ? <span className="rf-kw">{kind.word}</span> : null}
              {t.areaName ? <span className="rf-kw">{t.areaName}</span> : null}
            </span>
            {opens ? (
              <button type="button" className="rf-t" aria-expanded={isOpen} data-k={`${k}:open`} onClick={() => h.onOpen(id, `${k}:open`)}>
                <Nw text={t.title} names={names} />
              </button>
            ) : (
              <span className="rf-t">
                <Nw text={t.title} names={names} />
              </span>
            )}
            <span className="rf-meta">
              {tab === 'team' && t.ownerId ? (
                <span className="tk-ty tk-own">
                  <span className="tk-faces" aria-hidden="true">
                    <span className={`tk-fc${t.ownerId === me ? ' tk-me' : ''}`}>{owner?.initials ?? '?'}</span>
                  </span>
                  <span className="rf-nowrap">{t.ownerId === me ? 'You' : (owner?.name ?? 'Board member')}</span>
                </span>
              ) : null}
              {t.extra ? <span>{t.extra}</span> : null}
              {t.link ? (
                <Link className="rf-lnk" href={t.link.href} data-k={`${k}:link`}>
                  {t.link.label}
                </Link>
              ) : null}
              {t.schedule && t.schedule.length > 0 ? (
                <button type="button" className="rf-lnk" aria-expanded={schedOpen} data-k={`${k}:sched`} onClick={() => h.onSched(id)}>
                  Schedule
                  <Icon name="down" />
                </button>
              ) : null}
              {t.comments.length ? (
                <span className="tk-ty tk-cm">
                  <Icon name="chat" />
                  <span aria-hidden="true">{cnt(t.comments.length)}</span>
                  <span className="rf-sr">{t.comments.length === 1 ? '1 comment' : `${t.comments.length} comments`}</span>
                </span>
              ) : null}
            </span>
            {wait}
          </div>
          <span className="tk-hacts">
            {canSnooze ? (
              <button type="button" className="tk-ha" data-k={`${k}:hsnooze`} title="Snooze" aria-label={`Snooze: ${t.title}`} aria-expanded={snoozeOpen} onClick={() => h.onSnoozeToggle(id)}>
                <Icon name="snooze" />
              </button>
            ) : null}
          </span>
          {t.kind === 'approval' && t.stored ? (
            <button type="button" className="rf-lead-ic" aria-label={`Review: ${t.title}`} aria-expanded={isOpen} data-k={`${k}:lead`} onClick={() => h.onOpen(id, `${k}:lead`)}>
              <Icon name="chev" />
            </button>
          ) : acts.check ? (
            <button type="button" className={`rf-check${t.phase === 'checking' ? ' rf-pop' : ''}`} aria-pressed={ticked} data-k={`${k}:check`} aria-label={`Done: ${t.title}`} onClick={() => h.onDone(id)}>
              <Icon name="check" />
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>
      {t.schedule && t.schedule.length > 0 ? (
        <Fold open={schedOpen}>
          <div className="rf-sub-in">
            <ul className="tk-sched">
              {t.schedule.map((s) => (
                <li key={s.code + s.whenLabel} className={s.yours ? 'tk-yours' : undefined}>
                  <span className="tk-nm">
                    <span className="rf-nowrap">{s.name}</span>
                    <span className="tk-code rf-nowrap">{s.code}</span>
                  </span>
                  <span className="tk-when rf-nowrap">{s.whenLabel}</span>
                  <span className="tk-pair">
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
          <SnoozeStrip k={k} wd={snoozeWd} onPick={(to) => h.onSnooze(id, to)} />
        </Fold>
      ) : null}
      {canNudge && nudge.state !== 'sent' ? (
        <Fold open={nudge.state === 'draft'}>
          <div className="rf-sub-in">
            <div className="tk-draft">
              <span className="tk-dl">
                {remind ? (
                  `To the ${remind.count} students who haven't booked, by email`
                ) : (
                  <>
                    To <span className="rf-nowrap">{waitsOn?.name}</span> in Board chat
                  </>
                )}
              </span>
              {nudge.editing ? (
                <textarea className="tk-dtext" rows={3} aria-label="Message" data-k={`${k}:ntext`} value={nudge.text} onChange={(e) => h.onNudgeText(id, e.target.value)} />
              ) : (
                <p className="tk-dtext">{nudge.text}</p>
              )}
              <div className="tk-dact">
                <button type="button" className="rf-btn" data-k={`${k}:nsend`} disabled={nudge.sending} onClick={() => h.onNudgeSend(id)}>
                  <Icon name="send" />
                  <span>{nudge.sending ? 'Sending…' : remind ? `Send to ${remind.count}` : 'Send'}</span>
                </button>
                <button type="button" className="rf-lnk" onClick={() => h.onNudgeEdit(id)}>
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
      {detail ? (
        <Fold open={detailOpen} appear>
          {detail}
        </Fold>
      ) : null}
    </Fold>
  );
}

// The "Snooze until" choices (under the row, and inside the detail with `inDetail`, where it sits flush).
export function SnoozeStrip({ k, wd, inDetail = false, onPick }: { k: string; wd: { tomorrow: string; monday: string; same: boolean }; inDetail?: boolean; onPick: (to: 'tomorrow' | 'monday' | null) => void }) {
  return (
    <div className="rf-sub-in" style={inDetail ? { padding: '12px 0 0' } : undefined}>
      <div className="tk-strip">
        <span>Snooze until</span>
        <button type="button" className="rf-pick" data-k={`${k}:snz1`} onClick={() => onPick('tomorrow')}>
          Tomorrow <span>{wd.tomorrow}</span>
        </button>
        {wd.same ? null : (
          <button type="button" className="rf-pick" data-k={`${k}:snz6`} onClick={() => onPick('monday')}>
            Next week <span>{wd.monday}</span>
          </button>
        )}
        <button type="button" className="rf-lnk" onClick={() => onPick(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// The slim line that replaces a finished row for 5 seconds.
export function UndoLine({ t, onUndo }: { t: BoardTask; onUndo: (id: string) => void }) {
  return (
    <Fold open={t.phase === 'undo'} appear className="rf-item" data-id={`u-${t.id}`}>
      {/* Not a live region: the board's status line says "Done. Undo available for 5 seconds." once. */}
      <div className="tk-undo-line">
        <span className="tk-ul-tick">
          <Icon name="check" />
        </span>
        <span>Done</span>
        <span aria-hidden="true">·</span>
        <button type="button" className="rf-lnk" data-k={`list:${t.id}:undo`} onClick={() => onUndo(t.id)}>
          Undo
        </button>
      </div>
    </Fold>
  );
}
