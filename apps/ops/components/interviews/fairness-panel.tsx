'use client';

// "Interviews per board member" and "Booked interviews" (Figma "Options: interview flow": one person over target,
// confirm rebalance, after rebalancing). Each bar is a board member's interviews against an even target; "Rebalance
// future interviews" (admin rights) moves only interviews more than 48 hours away and every interview keeps two people.
// Live changes go through lib/actions/interviews.ts and the page reloads; in mock mode the panel keeps the change itself.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FairData, UpcomingInterview } from '@/lib/interviews';
import { previewRebalanceAction, rebalanceAction } from '@/lib/actions/interviews';
import { affected, barScale, evenNote, joinNames, limitNote, moveLine, overNote, rebalanceConfirm, targetLine, whenLine, type MoveView } from '@/lib/interview-times';
import { FLOW_BOOKED, FLOW_MOVES } from '@/mock/interview-flow';
import { staffById } from '@/mock/staff';
import { Dialog } from '../sch-parts';
import '../scholarships.css';
import './interview-flow.css';

const QUESTIONS_HREF = '/scholarships/interviews/questions';

const Alert = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="9" r="9" fill="currentColor" />
    <path d="M9 4.6v5.2" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="9" cy="13" r="1.1" fill="var(--surface)" />
  </svg>
);

const CheckCircle = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="10" cy="10" r="8" />
    <path d="M6.3 10.3l2.6 2.6 4.8-5.2" />
  </svg>
);

// The mock story's three moves with names (the same ones the frames show).
function mockMoves(): MoveView[] {
  return FLOW_MOVES.map((m) => {
    const b = FLOW_BOOKED.find((x) => x.slotId === m.slotId)!;
    return { slotId: m.slotId, startsAt: b.startsAt, applicant: b.applicant, from: m.from, to: m.to, fromName: staffById(m.from)?.display_name ?? '', toName: staffById(m.to)?.display_name ?? '' };
  });
}

export function FairnessSection({
  fair,
  upcoming,
  bookedCount,
  applicantCount,
  cycleId,
  isAdmin,
  mock,
  moved,
  onMoved,
  onNote,
  onPair,
}: {
  fair: FairData;
  upcoming: UpcomingInterview[];
  bookedCount: number;
  applicantCount: number;
  cycleId: string | null;
  isAdmin: boolean;
  mock: boolean;
  /** The line after a rebalance ("Moved 3 interviews, ..."); empty before one. */
  moved: string;
  onMoved: (m: string) => void;
  onNote: (m: string) => void;
  onPair: () => void;
}) {
  const router = useRouter();
  const [people, setPeople] = useState(fair.people);
  const [rows, setRows] = useState(upcoming);
  const [confirm, setConfirm] = useState<{ moves: MoveView[] | null; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const { base, line } = targetLine(people, fair.interviews);
  const scale = barScale(people.map((p) => p.interviews));
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100).toFixed(2)}%`;
  const moves = confirm?.moves ?? [];

  async function openConfirm() {
    setConfirm({ moves: null, message: '' });
    if (mock) return setConfirm({ moves: mockMoves(), message: '' });
    const r = await previewRebalanceAction(cycleId ?? '');
    setConfirm({ moves: r.ok ? r.moves : [], message: r.message });
  }

  async function runMoves() {
    if (!confirm?.moves) return;
    setBusy(true);
    const r = await rebalanceAction(cycleId ?? '');
    setBusy(false);
    setConfirm(null);
    if (!r.ok) return onNote(r.message);
    if (mock) {
      const mv = confirm.moves;
      setPeople((ps) => ps.map((p) => ({ ...p, interviews: p.interviews - mv.filter((m) => m.from === p.userId).length + mv.filter((m) => m.to === p.userId).length })).map((p) => ({ ...p, overBy: p.target === null ? 0 : p.interviews - p.target })));
      setRows((rs) =>
        rs.map((row) => {
          const m = mv.find((x) => x.slotId === row.slotId);
          if (!m) return row;
          const to = staffById(m.to);
          return { ...row, pair: row.pair.map((p) => (p.userId === m.from && to ? { userId: to.user_id, name: to.display_name, initials: to.initials } : p)) };
        }),
      );
      const now = new Date().toISOString();
      return onMoved(`Moved ${mv.length} ${mv.length === 1 ? 'interview' : 'interviews'}, ${whenLine(now)}. ${joinNames(affected(mv))} got an email.`);
    }
    onMoved(r.message);
    router.refresh();
  }

  return (
    <div className="iv-cols fair">
      <section className="o-card s-panel iv-main" aria-label="Interviews per board member">
        <div className="iv-ph">
          <h2>
            <span className="o-lg">Interviews per board member</span>
            <span className="o-ph">Interviews per person</span>
          </h2>
          <span>Needs admin rights</span>
        </div>
        <div className="iv-head done" style={{ paddingBottom: 12 }}>
          {moved ? (
            <h3>
              <span className="iv-ok">
                <CheckCircle />
              </span>
              <span>{moved}</span>
            </h3>
          ) : null}
          <h3 style={moved ? { marginTop: 8, display: 'block', fontSize: 16 } : { display: 'block', fontSize: 16 }}>{line}</h3>
          <p>{moved ? evenNote(people, base) : 'The line on each bar marks the target. Limits come from each person’s availability.'}</p>
          {isAdmin && !moved ? (
            <div className="iv-acts o-ph">
              <button type="button" className="o-btn p" onClick={openConfirm}>
                Rebalance future interviews
              </button>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>Nothing within 48 hours moves.</span>
            </div>
          ) : null}
        </div>
        {people.map((p) => {
          const over = overNote(p);
          const lim = limitNote(p);
          const bar = (
            <div className={`iv-bar${over?.flag ? ' hi' : ''}`} role="img" aria-label={`${p.name}: ${p.interviews} interviews${p.target !== null ? `, target ${p.target}` : ''}`}>
              <i style={{ width: pct(p.interviews) }} />
              {p.target !== null ? <u style={{ left: pct(base) }} /> : null}
            </div>
          );
          const note = over ? (
            <span className={`iv-fn${over.flag ? ' flag' : ''}`}>
              {over.flag ? <Alert /> : null}
              {over.text}
            </span>
          ) : lim ? (
            <span className="iv-fn">{lim}</span>
          ) : !p.sent ? (
            <span className="iv-fn">Hasn’t sent availability</span>
          ) : (
            <span className="iv-fn" />
          );
          return (
            <div className="iv-fr" key={p.userId}>
              <div className="iv-top o-ph">
                <b>{p.name}</b>
                <span className="iv-ct">{p.interviews}</span>
              </div>
              <b className="o-lg">{p.name}</b>
              {bar}
              <span className="iv-ct o-lg">{p.interviews}</span>
              {note}
            </div>
          );
        })}
        {fair.needsTwo.length > 0 ? (
          <div className="iv-two">
            <b>
              {fair.needsTwo.length} booked {fair.needsTwo.length === 1 ? 'interview needs' : 'interviews need'} two interviewers
            </b>
            <ul>
              {fair.needsTwo.map((n) => (
                <li key={n.slotId}>
                  {n.when} · {n.applicant} · {n.code}
                </li>
              ))}
            </ul>
            {isAdmin ? (
              <button type="button" className="o-btn s" onClick={onPair}>
                Pair them now
              </button>
            ) : null}
          </div>
        ) : null}
        {isAdmin && !moved ? (
          <div className="iv-fa o-lg">
            <button type="button" className="o-btn p" onClick={openConfirm}>
              Rebalance future interviews
            </button>
            <span>Nothing within 48 hours moves.</span>
          </div>
        ) : null}
      </section>

      <section className="o-card s-panel iv-side" aria-label="Booked interviews">
        <div className="iv-ph">
          <h2>Booked interviews</h2>
          <span>
            {bookedCount} of {applicantCount} booked
          </span>
        </div>
        {rows.length === 0 ? <p className="iv-pf">No interviews are coming up.</p> : null}
        {rows.map((r) => (
          <div className="iv-bk" key={r.slotId}>
            <b>{r.whenLine}</b>
            <Link className="o-ul" href={QUESTIONS_HREF}>
              Questions
            </Link>
            <span>
              {r.code} · {r.applicant}
            </span>
            <span className="pair">{r.pair.length === 0 ? 'Needs two interviewers' : r.pair.map((p) => p.name).join(' + ')}</span>
            {r.mine ? (
              <span className="iv-yr">
                <i />
                Yours
                {r.videoUrl ? (
                  <a href={r.videoUrl} target="_blank" rel="noreferrer">
                    Join video
                  </a>
                ) : null}
              </span>
            ) : null}
          </div>
        ))}
      </section>

      {confirm ? (
        <Dialog title="Rebalance future interviews?" onClose={() => setConfirm(null)}>
          {confirm.moves === null ? (
            <p>Checking what would move.</p>
          ) : confirm.message ? (
            <p>{confirm.message}</p>
          ) : (
            <>
              <p>{rebalanceConfirm(moves)}</p>
              {moves.length > 0 ? (
                <ul className="iv-mv">
                  {moves.map((m) => (
                    <li key={m.slotId}>{moveLine(m)}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
          <div className="s-dlg-b">
            {confirm.moves && moves.length > 0 && !confirm.message ? (
              <button type="button" className="o-btn p lg" onClick={runMoves} disabled={busy}>
                Move {moves.length} {moves.length === 1 ? 'interview' : 'interviews'}
              </button>
            ) : null}
            <button type="button" className="o-btn s lg" data-autofocus onClick={() => setConfirm(null)}>
              {moves.length > 0 && !confirm.message ? 'Cancel' : 'Close'}
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
