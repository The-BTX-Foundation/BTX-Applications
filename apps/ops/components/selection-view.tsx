'use client';

// Scholarships > Selection (Figma "Scholarships > Selection", laptop and phone): the ranking by combined score and the
// meeting agenda with the award decisions. A row opens to show the interview summary, the six scores and the quotes.
// The ranking is information only: the board discusses and decides (owner, 2026-10-12), so an admin can record the main
// award and any number of extra awards for any submitted applicant the board chooses. An extra award has no preset: the
// board types its name and amount (owner, 2026-10-12), and can add them until decisions are released. "Record the award"
// asks first (Figma "confirm the Legacy award") and can be undone until the letter goes out.
// Once the main award is recorded, a board member with admin rights gets "Release decisions" (Figma "Selection > Release
// decisions"): it asks first, then releases and sends the emails, and the page shows when it went out. Nobody else gets
// the button. Saving goes through lib/actions/selection.ts (in memory in mock mode). "Send the agenda" is hidden until
// email is set up (O8).
import { useState } from 'react';
import type { Candidate, RankRow, Recorded, SelectionData } from '@/lib/selection';
import { recordAward, releaseAndNotify, undoAward } from '@/lib/actions/selection';
import { addRefusal, agendaDone, AGENDA_STEPS, checkExtraAward, dollarsToCents, EXTRA_NAME_MAX } from '@/lib/award-input';
import { canShowRelease } from '@/lib/release';
import { emailLine, releaseBody, releaseCounts, releaseTitle, releasedWhen, type EmailOutcome } from '@/lib/release-copy';
import { OIcon } from './icons';
import { PageHeader } from './page-header';
import { Ring } from './ring';
import { Dialog } from './sch-parts';
import './scholarships.css';

/** Who gets which award; an extra award carries the name and amount the board typed. */
type Pending = { id: string; code: string; name: string; kind: 'main' | 'extra'; awardName: string; amountCents: number; amountLabel: string };

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

// The extra awards block: each recorded one, then "Add an extra award" and its inline form (name, whole dollars, who).
// The form keeps what was typed; "Record the award" (the Picker's button) checks it, then the confirm step asks.
function ExtraAwards({ extras, open, released, dollar, onUndo, onPick }: { extras: Recorded[]; open: Candidate[]; released: boolean; dollar: (cents: number) => string; onUndo: (a: Recorded) => void; onPick: (p: Omit<Pending, 'kind'>) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  function pick(c: Candidate) {
    const cents = dollarsToCents(amount);
    const check = checkExtraAward({ awardName: name, amountCents: cents });
    if (!check.ok) return setError(check.message);
    onPick({ id: c.id, code: c.code, name: c.name, awardName: check.awardName, amountCents: cents, amountLabel: dollar(cents) });
    setAdding(false);
    setName('');
    setAmount('');
    setError('');
  }

  return (
    <div className="s-xa-in">
      <b>Extra awards · optional</b>
      {extras.length === 0 ? <p>Add as many as the board decides. Each one gets its own name and amount.</p> : null}
      {extras.map((a) => (
        <p key={a.id} className="s-xr">
          <span>
            {a.awardName} · {dollar(a.amountCents)} · {a.name}
          </span>
          {released ? null : (
            <>
              {' '}
              <button type="button" className="o-ul" onClick={() => onUndo(a)}>
                Undo
              </button>
            </>
          )}
        </p>
      ))}
      {released ? (
        <p>Decisions have gone out.</p>
      ) : adding ? (
        <div className="s-xf">
          <label>
            <span>Award name</span>
            <input type="text" value={name} maxLength={EXTRA_NAME_MAX} placeholder="e.g. Empowerment Award" onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span>Amount</span>
            <span className="s-xd">
              <i aria-hidden="true">$</i>
              <input type="text" inputMode="numeric" value={amount} placeholder="500" aria-label="Amount in dollars" onChange={(e) => setAmount(e.target.value)} />
            </span>
          </label>
          <span className="s-xw">Who gets it</span>
          <Picker list={open} label="Who gets the extra award" onPick={pick} />
          {error ? (
            <p className="s-xe" role="alert">
              {error}
            </p>
          ) : null}
          <div className="s-acts">
            <button
              type="button"
              className="s-sb"
              onClick={() => {
                setAdding(false);
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="s-acts">
          <button type="button" className="s-sb" onClick={() => setAdding(true)}>
            Add an extra award
          </button>
        </div>
      )}
    </div>
  );
}

export function SelectionView({ data, isAdmin }: { data: SelectionData; isAdmin: boolean }) {
  const [recorded, setRecorded] = useState<Recorded[]>(data.recorded);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>(() => Object.fromEntries(data.rows.filter((r) => r.open).map((r) => [r.code, true])));
  const [showMore, setShowMore] = useState(false);
  const [note, setNote] = useState('');
  // Release decisions: the confirm step, the time it went out (kept from the page load, set again after a release here)
  // and what happened to the emails (known only right after a release here).
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releasedAt, setReleasedAt] = useState<string | null>(data.releasedAt);
  const [emails, setEmails] = useState<EmailOutcome | null>(null);

  const main = recorded.find((a) => a.kind === 'main');
  const extras = recorded.filter((a) => a.kind === 'extra');
  const leg = data.legacy;
  // Extra awards are optional, so they are not a step: the agenda is the main award, then the call.
  const doneCount = agendaDone(Boolean(main));
  const nowLabel = !main ? `Record the ${leg.name} award` : data.callStep;
  const released = Boolean(addRefusal(releasedAt));
  const showRelease = canShowRelease({ role: isAdmin ? 'admin' : null, hasMainAward: Boolean(main), releasedAt });
  // Everyone who applied gets a decision, scored or not (lib/email/send.ts sendDecisionEmails), so the count is every
  // submitted applicant, not only the ranked ones.
  const everyone = Math.max(data.total, data.candidates.length);
  const counts = { total: everyone, mainName: leg.name, extras: extras.length, recorded: recorded.length };
  // One award per applicant: someone who already has one is not offered again.
  const open = data.candidates.filter((c) => !recorded.some((a) => a.code === c.code));
  const allRows = [...data.rows, ...(showMore ? data.more : [])];

  async function confirm() {
    if (!pending) return;
    const p = pending;
    const res = await recordAward({
      cycleId: data.cycleId,
      applicationId: p.id,
      code: p.code,
      name: p.name,
      kind: p.kind,
      awardName: p.awardName,
      amountCents: p.amountCents,
      note: 'Decided by the board at the selection meeting',
    });
    setPending(null);
    if (res.ok && res.id) {
      setRecorded((r) => [...r, { id: res.id as string, code: p.code, name: p.name, kind: p.kind, awardName: p.kind === 'main' ? data.legacy.name : p.awardName, amountCents: p.amountCents }]);
      setNote('');
    } else setNote(res.message);
  }

  async function release() {
    setReleasing(true);
    const res = await releaseAndNotify(data.cycleId ?? '');
    setReleasing(false);
    setConfirmRelease(false);
    if (res.ok) {
      setReleasedAt(res.releasedAt);
      setEmails(res.emails);
      setNote('');
    } else setNote(res.message);
  }

  async function undo(a: Recorded) {
    const res = await undoAward(a.id);
    if (res.ok) setRecorded((r) => r.filter((x) => x.id !== a.id));
    else setNote(res.message);
  }

  const dollar = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`;

  // The main award step: the board's choice, from every submitted applicant.
  const legacyButtons = <Picker list={open} label={`Who gets the ${leg.name} award`} onPick={(c) => setPending({ id: c.id, code: c.code, name: c.name, kind: 'main', awardName: data.legacy.awardName, amountCents: data.legacy.amount, amountLabel: data.legacy.amountLabel })} />;

  // Extra awards (phone card and laptop agenda): the ones recorded, and a form to add another until decisions go out.
  const extraAwards = (
    <ExtraAwards
      extras={extras}
      open={open}
      released={released}
      dollar={dollar}
      onUndo={(a) => void undo(a)}
      onPick={(p) => setPending({ ...p, kind: 'extra' })}
    />
  );

  return (
    <div className="s-page s-sel">
      <PageHeader title="Selection" sub={<><span className="o-lg">{data.sub}</span><span className="o-ph">{data.phoneSub}</span></>} actionsClass="o-lg">
        {releasedAt ? (
          <div className="s-rel">
            <p>
              <OIcon name="check" size={18} />
              Released {releasedWhen(releasedAt)}
            </p>
            {emails ? <span>{emailLine(emails)}</span> : null}
          </div>
        ) : null}
        {!releasedAt && data.meetingVideo ? (
          <a className="o-btn s lg" href={data.meetingVideo} target="_blank" rel="noreferrer">
            Join the call
          </a>
        ) : null}
        {showRelease ? (
          <button type="button" className="o-btn p lg" onClick={() => setConfirmRelease(true)}>
            Release decisions
          </button>
        ) : null}
        {!releasedAt && main && !isAdmin ? <span className="s-rel-w">Decisions are not released yet</span> : null}
      </PageHeader>

      <div className="s-sbody">
        {/* phone: the release card */}
        {releasedAt ? (
          <section className="o-card s-rl o-ph">
            <b>
              <OIcon name="check" size={18} />
              Released {releasedWhen(releasedAt)}
            </b>
            <p>{releaseCounts(counts)}</p>
            {emails ? <p>{emailLine(emails)}</p> : null}
          </section>
        ) : main ? (
          <section className="o-card s-rl o-ph">
            <b>The main award is recorded</b>
            <p>{isAdmin ? 'Students hear nothing until you release.' : 'Students hear nothing until a board member with admin rights releases decisions.'}</p>
            {showRelease ? (
              <button type="button" className="o-btn p xl s-rlb" onClick={() => setConfirmRelease(true)}>
                Release decisions
              </button>
            ) : null}
          </section>
        ) : null}
        {/* phone: the awards card */}
        <section className="o-card s-aw o-ph">
          <div>
            <b>
              {leg.name} · {leg.amountLabel} · 1 award
            </b>
            <p>
              {main ? `${main.name} recorded.` : 'The board discusses and decides.'}
              {main && !released ? (
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
          <div className="opt">{extraAwards}</div>
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
          {allRows.length === 0 ? <p className="s-rke">No scores yet. The ranking fills in as board members score interviews.</p> : null}
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
              <Ring frac={doneCount / AGENDA_STEPS} label={`${doneCount}/${AGENDA_STEPS}`} color="gold" size={44} />
              <div>
                <b>Agenda items</b>
                <span>
                  {doneCount} of {AGENDA_STEPS} done, now {nowLabel}
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
                      {main.code} · {dollar(main.amountCents)}
                      {released ? null : (
                        <>
                          {' · '}
                          <button type="button" className="o-ul" onClick={() => void undo(main)}>
                            Undo
                          </button>{' '}
                          until the letter goes out
                        </>
                      )}
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
            <div className="s-stp last">
              <span className="s-sn">2</span>
              <div>
                <b>{data.callStep}</b>
              </div>
            </div>
            <div className="s-xa">{extraAwards}</div>
          </section>

          {/* phone: the meeting agenda card */}
          <section className="o-card s-pag o-ph">
            <div className="h">
              <Ring frac={doneCount / AGENDA_STEPS} label={`${doneCount}/${AGENDA_STEPS}`} color="gold" size={44} />
              <span className="t">
                <b>Meeting agenda · {data.meetingDate}</b>
                <span>
                  {doneCount} of {AGENDA_STEPS} done, now {nowLabel}
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

      {confirmRelease ? (
        <Dialog title={releaseTitle(everyone)} onClose={() => (releasing ? undefined : setConfirmRelease(false))}>
          <p>{releaseBody(releaseCounts({ ...counts, won: true }))}</p>
          <div className="s-dlg-b">
            <button type="button" className="o-btn p lg" disabled={releasing} onClick={() => void release()}>
              {releasing ? 'Releasing...' : 'Release decisions'}
            </button>
            <button type="button" className="o-btn s lg" data-autofocus disabled={releasing} onClick={() => setConfirmRelease(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      ) : null}

      {pending ? (
        <Dialog title={pending.kind === 'main' ? `Record the ${data.legacy.name} award?` : `Record ${pending.awardName}?`} onClose={() => setPending(null)}>
          <p>
            {pending.name} ({pending.code}) gets {pending.kind === 'main' ? `the ${data.legacy.name} Scholarship` : pending.awardName}, {pending.amountLabel}. You can undo this until the award letter goes out.
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
