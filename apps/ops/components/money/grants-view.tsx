'use client';

// Finance > Grants (Figma laptop and phone): the getting-started checklist, then the pipeline by stage (Researching,
// Submitted, ...; a stage with no grants is only a count in the line at the bottom). Data: lib/grants.ts. "Add a grant" is
// "Coming soon" for now (owner, 2026-10-12): a disabled control with a small label (./soon.tsx); lib/money-writes.ts
// keeps addGrant for later.
import { useState } from 'react';
import { MOCK_NOW } from '@/mock/applicants';
import { PageHeader } from '@/components/page-header';
import { dateOnlyLabel } from '@/lib/format';
import { useMockState } from '@/lib/mock-store';
import { GRANT_STAGES, usd, type GrantRow, type GrantsData, type GrantStage } from '@/lib/money-shared';
import { SoonHeaderAction } from './soon';
import { WhoMark } from './ui';
import { WideChecklistPanel } from './wide-checklist';

const STAGE_NAME: Record<GrantStage, string> = { researching: 'Researching', writing: 'Writing', submitted: 'Submitted', decided: 'Decided' };
const SHOWN = 2;

// The laptop's last line inside the final stage: the stages with no grants, "Writing 0 · Decided 0".
function Foot({ stages }: { stages: GrantStage[] }) {
  if (stages.length === 0) return null;
  return (
    <p className="mn-gfoot o-lg">
      {stages.map((st, i) => (
        <span key={st}>
          {i > 0 ? ' · ' : ''}
          {STAGE_NAME[st]} <b>0</b>
        </span>
      ))}
    </p>
  );
}

type State = Pick<GrantsData, 'count' | 'counts' | 'grants'>;

// "[Funder] · up to $10,000".
function funderLine(g: GrantRow) {
  const amt = g.amount_cents == null ? '' : `${g.amount_is_up_to ? 'up to ' : ''}${usd(g.amount_cents)}`;
  return `${g.funder ?? '[Funder]'}${amt ? ` · ${amt}` : ''}`;
}

// What the third column says: the deadline, the note, or when it was submitted or decided.
function dateLine(g: GrantRow) {
  if (g.stage === 'submitted' && g.submitted_on) return `Submitted ${dateOnlyLabel(g.submitted_on)}`;
  if (g.date_note) return g.date_note;
  return `Deadline ${g.deadline_on ? dateOnlyLabel(g.deadline_on) : '[date]'}`;
}

export function GrantsView({ data, demo }: { data: GrantsData; demo?: string }) {
  const live = data.mode === 'live';
  const initial: State = { count: data.count, counts: data.counts, grants: data.grants };
  const [mock] = useMockState<State>(`grants:${demo ?? ''}`, initial);
  const s = live ? initial : mock;
  const [all, setAll] = useState(false);
  // Who is "building the first list": the owner of the next checklist step.
  const next = data.checklist.steps.find((x) => x.current);
  const builder = next?.owner.kind === 'person' ? next.owner.name : null;

  const stages = GRANT_STAGES.filter((st) => s.counts[st] > 0);
  const empty = GRANT_STAGES.filter((st) => s.counts[st] === 0);
  const sub = `${s.count === 0 ? 'No grants yet' : `${s.count} grant${s.count === 1 ? '' : 's'}`}${builder ? ` · ${builder} is building the first list` : ''}`;

  return (
    <>
      <PageHeader
        title="Grants"
        sub={
          <>
            <span className="o-lg">{sub}</span>
            <span className="o-ph">{`Finance · ${sub.split(' · ')[0]}`}</span>
          </>
        }
        actionsClass="mn-acts"
      >
        <SoonHeaderAction label="Add a grant" />
      </PageHeader>

      <div className="mn-gstack">
        <WideChecklistPanel list={data.checklist} only="lg" />

        {stages.map((st) => {
          const rows = s.grants.filter((g) => g.stage === st);
          const shown = all || rows.length <= SHOWN ? rows : rows.slice(0, SHOWN);
          const hidden = s.counts[st] > shown.length || (!all && rows.length > SHOWN);
          return (
            <section key={st} className="o-card mn-panel mn-stage" aria-label={STAGE_NAME[st]}>
              <div className="mn-ph">
                <h2>{STAGE_NAME[st]}</h2>
                <span className="mn-cnt">{s.counts[st]}</span>
              </div>
              {shown.map((g) => (
                <div key={g.id} className="mn-tr mn-gr">
                  <span className="mn-gn">
                    <b>{g.name}</b>
                    <span className="o-lg">{funderLine(g)}</span>
                    <span className="o-ph">{g.funder ?? '[Funder]'}</span>
                  </span>
                  <span className="mn-gamt o-ph">
                    {g.amount_cents != null ? (
                      <>
                        {g.amount_is_up_to ? <i>up to </i> : null}
                        <b>{usd(g.amount_cents)}</b>
                      </>
                    ) : null}
                  </span>
                  <span className="mn-gow">{g.owner ? <WhoMark who={g.owner} /> : <span className="mn-un">Unassigned</span>}</span>
                  <span className="mn-gdt">{dateLine(g)}</span>
                </div>
              ))}
              {hidden && st === 'researching' ? (
                <div className="mn-gmore">
                  <button type="button" className="mn-link" onClick={() => setAll(true)}>
                    Show all {s.counts[st]}
                  </button>
                </div>
              ) : null}
              {st === stages[stages.length - 1] ? <Foot stages={empty} /> : null}
            </section>
          );
        })}

        <p className="mn-gfoot o-ph">
          {GRANT_STAGES.filter((x) => x !== 'researching').map((st) => (
            <span key={st}>
              {STAGE_NAME[st]} <b>{s.counts[st]}</b>
            </span>
          ))}
        </p>

        <WideChecklistPanel list={data.checklist} only="ph" now={data.mode === 'live' ? new Date().toISOString() : MOCK_NOW} />
      </div>

    </>
  );
}
