'use client';

// Scholarships > Selection (Figma "Scholarships > Selection", laptop and phone): the ranking by combined score and the
// meeting agenda with the award decisions. A row opens to show the interview summary, the six scores and the quotes.
// "Record the award" asks first (Figma "confirm the Legacy award") and can be undone until the letter goes out.
// Saving goes through lib/actions/selection.ts (in memory in mock mode).
import { useState } from 'react';
import type { RankRow, Recorded, SelectionData } from '@/lib/selection';
import { chooseNoExtra, recordAward, sendAgenda, undoAward } from '@/lib/actions/selection';
import { OIcon } from './icons';
import { PageHeader } from './page-header';
import { Ring } from './ring';
import { Dialog } from './sch-parts';
import './scholarships.css';

type Pending = { code: string; initials: string; kind: 'main' | 'extra' };

// One row of the ranking (laptop): rank, code, combined score, who scored what, the pill; opens to the details.
function LaptopRow({ r, open, onToggle }: { r: RankRow; open: boolean; onToggle: () => void }) {
  return (
    <div className={`s-rk${r.top ? ' tp' : ''}${open ? ' open' : ''}`}>
      <button type="button" className="s-rkh" aria-expanded={open} onClick={onToggle}>
        <span className="n">{r.rank}</span>
        <b>
          {r.code} {r.initials}
        </b>
        <strong>{r.combined}</strong>
        <span className={r.parts.length > 30 && r.chip ? 'p long' : 'p'}>{r.parts}</span>
        {r.chip ? <span className={`s-chip ${r.chip.kind}`}>{r.chip.text}</span> : null}
      </button>
      {open ? (
        <div className="s-rkd">
          <div>
            <b>Interview summary</b>
            <p>{r.detail.summary}</p>
          </div>
          <div className="s-rks">
            <p className="h">
              <span>Question</span>
              <span>{r.detail.names[0]}</span>
              <span>{r.detail.names[1]}</span>
            </p>
            {r.detail.scores.map((s) => (
              <p key={s.criterion}>
                <span>{s.criterion}</span>
                <b>{s.a}</b>
                <b>{s.b}</b>
              </p>
            ))}
          </div>
          {r.detail.quotes.length > 0 ? (
            <div>
              <b>Quotes</b>
              {r.detail.quotes.map((q) => (
                <p key={q}>{q}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SelectionView({ data }: { data: SelectionData }) {
  const [recorded, setRecorded] = useState<Recorded[]>(data.recorded);
  const [noExtra, setNoExtra] = useState(data.noExtra);
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>(() => Object.fromEntries(data.rows.filter((r) => r.open).map((r) => [r.code, true])));
  const [showMore, setShowMore] = useState(false);
  const [note, setNote] = useState('');

  const main = recorded.find((a) => a.kind === 'main');
  const extra = recorded.find((a) => a.kind === 'extra');
  const leg = data.legacy;
  const top0 = leg.candidates[0] ?? { code: '', initials: 'nobody yet' };
  const nameList = leg.candidates.map((c) => c.initials).join(' or ');
  const doneCount = (main ? 1 : 0) + (extra || noExtra ? 1 : 0);
  const nowLabel = !main ? (leg.tie ? 'Vote on the Legacy award' : 'Record the Legacy award') : !(extra || noExtra) ? 'Open an extra award' : data.callStep;
  const extraNames = data.extra.candidates.map((c) => c.initials).join(' or ');
  const allRows = [...data.rows, ...(showMore ? data.more : [])];

  async function confirm() {
    if (!pending) return;
    const p = pending;
    const award = p.kind === 'main' ? { name: data.legacy.name, cents: data.legacy.amount } : { name: data.extra.name, cents: Number(data.extra.amountLabel.replace(/[^0-9]/g, '')) * 100 };
    const res = await recordAward({
      cycleId: data.cycleId,
      applicationId: p.code,
      code: p.code,
      initials: p.initials,
      kind: p.kind,
      awardName: award.name,
      amountCents: award.cents,
      note: p.kind === 'main' ? (leg.tie ? `Vote, tie at ${leg.tieScore}` : 'Top score, no tie') : 'Decided at the selection meeting',
    });
    setPending(null);
    if (res.ok && res.id) {
      setRecorded((r) => [...r, { id: res.id as string, code: p.code, initials: p.initials, kind: p.kind, awardName: award.name, amountCents: award.cents }]);
      setChoosing(false);
      setNote('');
    } else setNote(res.message);
  }

  async function undo(a: Recorded) {
    const res = await undoAward(a.id);
    if (res.ok) setRecorded((r) => r.filter((x) => x.id !== a.id));
    else setNote(res.message);
  }

  async function skipExtra(v: boolean) {
    const res = await chooseNoExtra(v);
    if (res.ok) setNoExtra(v);
    else setNote(res.message);
  }

  async function send() {
    const res = await sendAgenda();
    setNote(res.message);
  }

  const dollar = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`;

  // The action buttons for the Legacy step.
  const legacyButtons = leg.tie ? (
    leg.candidates.map((c) => (
      <button type="button" key={c.code} className="s-sb" onClick={() => setPending({ code: c.code, initials: c.initials, kind: 'main' })}>
        Record {c.initials}
      </button>
    ))
  ) : (
    <button type="button" className="s-sb" onClick={() => setPending({ code: top0.code, initials: top0.initials, kind: 'main' })}>
      Record the award
    </button>
  );

  const extraButtons = choosing ? (
    <>
      {data.extra.candidates.map((c) => (
        <button type="button" key={c.code} className="s-sb" onClick={() => setPending({ code: c.code, initials: c.initials, kind: 'extra' })}>
          Record {c.initials}
        </button>
      ))}
      <button type="button" className="s-sb" onClick={() => setChoosing(false)}>
        Cancel
      </button>
    </>
  ) : (
    <>
      <button type="button" className="s-sb" onClick={() => setChoosing(true)}>
        Add an extra award
      </button>
      <button type="button" className="s-sb" onClick={() => void skipExtra(true)}>
        No extra award
      </button>
    </>
  );

  return (
    <div className="s-page s-sel">
      <PageHeader title="Selection" sub={<><span className="o-lg">{data.sub}</span><span className="o-ph">{data.phoneSub}</span></>} actionsClass="o-lg">
        <a className="o-btn s lg" href={data.meetingVideo} target="_blank" rel="noreferrer">
          Join the call
        </a>
        <button type="button" className="o-btn p lg" onClick={send}>
          Send the agenda
        </button>
      </PageHeader>

      <div className="s-sbody">
        {/* phone: the awards card */}
        <section className="o-card s-aw o-ph">
          <div>
            <b>
              {leg.name} · {leg.amountLabel} · 1 award
            </b>
            <p>
              {main
                ? `${main.initials} recorded.`
                : leg.tie
                  ? `${nameList}, by vote. Tie at ${leg.tieScore}, so a vote.`
                  : `${top0.initials} by score. Top score, no tie, so no vote.`}
              {main ? (
                <>
                  {' '}
                  <button type="button" className="o-ul" onClick={() => void undo(main)}>
                    Undo
                  </button>{' '}
                  until the letter goes out.
                </>
              ) : null}
            </p>
            {main ? null : <div className="s-acts">{legacyButtons}</div>}
          </div>
          <div className="opt">
            <b>Extra award · optional</b>
            <p>
              {extra
                ? `${extra.initials} recorded.`
                : noExtra
                  ? 'No extra award.'
                  : `Open one for ${extraNames}? ${data.extra.name}, ${data.extra.amountLabel}. Decided at the meeting.`}
              {extra ? (
                <>
                  {' '}
                  <button type="button" className="o-ul" onClick={() => void undo(extra)}>
                    Undo
                  </button>
                </>
              ) : noExtra ? (
                <>
                  {' '}
                  <button type="button" className="o-ul" onClick={() => void skipExtra(false)}>
                    Undo
                  </button>
                </>
              ) : null}
            </p>
            {extra || noExtra ? null : <div className="s-acts">{extraButtons}</div>}
          </div>
        </section>

        <section className="o-card s-panel s-rkp">
          <div className="s-ph o-lg s-rkph">
            <h2>Ranking by combined score</h2>
            <span>{data.total} applicants</span>
          </div>
          <div className="s-ph2 o-ph">
            <h2>Ranking</h2>
            <span>top combined score wins</span>
          </div>
          <p className="s-rule o-lg">The top combined score wins. A tie goes to a vote.</p>
          {allRows.map((r) => (
            <div key={r.code}>
              <div className="o-lg">
                <LaptopRow r={r} open={Boolean(openRows[r.code])} onToggle={() => setOpenRows((o) => ({ ...o, [r.code]: !o[r.code] }))} />
              </div>
              <div className="o-ph s-prow">
                <span className={`s-pn${r.top ? ' tp' : ''}`}>{r.rank}</span>
                <span className="t">
                  <b>
                    {r.code} · {r.initials}
                  </b>
                  <span>{r.chip ? r.chip.text.replace('Legacy, top score', 'Legacy, top score') : r.parts}</span>
                </span>
                <strong>{r.combined}</strong>
              </div>
            </div>
          ))}
          {data.moreCount > 0 ? (
            <button type="button" className="s-more" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
              <b className="o-lg">{showMore ? 'Show fewer' : `${data.moreCount} more`}</b>
              <b className="o-ph">{showMore ? 'Show fewer' : `${data.moreCount} more applicants`}</b>
              {data.moreNote ? <span className="o-ph">{data.moreNote}</span> : null}
            </button>
          ) : null}
        </section>

        <div className="s-sr">
          {/* laptop: the meeting agenda */}
          <section className="o-card s-panel s-ag o-lg">
            <div className="s-ph s-agh">
              <h2>Meeting agenda</h2>
              <span>{data.meetingDate}</span>
            </div>
            <div className="s-agc">
              <Ring frac={doneCount / 3} label={`${doneCount}/3`} color="gold" size={44} />
              <div>
                <b>Agenda items</b>
                <span>
                  {doneCount} of 3 done, now {nowLabel}
                </span>
              </div>
            </div>
            <div className="s-stp">
              {main ? <span className="s-sn done"><OIcon name="check" size={14} /></span> : <span className="s-sn">1</span>}
              <div>
                {main ? (
                  <>
                    <b>
                      {main.awardName} award recorded: {main.initials}
                    </b>
                    <span>
                      {main.code} {main.initials} · {dollar(main.amountCents)} ·{' '}
                      <button type="button" className="o-ul" onClick={() => void undo(main)}>
                        Undo
                      </button>{' '}
                      until the letter goes out
                    </span>
                  </>
                ) : (
                  <>
                    <b>{leg.tie ? `Vote on the Legacy award: ${nameList.replace(' or ', ' or ')}` : `Record the Legacy award: ${top0.initials}`}</b>
                    <span>{leg.tie ? `Tie at ${leg.tieScore}, goes to a vote` : 'Top score, no tie'}</span>
                    <div className="s-acts">{legacyButtons}</div>
                  </>
                )}
              </div>
            </div>
            <div className="s-stp">
              {extra || noExtra ? <span className="s-sn done"><OIcon name="check" size={14} /></span> : <span className="s-sn">2</span>}
              <div>
                {extra ? (
                  <>
                    <b>
                      {extra.awardName} award recorded: {extra.initials}
                    </b>
                    <span>
                      {extra.code} {extra.initials} · {dollar(extra.amountCents)} ·{' '}
                      <button type="button" className="o-ul" onClick={() => void undo(extra)}>
                        Undo
                      </button>{' '}
                      until the letter goes out
                    </span>
                  </>
                ) : noExtra ? (
                  <>
                    <b>No extra award</b>
                    <span>
                      <button type="button" className="o-ul" onClick={() => void skipExtra(false)}>
                        Undo
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <b>Open an extra award for {extraNames}?</b>
                    <span>
                      {data.extra.name}, {data.extra.amountLabel}
                    </span>
                    <div className="s-acts">{extraButtons}</div>
                  </>
                )}
              </div>
            </div>
            <div className="s-stp last">
              <span className="s-sn">3</span>
              <div>
                <b>{data.callStep}</b>
              </div>
            </div>
          </section>

          {/* phone: the meeting agenda card */}
          <section className="o-card s-pag o-ph">
            <div className="h">
              <Ring frac={doneCount / 3} label={`${doneCount}/3`} color="gold" size={44} />
              <span className="t">
                <b>Meeting agenda · {data.meetingDate}</b>
                <span>
                  {doneCount} of 3 done, now {nowLabel}
                </span>
              </span>
            </div>
            <div className="b">
              <a className="o-btn p xl s-pb j" href={data.meetingVideo} target="_blank" rel="noreferrer">
                Join the call
              </a>
              <button type="button" className="o-btn s xl s-pb" onClick={send}>
                Send the agenda
              </button>
            </div>
          </section>
        </div>
      </div>

      {note ? (
        <p className="s-note" role="status">
          {note}
        </p>
      ) : null}

      {pending ? (
        <Dialog title={`Record the ${pending.kind === 'main' ? data.legacy.name : data.extra.name} award?`} onClose={() => setPending(null)}>
          <p>
            {pending.code} {pending.initials} gets the {pending.kind === 'main' ? data.legacy.name : data.extra.name} Scholarship, {pending.kind === 'main' ? data.legacy.amountLabel : data.extra.amountLabel}. You can undo this until the award letter goes out.
          </p>
          <div className="s-dlg-b">
            <button type="button" className="o-btn p lg" onClick={confirm}>
              Record the award
            </button>
            <button type="button" className="o-btn s lg" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
