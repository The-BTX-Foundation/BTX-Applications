'use client';

// "Interview times" and "Board availability" (Figma "Options: interview flow": waiting on availability, proposed,
// confirm sending, after sending). Times are proposed only where 2 or more board members are free. Board members
// with admin rights rebuild, add, remove and send; everyone else reads. Live changes go through lib/actions/interviews.ts
// and the page reloads its data; in mock mode (no Supabase env) the panel keeps the change in its own state.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TimesData } from '@/lib/interviews';
import { addProposedTime, rebuildTimes, remindBoard, removeProposedTime, sendTimes } from '@/lib/actions/interviews';
import { dayLine, groupByDay, proposedHeadline, shortName, waitingLine, type TimeChip } from '@/lib/interview-times';
import { slotFor } from '@/lib/pairing-slots';
import { dayLabel, timeLabel } from '@/lib/format';
import { mockChips } from '@/mock/interview-flow';
import { Dialog } from '../sch-parts';
import '../scholarships.css';
import './interview-flow.css';

const CheckCircle = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="10" cy="10" r="8" />
    <path d="M6.3 10.3l2.6 2.6 4.8-5.2" />
  </svg>
);

const hoursLabel = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? 'hour' : 'hours'}`;

// "+ Add a time": a day's own small form (a time on a half hour), shown in place of the link.
function AddForm({ day, start, onAdd, onCancel }: { day: string; start: string; onAdd: (time: string) => Promise<string>; onCancel: () => void }) {
  const [time, setTime] = useState(start);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const m = await onAdd(time);
    setBusy(false);
    if (m) setErr(m);
  }
  return (
    <div>
      <span className="iv-addf">
        <input type="time" step={1800} value={time} onChange={(e) => setTime(e.target.value)} aria-label={`Start time on ${day}`} />
        <button type="button" className="o-btn p" onClick={go} disabled={busy || time === ''}>
          Add
        </button>
        <button type="button" className="o-btn s" onClick={onCancel}>
          Cancel
        </button>
      </span>
      {err ? (
        <p className="iv-err" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

export function TimesPanel({ data, isAdmin, mock, onNote }: { data: TimesData; isAdmin: boolean; mock: boolean; onNote: (m: string) => void }) {
  const router = useRouter();
  const [chips, setChips] = useState<TimeChip[]>(() => data.days.flatMap((d) => d.times));
  const [openedLabel, setOpenedLabel] = useState(data.openedLabel);
  const [emailed, setEmailed] = useState(data.emailedCount);
  const [adding, setAdding] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const localId = useRef(0);

  const first = data.days[0]?.day ?? null;
  const last = data.days[data.days.length - 1]?.day ?? null;
  const days = groupByDay(first, last, chips);
  const sent = chips.some((c) => c.opened);
  const waiting = chips.length === 0;
  const sentCount = data.people.filter((p) => p.sent).length;
  const notSent = data.people.filter((p) => !p.sent).map((p) => p.name);
  const lowCount = chips.filter((c) => c.freeCount < 2).length;
  const toEmail = Math.max(0, data.toEmail);

  // After a live change the page asks the server again and this panel redraws from the new data.
  const done = (m: string) => {
    onNote(m);
    if (!mock) router.refresh();
  };

  async function build() {
    setBusy(true);
    const r = await rebuildTimes(data.cycleId);
    setBusy(false);
    onNote(r.message);
    if (!r.ok) return;
    // Mock: building from nothing draws the proposed times of the frame; rebuilding changes nothing.
    if (mock) {
      if (waiting) setChips(mockChips(false));
    } else router.refresh();
  }

  async function remove(c: TimeChip) {
    const r = await removeProposedTime(c.slotId);
    if (!r.ok) return onNote(r.message);
    if (mock) setChips((cs) => cs.filter((x) => x.slotId !== c.slotId));
    done('');
  }

  async function add(day: string, time: string): Promise<string> {
    const r = await addProposedTime(data.cycleId, day, time, sent);
    if (!r.ok) return r.message;
    if (mock) {
      const slot = slotFor(day, time);
      if (!slot) return 'That is not a valid time.';
      localId.current += 1;
      setChips((cs) => [...cs, { slotId: `local-${localId.current}`, startsAt: slot.startsAt, time: timeLabel(slot.startsAt), freeCount: 2, opened: sent, booked: false, bookedBy: null }]);
    }
    setAdding(null);
    done('');
    return '';
  }

  async function send() {
    setBusy(true);
    const r = await sendTimes(data.cycleId);
    setBusy(false);
    setConfirm(false);
    if (!r.ok) return onNote(r.message);
    if (mock) {
      const now = new Date();
      setChips((cs) => cs.map((c) => ({ ...c, opened: true })));
      setOpenedLabel(`${dayLabel(now)}, ${timeLabel(now)}`);
      setEmailed(toEmail);
      return onNote(`Emailed ${toEmail} ${toEmail === 1 ? 'applicant' : 'applicants'}. The times are open in the Portal.`);
    }
    done(r.message);
  }

  async function remind() {
    onNote((await remindBoard()).message);
  }

  // The first day with a time suggests the next half hour; otherwise 6:00 PM.
  const startFor = (d: { times: TimeChip[] }) => {
    const t = d.times[d.times.length - 1];
    if (!t) return '18:00';
    const n = new Date(Date.parse(t.startsAt) + 30 * 60_000);
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(n);
  };

  return (
    <div className="iv-cols">
      <section className="o-card s-panel iv-main" aria-label="Interview times">
        <div className="iv-ph">
          <h2>Interview times</h2>
          <span>Needs admin rights</span>
        </div>

        {waiting ? (
          <div className="iv-head">
            <h3>
              {sentCount} of {data.people.length} board members sent their availability
            </h3>
            <div className="iv-segs" aria-hidden="true">
              {data.people.map((p, i) => (
                <i key={p.userId} className={i < sentCount ? 'on' : undefined} />
              ))}
            </div>
            <p>
              {notSent.length > 0 ? `${waitingLine(notSent)} Times are built from everyone’s availability once they send it, or when you build them.` : 'Everyone sent their availability. Build the times when you’re ready.'}
            </p>
            {isAdmin ? (
              <div className="iv-acts">
                {notSent.length > 0 ? (
                  <button type="button" className="o-btn s" onClick={remind}>
                    Remind the others
                  </button>
                ) : null}
                <button type="button" className="o-btn s" onClick={build} disabled={busy}>
                  Build times now
                </button>
              </div>
            ) : null}
          </div>
        ) : sent ? (
          <div className="iv-head done">
            <h3>
              <span className="iv-ok">
                <CheckCircle />
              </span>
              <span>{emailed > 0 ? `Sent to ${emailed} ${emailed === 1 ? 'applicant' : 'applicants'}, ${openedLabel ?? ''}` : `Times opened ${openedLabel ?? ''}. ${isAdmin ? 'No emails went out.' : ''}`}</span>
              <span className="iv-n o-lg">
                {chips.filter((c) => c.booked).length} of {data.applicants} booked
              </span>
            </h3>
            <p className="o-ph">
              {chips.filter((c) => c.booked).length} of {data.applicants} booked
            </p>
            <p>You can still add times. Booked times can’t be removed.</p>
            {isAdmin && emailed === 0 ? (
              <div className="iv-acts">
                <button type="button" className="o-btn p" onClick={() => setConfirm(true)}>
                  Email applicants to book
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="iv-head">
            <h3>{proposedHeadline(chips.length, data.applicants, lowCount)}</h3>
            <p>Each time shows how many board members are free.</p>
            {isAdmin ? (
              <div className="iv-acts rev">
                <button type="button" className="o-btn s" onClick={build} disabled={busy}>
                  Rebuild from availability
                </button>
                <button type="button" className="o-btn p" onClick={() => setConfirm(true)}>
                  Email applicants to book
                </button>
              </div>
            ) : null}
          </div>
        )}

        {waiting ? (
          <div className="iv-foot">{data.closedLine}</div>
        ) : (
          days.map((d) => (
            <div className="iv-day" key={d.day}>
              <div className="iv-dl">
                <b>{d.label}</b>
                <span>{dayLine(d, sent)}</span>
              </div>
              <div>
                <div className="iv-chips">
                  {d.times.length === 0 ? <span className="iv-none">Fewer than 2 board members free</span> : null}
                  {d.times.map((c) =>
                    c.booked ? (
                      <span className="iv-chip held" key={c.slotId}>
                        <b>{c.time}</b>
                        <i>{c.bookedBy ? shortName(c.bookedBy) : 'Booked'}</i>
                      </span>
                    ) : (
                      <span className="iv-chip" key={c.slotId}>
                        <b>{c.time}</b>
                        <i>{c.freeCount} free</i>
                        {isAdmin ? (
                          <button type="button" className="iv-x" aria-label={`Remove ${c.time} on ${d.label}`} onClick={() => remove(c)}>
                            ×
                          </button>
                        ) : null}
                      </span>
                    ),
                  )}
                  {isAdmin && adding !== d.day ? (
                    <button type="button" className="iv-add" onClick={() => setAdding(d.day)}>
                      + Add a time
                    </button>
                  ) : null}
                </div>
                {isAdmin && adding === d.day ? (
                  <div style={{ marginTop: 8 }}>
                    <AddForm day={d.day} start={startFor(d)} onAdd={(t) => add(d.day, t)} onCancel={() => setAdding(null)} />
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="o-card s-panel iv-side" aria-label="Board availability">
        <div className="iv-ph">
          <h2>Board availability</h2>
          <span>
            {sentCount} of {data.people.length}
          </span>
        </div>
        {data.people.map((p) => (
          <div className="iv-pr" key={p.userId}>
            <b>{p.name}</b>
            {!p.sent ? (
              <span className="no">Not sent</span>
            ) : waiting ? (
              <span>
                <CheckCircle />
                Sent
              </span>
            ) : (
              <span>
                {hoursLabel(p.freeHours)}
                {p.maxInterviews !== null ? ` · Most ${p.maxInterviews}` : ''}
              </span>
            )}
          </div>
        ))}
        <p className="iv-pf">{waiting ? 'Each board member said when they’re free in their own words.' : 'Pairing uses these hours and each person’s limit.'}</p>
      </section>

      {confirm ? (
        <Dialog title={`Email ${toEmail} ${toEmail === 1 ? 'applicant' : 'applicants'} to book a time?`} onClose={() => setConfirm(false)}>
          <p>
            Each gets the “Interview times are open” email with a link to pick one of the {chips.length} times in the Portal. You can still add times after this.
          </p>
          <div className="s-dlg-b">
            <button type="button" className="o-btn p lg" onClick={send} disabled={busy}>
              Email {toEmail} {toEmail === 1 ? 'applicant' : 'applicants'}
            </button>
            <button type="button" className="o-btn s lg" data-autofocus onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
