'use client';

// Scholarships > Selection (Figma "Scholarships > Selection", laptop and phone): the ranking by combined score and the
// meeting agenda with the award decisions. A row opens to show the interview summary, the six scores and the quotes.
// The ranking is information only: the board discusses and decides (owner, 2026-10-12), so an admin can record the main
// award and an extra award for any submitted applicant the board chooses. "Record the award" asks first (Figma "confirm the Legacy award") and can be undone until the letter goes out.
// Saving goes through lib/actions/selection.ts (in memory in mock mode). "Send the agenda" is hidden until email is set up
// (O8); the extra-award picker stays as built (design pending).
import { useState } from 'react';
import type { Candidate, RankRow, Recorded, SelectionData } from '@/lib/selection';
import { chooseNoExtra, recordAward, undoAward } from '@/lib/actions/selection';
import { OIcon } from './icons';
import { PageHeader } from './page-header';
import { Ring } from './ring';
import { Dialog } from './sch-parts';
import './scholarships.css';

type Pending = { id: string; code: string; name: string; kind: 'main' | 'extra' };

// One row of the ranking (laptop): rank, name and code, combined score, who scored what; opens to the details.
function LaptopRow({ r, open, onToggle }: { r: RankRow; open: boolean; onToggle: () => void }) {
  return (
    <div className={`s-rk${open ? ' open' : ''}`}>
      <button type="button" className="s-rkh" aria-expanded={open} onClick={onToggle}>
        <span className="n">{r.rank}</span>
        <span className="who">
          <b>{r.name}</b>
          <span>{r.code}</span>
        </span>
        <strong>{r.combined}</strong>
        <span className="p">{r.parts}</span>
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

// Choose who gets an award: any submitted applicant (ranked ones first, with their combined score), then record it.
function Picker({ list, label, onPick }: { list: Candidate[]; label: string; onPick: (c: Candidate) => void }) {
  const [id, setId] = useState('');
  const picked = list.find((c) => c.id === id);
  if (list.length === 0) return <p className="s-pick">No submitted applicants yet.</p>;
  return (
    <div className="s-pick">
      <select value={id} onChange={(e) => setId(e.target.value)} aria-label={label}>
        <option value="">Choose the applicant</option>
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {`${c.name} · ${c.code}${c.combined ? ` · ${c.combined}` : ' · not scored yet'}`}
          </option>
        ))}
      </select>
      <button type="button" className="s-sb" disabled={!picked} onClick={() => picked && onPick(picked)}>
        Record the award
      </button>
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
  const doneCount = (main ? 1 : 0) + (extra || noExtra ? 1 : 0);
  const nowLabel = !main ? `Record the ${leg.name} award` : !(extra || noExtra) ? 'Open an extra award' : data.callStep;
  // One award per applicant: someone who already has one is not offered again.
  const open = data.candidates.filter((c) => !recorded.some((a) => a.code === c.code));
  const allRows = [...data.rows, ...(showMore ? data.more : [])];

  async function confirm() {
    if (!pending) return;
    const p = pending;
    const award = p.kind === 'main' ? { name: data.legacy.awardName, cents: data.legacy.amount } : { name: data.extra.name, cents: data.extra.amountCents };
    const res = await recordAward({
      cycleId: data.cycleId,
      applicationId: p.id,
      code: p.code,
      name: p.name,
      kind: p.kind,
      awardName: award.name,
      amountCents: award.cents,
      note: 'Decided by the board at the selection meeting',
    });
    setPending(null);
    if (res.ok && res.id) {
      setRecorded((r) => [...r, { id: res.id as string, code: p.code, name: p.name, kind: p.kind, awardName: p.kind === 'main' ? data.legacy.name : award.name, amountCents: award.cents }]);
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

  const dollar = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`;

  // The main award step: the board's choice, from every submitted applicant.
  const legacyButtons = <Picker list={open} label={`Who gets the ${leg.name} award`} onPick={(c) => setPending({ id: c.id, code: c.code, name: c.name, kind: 'main' })} />;

  const extraButtons = choosing ? (
    <>
      <Picker list={open} label={`Who gets the ${data.extra.name} award`} onPick={(c) => setPending({ id: c.id, code: c.code, name: c.name, kind: 'extra' })} />
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
        {data.meetingVideo ? (
          <a className="o-btn s lg" href={data.meetingVideo} target="_blank" rel="noreferrer">
            Join the call
          </a>
        ) : null}
      </PageHeader>

      <div className="s-sbody">
        {/* phone: the awards card */}
        <section className="o-card s-aw o-ph">
          <div>
            <b>
              {leg.name} · {leg.amountLabel} · 1 award
            </b>
            <p>
              {main ? `${main.name} recorded.` : 'The board discusses and decides.'}
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
                ? `${extra.name} recorded.`
                : noExtra
                  ? 'No extra award.'
                  : `${data.extra.name}, ${data.extra.amountLabel}. Decided at the meeting.`}
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
            <span>the board decides</span>
          </div>
          <p className="s-rule o-lg">Ranking by combined score. The board discusses and decides.</p>
          {allRows.map((r) => (
            <div key={r.code}>
              <div className="o-lg">
                <LaptopRow r={r} open={Boolean(openRows[r.code])} onToggle={() => setOpenRows((o) => ({ ...o, [r.code]: !o[r.code] }))} />
              </div>
              <div className="o-ph s-prow">
                <span className="s-pn">{r.rank}</span>
                <span className="t">
                  <b>{r.name}</b>
                  <span>
                    {r.code} · {r.parts}
                  </span>
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
                      {main.awardName} award recorded: {main.name}
                    </b>
                    <span>
                      {main.code} · {dollar(main.amountCents)} ·{' '}
                      <button type="button" className="o-ul" onClick={() => void undo(main)}>
                        Undo
                      </button>{' '}
                      until the letter goes out
                    </span>
                  </>
                ) : (
                  <>
                    <b>{`Record the ${leg.name} award`}</b>
                    <span>The board discusses and decides. {leg.amountLabel}.</span>
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
                      {extra.awardName} award recorded: {extra.name}
                    </b>
                    <span>
                      {extra.code} · {dollar(extra.amountCents)} ·{' '}
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
                    <b>Open an extra award?</b>
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
            {data.meetingVideo ? (
              <div className="b">
                <a className="o-btn p xl s-pb j" href={data.meetingVideo} target="_blank" rel="noreferrer">
                  Join the call
                </a>
              </div>
            ) : null}
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
            {pending.name} ({pending.code}) gets the {pending.kind === 'main' ? data.legacy.name : data.extra.name} Scholarship, {pending.kind === 'main' ? data.legacy.amountLabel : data.extra.amountLabel}. You can undo this until the award letter goes out.
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
