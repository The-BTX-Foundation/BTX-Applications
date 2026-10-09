'use client';

// Scholarships > Awardees (Figma "Scholarships > Awardees, on Oct 26", laptop and phone): who won, where each follow-up
// stands, and the five awardee steps for the one you pick. Steps can be ticked ("Funds sent" also logs the amount on
// Budget). Past terms show the awards entered by hand for history. Saving goes through lib/actions/awardees.ts
// (in memory in mock mode).
import { useState } from 'react';
import type { AwardeeRow, AwardeesData } from '@/lib/awardees';
import { sendReminder, setStepDone } from '@/lib/actions/awardees';
import { OIcon } from './icons';
import { PageHeader } from './page-header';
import { ScoreRing } from './sch-parts';
import './scholarships.css';

export function AwardeesView({ data }: { data: AwardeesData }) {
  const [term, setTerm] = useState(data.term);
  const [rows, setRows] = useState<AwardeeRow[]>(data.awardees);
  // The default pick is the awardee with the fewest steps done (the one that needs the most follow-up).
  const [pick, setPick] = useState(() => [...data.awardees].sort((a, b) => a.done - b.done)[0]?.awardId ?? '');
  const [note, setNote] = useState('');
  const current = term === data.term;
  const sel = rows.find((r) => r.awardId === pick) ?? rows[0];
  const pastRows = data.past.filter((p) => term === 'All past' || p.term === term);

  // Ticks or unticks a step of the picked awardee, then updates the screen from the answer.
  async function toggle(row: AwardeeRow, step: number, done: boolean) {
    const res = await setStepDone(row.awardId, step, done);
    if (!res.ok) {
      setNote(res.message);
      return;
    }
    setNote('');
    setRows((all) =>
      all.map((r) => {
        if (r.awardId !== row.awardId) return r;
        const steps = r.steps.map((s) => (s.step === step ? { ...s, state: done ? ('done' as const) : ('todo' as const), sub: done ? 'Done today' : 'Not started' } : s));
        const firstOpen = steps.find((s) => s.state !== 'done')?.step;
        const next = steps.map((s) => (s.state === 'done' ? s : { ...s, state: s.step === firstOpen ? ('now' as const) : ('todo' as const) }));
        const cur = next.find((s) => s.state === 'now');
        return { ...r, steps: next, done: next.filter((s) => s.state === 'done').length, currentSub: cur?.sub ?? 'All five steps are done' };
      }),
    );
  }

  async function remind(row: AwardeeRow) {
    const cur = row.steps.find((s) => s.state === 'now');
    const res = await sendReminder(row.awardId, cur?.step ?? 2);
    setNote(res.message);
  }

  const terms = [data.term, ...data.terms.filter((t) => t !== data.term), 'All past'];

  return (
    <div className="s-page s-awd">
      <PageHeader title="Awardees" sub={<><span className="o-lg">{data.sub}</span><span className="o-ph">{data.phoneSub}</span></>}>
        <div className="o-seg o-lg" role="group" aria-label="Term">
          {terms.map((t) => (
            <button type="button" key={t} className={term === t ? 'on' : undefined} aria-pressed={term === t} onClick={() => setTerm(t)}>
              {t === 'All past' ? (
                <>
                  <span>All past</span> <b>{data.pastCount}</b>
                </>
              ) : (
                t
              )}
            </button>
          ))}
        </div>
        <label className="s-chipsel o-ph">
          <span>{term}</span>
          <OIcon name="down" size={22} />
          <select value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term">
            {terms.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>

      {current ? (
        <div className="s-abody">
          {/* laptop: the awardees table */}
          <section className="o-card s-panel s-tb o-lg">
            <div className="s-th s-ath">
              <span>Awardee</span>
              <span>Award</span>
              <span>Amount</span>
              <span>Letter</span>
              <span>Accepted</span>
              <span>Payment</span>
              <span>Follow-up</span>
            </div>
            {rows.map((r) => (
              <button type="button" key={r.awardId} className={`s-atr${r.awardId === sel?.awardId ? ' pick' : ''}`} onClick={() => setPick(r.awardId)}>
                <span className="c">
                  <b>{r.code}</b>
                  <span>{r.initials}</span>
                </span>
                <span className="a">
                  <i>{r.awardName}</i>
                  {r.note ? <span>{r.note}</span> : null}
                </span>
                <b className="m">{r.amountLabel}</b>
                <span className="c">
                  <b>{r.cells.letter[0]}</b>
                  <span>{r.cells.letter[1]}</span>
                </span>
                <span className={`c${r.cells.waiting ? ' w' : ''}`}>
                  <b>{r.cells.accepted[0]}</b>
                  <span>{r.cells.accepted[1]}</span>
                </span>
                <span className="c">
                  <b>{r.cells.payment[0]}</b>
                  {r.cells.payment[1] ? <span>{r.cells.payment[1]}</span> : null}
                </span>
                <ScoreRing n={r.done} of={5} size={38} />
              </button>
            ))}
            <p className="s-tot">
              <b>{data.total}</b>
              <span>{data.totalParts}</span>
            </p>
          </section>

          {/* laptop: the awardee detail */}
          {sel ? (
            <aside className="o-card s-panel s-dt o-lg">
              <div className="s-dh">
                <p>
                  <OIcon name="scholarships" size={15} />
                  <span>{sel.awardName}</span>
                  <i />
                  <span>{sel.amountLabel}</span>
                </p>
                <h2>
                  {sel.code} · {sel.initials}
                </h2>
                <p className="n">{sel.fullName}</p>
              </div>
              <div className="s-agc">
                <ScoreRing n={sel.done} of={5} size={44} />
                <div>
                  <b>Awardee steps</b>
                  <span>
                    {sel.done} of 5 done, now {sel.steps.find((s) => s.state === 'now')?.title ?? 'nothing, all done'}
                  </span>
                </div>
              </div>
              {sel.steps.map((s) => (
                <div key={s.step} className={`s-stp${s.state === 'now' ? ' now' : ''}`}>
                  <button
                    type="button"
                    className={`s-sn${s.state === 'done' ? ' done' : s.state === 'now' ? ' now' : ''}`}
                    aria-label={`${s.title}: ${s.state === 'done' ? 'done' : 'not done'}`}
                    aria-pressed={s.state === 'done'}
                    onClick={() => void toggle(sel, s.step, s.state !== 'done')}
                  >
                    {s.state === 'done' ? <OIcon name="check" size={14} /> : s.step}
                  </button>
                  <div>
                    <b>{s.title}</b>
                    <span className={`${s.state === 'now' ? 'bold' : ''}${s.sub.length <= 54 ? ' nw' : ''}`.trim() || undefined}>{s.sub}</span>
                  </div>
                </div>
              ))}
              <div className="s-da">
                <button type="button" className="o-btn p xl" onClick={() => void remind(sel)}>
                  Send another reminder
                </button>
                <a className="o-btn s xl" href={`mailto:${sel.email}`}>
                  Call or email
                </a>
              </div>
              {sel.comment ? (
                <div className="s-cmt">
                  <span className="s-av cm">{sel.comment.byInitials}</span>
                  <div>
                    <b>{sel.comment.by}</b>
                    <p>{sel.comment.text}</p>
                  </div>
                </div>
              ) : null}
            </aside>
          ) : null}

          {/* phone: one card per awardee, then the follow-up card */}
          <div className="s-pawd o-ph">
            {rows.map((r) => (
              <section key={r.awardId} className="o-card s-awc" onClick={() => setPick(r.awardId)}>
                <div className="t">
                  <ScoreRing n={r.done} of={5} size={44} />
                  <span>
                    <b>
                      {r.code} · {r.initials}
                    </b>
                    <strong>
                      {r.awardName} · {r.amountLabel}
                    </strong>
                    {r.note ? <span>{r.note}</span> : null}
                  </span>
                </div>
                <div className="g">
                  <span>
                    <i>Letter</i>
                    <b>
                      {r.cells.letter[0]} {r.cells.letter[1]}
                    </b>
                  </span>
                  <span>
                    <i>Accepted</i>
                    <b>{r.cells.waiting ? (r.cells.accepted[1].startsWith('Since') ? r.cells.accepted[1] : `${r.cells.accepted[0]} ${r.cells.accepted[1]}`) : r.cells.accepted[1]}</b>
                  </span>
                  <span>
                    <i>Payment</i>
                    <b>{r.cells.payment[1] ? r.cells.payment[1] : r.cells.payment[0]}</b>
                  </span>
                </div>
              </section>
            ))}
            {sel ? (
              <section className="o-card s-awa">
                <b>{sel.currentTitle}</b>
                <p>{sel.currentSub}</p>
                <div>
                  <button type="button" className="o-btn p xl s-pw" onClick={() => void remind(sel)}>
                    Send another reminder
                  </button>
                  <a className="o-btn s xl s-pw" href={`mailto:${sel.email}`}>
                    Call or email
                  </a>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : (
        <section className="o-card s-panel s-past">
          <div className="s-th s-pth">
            <span>Awardee</span>
            <span>Award</span>
            <span>Amount</span>
            <span>Term</span>
          </div>
          {pastRows.length === 0 ? <p className="s-ln">No awards entered for this term.</p> : null}
          {pastRows.map((p) => (
            <div className="s-tr s-ptr" key={p.id}>
              <b>{p.label}</b>
              <span>{p.awardName}</span>
              <b>{p.amountLabel}</b>
              <span>{p.term}</span>
            </div>
          ))}
        </section>
      )}
      {note ? (
        <p className="s-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
