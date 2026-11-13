'use client';

// One thing on the Calendar (a row in the chosen day and in the agenda): a bare line icon, then the eyebrow (when, kind,
// area), the title, who is on it, and, for a thing that waits on someone, the waiting line with the nudge and its draft.
// Presentational: the board (./calendar-board) owns the state and passes the handlers. Demo reference: `row()` in
// apps/design/ops-refresh/directions/p-calendar/index.html.
import { Fragment } from 'react';
import { Fold } from '@/components/refresh/fold';
import { Icon, type IconName } from '@/components/refresh/icons';
import { shortDate } from '@/lib/refresh-time';
import { areaName, clockMin, initials, isMine, isPast, kindWord, whenText } from '@/lib/calendar-time';
import type { CalViewItem, CalKind } from '@/lib/calendar-view';

const KIND_ICON: Record<CalKind, IconName> = { interview: 'video', task: 'task', post: 'mega', event: 'cal', cycle: 'flag', span: 'clock' };

/** What the row needs from the board besides the item. */
export type RowCtx = {
  today: string;
  nowMin: number;
  me: string;
  /** id -> full name. */
  names: Map<string, string>;
  /** The id that just changed (it flashes gold once). */
  flash: string | null;
  /** Nudges are drawn (caps.nudge). */
  canNudge: boolean;
  nudgeOpen: boolean;
  nudgeText: string;
  /** The nudge that went out, with its time ("9:20 AM"). */
  nudged: { id: string; at: string } | null;
  /** Suffix that keeps ids unique (the rows are drawn in both the month view and the agenda). */
  sfx: string;
  onNudge: () => void;
  onNudgeText: (t: string) => void;
  onNudgeSend: () => void;
  onNudgeCancel: () => void;
  onUnnudge: () => void;
};

// A first name ("Keith" from "Keith Dawson").
const first = (n: string) => n.split(' ')[0];

// Who is on it: "Whole board", or the names joined with " + " ("You" for the viewer), each kept on one line.
function WhoText({ people, me, names }: { people: string[]; me: string; names: Map<string, string> }) {
  if (!people.length) return <span>Whole board</span>;
  return (
    <span>
      {people.map((p, k) => (
        <Fragment key={p}>
          {k ? ' + ' : ''}
          <span className="cal-nowrap">{p === me ? 'You' : (names.get(p) ?? 'Board member')}</span>
        </Fragment>
      ))}
    </span>
  );
}

// One row, and the nudge draft that folds open under it.
export function CalRow({ item: i, day, ctx }: { item: CalViewItem; day: string; ctx: RowCtx }) {
  const past = i.kind !== 'span' && isPast(ctx.today, ctx.nowMin, i);
  const mine = isMine(i, ctx.me);
  const kw = kindWord(i.kind, i.eventKind);
  const waitName = i.waiting ? (ctx.names.get(i.waiting.personId) ?? 'them') : '';
  const isNudged = ctx.nudged?.id === i.id;
  // The waiting line only while the thing is still ahead.
  const waits = !!i.waiting && !past;
  return (
    <>
      <div className={`cal-ag cal-k-${i.kind}${mine ? ' cal-mine' : ''}${past ? ' cal-past' : ''}${ctx.flash === i.id ? ' cal-flash' : ''}`} data-id={i.id}>
        <span className="cal-kt" aria-hidden="true">
          <Icon name={KIND_ICON[i.kind]} />
        </span>
        <div>
          <span className="cal-eb">
            <span className={`cal-when${i.time == null ? ' cal-soft' : ''}`} title={`${shortDate(i.date)}${i.time != null ? `, ${clockMin(i.time)}` : ''}`}>
              {whenText(i, day)}
            </span>
            {kw ? <span className="cal-kw">{kw}</span> : null}
            <span className="cal-kw">{areaName(i.area)}</span>
          </span>
          <span className="cal-t">
            {i.kind === 'interview' ? (
              <>
                <span className="cal-nowrap">{i.title}</span>
                {i.code ? <span className="cal-code">{i.code}</span> : null}
              </>
            ) : (
              i.title
            )}
          </span>
          {/* Always drawn (even empty), so the row keeps the demo's height. */}
          <div className="cal-meta">
            {i.kind === 'span' ? (
              <span className="cal-nowrap">
                {shortDate(i.date)} to {shortDate(i.endDate ?? i.date)}
              </span>
            ) : i.kind !== 'cycle' || i.people.length ? (
              <span className="cal-who">
                {i.people.length ? (
                  <span className="cal-faces" aria-hidden="true">
                    {i.people.map((p) => (
                      <span key={p} className={`cal-fc${p === ctx.me ? ' cal-me' : ''}`}>
                        {initials(ctx.names.get(p) ?? '?')}
                      </span>
                    ))}
                  </span>
                ) : null}
                <WhoText people={i.people} me={ctx.me} names={ctx.names} />
              </span>
            ) : null}
            {i.done ? (
              <span className="cal-ok">
                <Icon name="check" />
                Done
              </span>
            ) : null}
          </div>
          {waits && i.waiting ? (
            isNudged ? (
              <div className="cal-waitbar">
                <span>
                  <Icon name="check" />
                  Nudged {ctx.nudged?.at}
                </span>
                <button type="button" className="rf-lnk" data-k="unnudge" onClick={ctx.onUnnudge}>
                  Undo
                </button>
              </div>
            ) : (
              <div className="cal-waitbar">
                <span className="cal-wt">
                  <Icon name="clock" />
                  Waiting on {first(waitName)}&apos;s {i.waiting.what}
                </span>
                {ctx.canNudge ? (
                  <button type="button" className="cal-nudge" data-k="nudge" aria-expanded={ctx.nudgeOpen} aria-controls={`cal-nudge-${i.id}${ctx.sfx}`} onClick={ctx.onNudge}>
                    Nudge {first(waitName)}
                  </button>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </div>
      {waits && i.waiting && ctx.canNudge && !isNudged ? (
        <Fold open={ctx.nudgeOpen} id={`cal-nudge-${i.id}${ctx.sfx}`}>
          <div className="cal-sub-in">
            <div className="cal-draft">
              <label className="cal-dl" htmlFor={`cal-nudge-text${ctx.sfx}`}>
                To {waitName}, in board chat
              </label>
              <textarea id={`cal-nudge-text${ctx.sfx}`} data-k="nudge-text" rows={3} value={ctx.nudgeText} onChange={(e) => ctx.onNudgeText(e.target.value)} />
              <div className="cal-dact">
                <button type="button" className="rf-btn" onClick={ctx.onNudgeSend}>
                  Send
                </button>
                <button type="button" className="rf-lnk" onClick={ctx.onNudgeCancel}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Fold>
      ) : null}
    </>
  );
}
