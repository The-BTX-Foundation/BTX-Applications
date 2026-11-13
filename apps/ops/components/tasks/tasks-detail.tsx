'use client';

// A task's detail: the checklist, the approval plan (approve / decline in place in mock mode; a Review link to
// /finance/budget/approval in live mode), Mark done and Snooze, and the comment thread with its reply field. The same
// markup opens in place under the row on a laptop (`inplace`) and in the bottom sheet on the phone (`sheet`). Purely
// presentational: the board owns every piece of state. Reference: detailHTML / approvalHTML in the p-tasks demo.
import Link from 'next/link';
import { Fragment } from 'react';
import type { TasksCaps, TasksPerson } from '@/lib/tasks-view';
import { cnt, detailActions, money } from '@/lib/tasks-time';
import { Fold, Nw } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { SnoozeStrip, type BoardTask } from './tasks-row';

/** What the detail's buttons call; the board decides what each does. */
export type DetailHandlers = {
  onTick: (id: string, i: number, k: string) => void;
  onMarkDone: (id: string) => void;
  onSnoozeToggle: (id: string, k: string) => void;
  onSnooze: (id: string, to: 'tomorrow' | 'monday' | null) => void;
  onApprove: (id: string, k: string, btn: HTMLButtonElement) => void;
  onApprovalUndo: (id: string, k: string) => void;
  onDeclineToggle: (id: string, k: string) => void;
  onDeclineSend: (id: string, k: string) => void;
  onShowAll: (id: string) => void;
  onDraft: (id: string, text: string) => void;
  onComment: (id: string, k: string) => void;
};

type DetailProps = {
  t: BoardTask;
  mode: 'inplace' | 'sheet';
  me: string;
  caps: TasksCaps;
  people: Map<string, TasksPerson>;
  names: string[];
  /** "9:14 AM" on "Approved by you, …" (mock only). */
  clock: string;
  /** The year the approval bar describes ("2026"). */
  year: string;
  snoozeOpen: boolean;
  approving: boolean;
  declineOpen: boolean;
  showAll: boolean;
  draft: string;
  /** Comment ids that just arrived (they grow in). */
  fresh: Set<string>;
  snoozeWd: { tomorrow: string; monday: string; same: boolean };
  h: DetailHandlers;
};

/** How many of the latest comments show before "Show all". */
const SHOWN = 6;

// The detail.
export function TaskDetail({ t, mode, me, caps, people, names, clock, year, snoozeOpen, approving, declineOpen, showAll, draft, fresh, snoozeWd, h }: DetailProps) {
  const id = t.id;
  const k = `${mode}:${id}`;
  const acts = detailActions(t, caps);
  const owner = t.ownerId ? people.get(t.ownerId) : undefined;
  const ap = t.approval;

  // The checklist as steps (mock), or as one line when the steps are not read (live).
  let checklist = null;
  if (t.checklist && t.checklist.length) {
    const on = t.checklist.filter((c) => c.done).length;
    // On an approval the first open step is "now" (the gold button is that step).
    const nowI = t.kind === 'approval' ? t.checklist.findIndex((c) => !c.done) : -1;
    checklist = (
      <section>
        <h3>
          Checklist <span className="tk-n">{`${on} of ${t.checklist.length} done`}</span>
        </h3>
        <div className="tk-cl-bar" aria-hidden="true">
          {t.checklist.map((c, i) => (
            <span key={i} className={c.done ? 'tk-on' : undefined} />
          ))}
        </div>
        <ul className="tk-cl">
          {t.checklist.map((c, i) => (
            <li key={i} className={`${c.done ? 'tk-on' : ''}${i === nowI ? ' tk-now' : ''}`.trim() || undefined}>
              {acts.tick ? (
                <button type="button" className={`tk-ck${c.done ? ' tk-on' : ''}`} aria-pressed={c.done} aria-label={c.label} data-k={`${k}:cl${i}`} onClick={() => h.onTick(id, i, `${k}:cl${i}`)}>
                  <Icon name="check" />
                </button>
              ) : (
                <span className={`tk-ck${c.done ? ' tk-on' : ''}`} aria-hidden="true">
                  <Icon name="check" />
                </span>
              )}
              <span className="tk-cl-t">{c.label}</span>
              {i === nowI ? <span className="tk-nowtag">Now</span> : null}
            </li>
          ))}
        </ul>
      </section>
    );
  } else if (t.checklistLine) {
    checklist = (
      <section>
        <h3>Checklist</h3>
        <p className="tk-clline">{t.checklistLine}</p>
      </section>
    );
  }

  // The approval: the plan, then (mock) approve / decline in place, or (live) the Review link to the approval page.
  let approval = null;
  if (t.kind === 'approval') {
    let act = null;
    if (acts.approve && ap) {
      if (t.decided === 'approved') {
        act = (
          <>
            <p className="tk-ap-done" role="status">
              <span className="tk-tick">
                <Icon name="check" />
              </span>
              Approved by you, {clock}&nbsp;·&nbsp;
              <button type="button" className="rf-lnk" data-k={`${k}:aundo`} onClick={() => h.onApprovalUndo(id, k)}>
                Undo
              </button>
            </p>
            {ap.afterHint ? <p className="tk-ap-hint">{ap.afterHint}</p> : null}
          </>
        );
      } else if (t.decided === 'declined') {
        act = (
          <p className="tk-ap-done" role="status">
            <span className="tk-tick tk-ink">
              <Icon name="x" />
            </span>
            {ap.askName ? (
              <>
                Declined, sent back to <span className="rf-nowrap">{ap.askName}</span>
              </>
            ) : (
              'Declined'
            )}
            &nbsp;·&nbsp;
            <button type="button" className="rf-lnk" data-k={`${k}:aundo`} onClick={() => h.onApprovalUndo(id, k)}>
              Undo
            </button>
          </p>
        );
      } else {
        act = (
          <>
            <p className="tk-ap-hint">{ap.hint}</p>
            <div className="tk-ap-act">
              <button type="button" className="rf-btn rf-btn-gold" data-k={`${k}:approve`} disabled={approving} onClick={(e) => h.onApprove(id, k, e.currentTarget)}>
                <Icon name="approve" />
                <span>{approving ? 'Approving…' : ap.approveLabel}</span>
              </button>
              {acts.decline ? (
                <button type="button" className="rf-lnk" aria-expanded={acts.reason ? declineOpen : undefined} data-k={`${k}:decline`} onClick={() => h.onDeclineToggle(id, k)}>
                  Decline
                </button>
              ) : null}
            </div>
            {acts.reason ? (
              <Fold open={declineOpen}>
                <div className="tk-why">
                  <div className="tk-draft">
                    <span className="tk-dl">
                      {ap.askName ? (
                        <>
                          To <span className="rf-nowrap">{ap.askName}</span>: what should change?
                        </>
                      ) : (
                        'What should change?'
                      )}
                    </span>
                    <textarea className="tk-dtext" rows={2} aria-label="Why you are declining" data-k={`${k}:why`} placeholder="Optional" />
                    <div className="tk-dact">
                      <button type="button" className="rf-btn" data-k={`${k}:dsend`} onClick={() => h.onDeclineSend(id, k)}>
                        Decline and send back
                      </button>
                      <button type="button" className="rf-lnk" onClick={() => h.onDeclineToggle(id, k)}>
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
    } else if (acts.review) {
      // Live: approvals are decided on the approval page. Never "Mark done" here (backlog B16).
      act = (
        <>
          {ap ? <p className="tk-ap-hint">{ap.hint}</p> : null}
          <div className="tk-ap-act">
            <Link className="rf-btn rf-btn-gold" href={ap?.href ?? t.link?.href ?? '/finance/budget/approval'} data-k={`${k}:review`}>
              <Icon name="approve" />
              <span>Review</span>
            </Link>
          </div>
        </>
      );
    }
    const max = ap ? Math.max(ap.totalCents, 1) : 1;
    const yearBar = ap && ap.spentCents != null && ap.yearCents ? { sp: (ap.spentCents / ap.yearCents) * 100, q: (ap.totalCents / ap.yearCents) * 100 } : null;
    approval = (
      <section className={`tk-ap${t.decided === 'approved' ? ' tk-approved' : ''}`}>
        {ap ? (
          <>
            <h3>{ap.heading}</h3>
            <p className="tk-ap-sum">
              <Nw text={ap.summary} />
            </p>
            {yearBar ? (
              <>
                <div className="tk-yb" role="img" aria-label={`${year}: ${money(ap.spentCents ?? 0)} spent, ${money(ap.totalCents)} in this plan, of ${money(ap.yearCents ?? 0)}`}>
                  <span className="tk-sp" style={{ width: `${yearBar.sp}%` }} />
                  <span className="tk-q4" style={{ width: `${yearBar.q}%` }} />
                </div>
                <p className="tk-yb-l">
                  <span>
                    <i className="tk-sw tk-sp" />
                    Spent so far <b>{money(ap.spentCents ?? 0)}</b>
                  </span>
                  <span>
                    <i className="tk-sw tk-q4" />
                    {ap.heading.split(',')[0]}
                  </span>
                </p>
              </>
            ) : null}
            <ul className="tk-lines">
              {ap.lines.map((l) => (
                <li key={l.label} className={l.isNew ? 'tk-new' : undefined}>
                  <span className="tk-ln">{l.label}</span>
                  <b>{money(l.cents)}</b>
                  <span className="tk-lt">
                    <span style={{ width: `${(l.cents / max) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {act}
      </section>
    );
  }

  // Mark done and Snooze (never on an approval: it is finished by approving).
  const doneActs =
    acts.markDone || acts.snooze ? (
      <div>
        <div className="tk-dacts">
          {acts.markDone ? (
            <button type="button" className="rf-btn" data-k={`${k}:mdone`} onClick={() => h.onMarkDone(id)}>
              <Icon name="check" />
              Mark done
            </button>
          ) : null}
          {acts.snooze ? (
            <button type="button" className="rf-lnk" aria-expanded={snoozeOpen} data-k={`${k}:dsnz`} onClick={() => h.onSnoozeToggle(id, k)}>
              Snooze
              <Icon name="down" />
            </button>
          ) : null}
        </div>
        {acts.snooze ? (
          <Fold open={snoozeOpen}>
            <SnoozeStrip k={k} wd={snoozeWd} inDetail onPick={(to) => h.onSnooze(id, to)} />
          </Fold>
        ) : null}
      </div>
    ) : null;

  // Comments: the latest six (or all), then the reply field. The placeholder names the last person who wrote.
  const last = [...t.comments].reverse().find((c) => c.by !== me);
  const lastFirst = last?.by ? people.get(last.by)?.first : undefined;
  const ph = lastFirst ? `Reply to ${lastFirst}` : 'Add a comment';
  const shown = showAll ? t.comments : t.comments.slice(-SHOWN);
  const earlier = t.comments.length - shown.length;

  return (
    <div className={`tk-dt tk-${mode === 'sheet' ? 'insheet' : 'inplace'}`}>
      <div className="tk-dt-grid">
        <div className="tk-dt-a">
          {mode === 'sheet' && t.ownerId && t.ownerId !== me ? (
            <p className="tk-owner">
              <span>Owner</span>
              <span className="tk-av" aria-hidden="true">
                {owner?.initials ?? '?'}
              </span>
              <b className="rf-nowrap">{owner?.name ?? 'Board member'}</b>
            </p>
          ) : null}
          {checklist}
          {approval}
          {doneActs}
        </div>
        <div className="tk-dt-b">
          <section className="tk-cmts">
            <h3>
              Comments <span className="tk-n">{cnt(t.comments.length)}</span>
            </h3>
            {earlier > 0 ? (
              <p className="tk-none">
                {earlier} earlier ·{' '}
                <button type="button" className="rf-lnk" data-k={`${k}:all`} onClick={() => h.onShowAll(id)}>
                  Show all
                </button>
              </p>
            ) : null}
            {!t.comments.length ? <p className="tk-none">No comments yet.</p> : null}
            {shown.map((c) => {
              const p = c.by ? people.get(c.by) : undefined;
              const mine = c.by === me;
              const msg = (
                <div className={`tk-msg${mine ? ' tk-mine' : ''}`}>
                  <span className="rf-avatar rf-round" aria-hidden="true">
                    {p?.initials ?? '?'}
                  </span>
                  <div>
                    <p className="tk-from">
                      <b>{mine ? 'You' : (p?.name ?? 'Board member')}</b>
                      <span>{c.at}</span>
                    </p>
                    <p className="tk-txt">
                      <Nw text={c.body} names={names} />
                    </p>
                  </div>
                </div>
              );
              return fresh.has(c.id) ? (
                <Fold key={c.id} open appear>
                  {msg}
                </Fold>
              ) : (
                <Fragment key={c.id}>{msg}</Fragment>
              );
            })}
            {acts.comment ? (
              <form
                className="tk-reply"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  h.onComment(id, `${k}:reply`);
                }}
              >
                <input type="text" enterKeyHint="send" maxLength={2000} placeholder={ph} aria-label={ph} data-k={`${k}:reply`} value={draft} onChange={(e) => h.onDraft(id, e.target.value)} />
                <button className="tk-send" type="submit" aria-label="Send comment" disabled={!draft.trim()}>
                  <Icon name="send" />
                </button>
              </form>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
