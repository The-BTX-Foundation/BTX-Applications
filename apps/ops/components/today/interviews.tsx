'use client';

// "Your interviews" on Today: one ticket per upcoming interview, the day set large on the stub, tapping the ticket (or
// its stub) opens who it is with, the applicant code and the prep line. "Prepped" follows the prep task: the board passes
// the ids of prep tasks the viewer has ticked. A name too long to sit beside the stub turns the stub into a strip on top.
import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { InterviewTicket } from '@/lib/today-view';
import { Panel } from '@/components/refresh/panel';
import { StateLine } from '@/components/refresh/state-line';
import { interviewHref } from '@/lib/interview-href';
import { rel, ticketTime } from '@/lib/today-time';
import { Fold } from './parts';
import { TdIcon } from './td-icons';

type Props = {
  tickets: InterviewTicket[];
  today: string;
  /** Prep task ids the viewer has ticked done on this page. */
  doneTaskIds: Set<string>;
  /** Prep task ids still on the list (a ticked-then-undone task is open again). */
  openTaskIds: Set<string>;
};

// The panel.
export function Interviews({ tickets, today, doneTaskIds, openTaskIds }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLUListElement>(null);

  // Fits each ticket: when the name is wider than its column, the ticket goes "tight" (stub on top, name full width).
  // Runs after every render and on resize, before paint, so the class React redraws is put back without a flicker.
  useLayoutEffect(() => {
    const fit = () => {
      listRef.current?.querySelectorAll<HTMLElement>('.td-ticket').forEach((t) => {
        t.classList.remove('td-tight');
        const nm = t.querySelector<HTMLElement>('.td-nm');
        const tb = t.querySelector<HTMLElement>('.td-tb');
        if (nm && tb && nm.offsetWidth > tb.clientWidth + 1) t.classList.add('td-tight');
      });
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });

  // Opens or closes one ticket.
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Panel
      id="td-ivh"
      title="Your interviews"
      className="td-iv"
      action={
        <Link className="rf-lnk" href="/calendar">
          Calendar
        </Link>
      }
    >
        {tickets.length === 0 ? (
          <StateLine kind="empty">No interviews coming up.</StateLine>
        ) : (
          <ul className="td-tickets" ref={listRef}>
            {tickets.map((t) => {
              const tt = ticketTime(today, t.startsAt);
              const isOpen = open.has(t.id);
              const tid = t.prep?.taskId ?? null;
              // Prepped: the linked prep task was ticked on this page, or it was already done when the page loaded.
              const prepped = !!t.prep && (tid ? doneTaskIds.has(tid) || (!openTaskIds.has(tid) && t.prep.done) : t.prep.done);
              return (
                <li key={t.id} className={`td-ticket${prepped ? ' td-is-prepped' : ''}`}>
                  <span className="rf-stub" aria-hidden="true" onClick={() => toggle(t.id)}>
                    <span>{tt.wd}</span>
                    <strong>{tt.day}</strong>
                    <span>{tt.mon}</span>
                  </span>
                  <button type="button" className="td-tk-head" aria-expanded={isOpen} aria-controls={`td-tkm-${t.id}`} onClick={() => toggle(t.id)}>
                    <span className="td-tb">
                      <span className="td-tl">
                        <span className="td-nm rf-nowrap">{t.applicantName}</span>
                        <span className="td-cd">{tt.away}</span>
                        <span className="rf-sr">, {tt.full}</span>
                      </span>
                      <span className="td-tmarks">
                        <span>{tt.time}</span>
                        <span>
                          {t.mode}, {t.minutes} min
                        </span>
                        <span className="td-prepped">
                          <TdIcon name="check" />
                          Prepped
                        </span>
                      </span>
                    </span>
                    <TdIcon name="down" className="td-tk-chev" />
                  </button>
                  <Fold open={isOpen} id={`td-tkm-${t.id}`}>
                    <dl className="td-tk-more">
                      <dt>With</dt>
                      <dd className="rf-nowrap">{t.withName}</dd>
                      <dt>Applicant</dt>
                      <dd className="rf-nowrap">{t.code}</dd>
                      <dt>Interview</dt>
                      <dd>
                        {/* The ticket id is the interview time's id (lib/today-map.ts), so it opens that interview's page. */}
                        <Link className="rf-lnk" href={interviewHref(t.id)}>
                          Open interview
                        </Link>
                      </dd>
                      {t.prep ? (
                        <>
                          <dt>Prep</dt>
                          <dd className="td-prep-row">
                            {!prepped && t.prep.dueOn ? <span>Task due {rel(today, t.prep.dueOn)}</span> : null}
                            <Link className="rf-lnk" href={t.prep.href}>
                              Open questions
                            </Link>
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </Fold>
                </li>
              );
            })}
          </ul>
        )}
    </Panel>
  );
}
