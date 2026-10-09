'use client';

// The Goals screen (Figma "Goals", laptop and phone): year switch, four goal cards, scholars funded by award cycle, and
// (laptop) the Year over year table where past years are typed in once. MOCK today: the year switch only has 2026 data,
// "Edit goals" has no frame so it does nothing yet, and a saved figure lives in this component's state (resets on reload).
// In live mode "Save" will upsert `year_figures` (year, metric, value, entered_by).
import { useState } from 'react';
import { PageHeader } from '../page-header';
import type { GoalCard, GoalStatus, GoalsData } from '@/mock/goals';
import './goals.css';

const STATUS_LABEL: Record<GoalStatus, string> = {
  in_planning: 'In planning',
  in_progress: 'In progress',
  on_track: 'On track',
  at_risk: 'At risk',
  met: 'Goal met',
  missed: 'Missed',
  not_started: 'Not started',
};

const YEARS = [2024, 2025, 2026];

function Card({ g }: { g: GoalCard }) {
  return (
    <div className="gl-card">
      <div className="gl-t">
        <h3>{g.title}</h3>
        <span className="gl-st">{STATUS_LABEL[g.status]}</span>
      </div>
      <p className="gl-v">
        <b className="gl-d">{g.value}</b>
        <b className="gl-m">{g.phoneValue ?? g.value}</b>
        {g.unit ? <span className="gl-u gl-d">{g.unit}</span> : null}
        {g.phoneUnit || g.unit ? <span className="gl-u gl-m">{g.phoneUnit ?? g.unit}</span> : null}
      </p>
      <div className="gl-track" role="img" aria-label={`${Math.round(g.frac * 100)}% of the way`}>
        <span style={{ '--f': Math.min(1, g.frac), '--pf': Math.min(1, g.phoneFrac ?? g.frac) } as React.CSSProperties} />
      </div>
      <p className="gl-f gl-d">{g.foot}</p>
      <p className="gl-f gl-m">{g.phoneFoot}</p>
    </div>
  );
}

type Metric = 'money_raised_cents' | 'applicants';
const ROWS: { metric: Metric; label: string }[] = [
  { metric: 'money_raised_cents', label: 'Money raised' },
  { metric: 'applicants', label: 'Applicants' },
];

// One cell of the Year over year table: a dashed "+ Add", an open amount box with Save, or the saved figure.
function YoyCell({ metric, saved, open, onOpen, onSave }: { metric: Metric; saved: number | undefined; open: boolean; onOpen: () => void; onSave: (n: number) => void }) {
  const [text, setText] = useState('');
  const submit = () => {
    const n = Number(text.replace(/[$,\s]/g, ''));
    if (text.trim() !== '' && Number.isFinite(n) && n >= 0) onSave(n);
  };
  if (open)
    return (
      <span className="gl-edit">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={metric === 'money_raised_cents' ? '$ amount' : 'Number'}
          aria-label={metric === 'money_raised_cents' ? 'Money raised' : 'Applicants'}
          inputMode="numeric"
          autoFocus={false}
        />
        <button type="button" onClick={submit}>
          Save
        </button>
      </span>
    );
  if (saved !== undefined) return <span className="gl-val">{metric === 'money_raised_cents' ? `$${saved.toLocaleString('en-US')}` : saved.toLocaleString('en-US')}</span>;
  return (
    <button type="button" className="gl-add" onClick={onOpen}>
      + Add
    </button>
  );
}

export function GoalsView({ data }: { data: GoalsData }) {
  const [year, setYear] = useState(data.year);
  // MOCK: in-memory only. NOT TESTED in live mode: needs the Ops Hub tables (draft schema, not applied).
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [openKey, setOpenKey] = useState<string | null>('money_raised_cents:2025');
  const max = Math.max(1, ...data.cycles.map((c) => c.count ?? 0));
  return (
    <div className="gl">
      <PageHeader title="Goals" sub={<><span className="gl-d">{year} goals · counted from what the board logs in the app</span><span className="gl-m">{year} goals</span></>} actionsClass="gl-acts">
        <div className="o-seg gl-seg" role="group" aria-label="Year">
          {YEARS.map((y) => (
            <button key={y} type="button" className={y === year ? 'on' : ''} aria-pressed={y === year} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
        <button type="button" className="o-btn s lg gl-edit-goals">
          Edit goals
        </button>
      </PageHeader>

      {year === data.year ? (
        <>
          <section className="gl-cards" aria-label="This year's goals">
            {data.cards.map((g) => (
              <Card key={g.id} g={g} />
            ))}
          </section>

          <section className="gl-panel gl-chart">
            <h2>Scholars funded, by award cycle</h2>
            <div className="gl-cols">
              {data.cycles.map((c, i) => (
                <div key={i} className={`gl-col${c.count === null ? ' next' : ''}`}>
                  <b>{c.count ?? '?'}</b>
                  <span className="gl-bar" style={{ ['--n' as string]: c.count ?? 1, ['--max' as string]: max }} />
                </div>
              ))}
            </div>
            <div className="gl-lbls">
              {data.cycles.map((c, i) => (
                <div key={i}>
                  <span className="gl-d">{c.label}</span>
                  <span className="gl-m">{c.phoneLabel}</span>
                  <br />
                  <span className="gl-d">{c.sub}</span>
                  <span className="gl-m">{c.phoneSub}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="gl-panel gl-yoy gl-d">
            <div className="gl-yph">
              <h2>Year over year</h2>
              <p>Past years are entered once, by hand</p>
            </div>
            <div className="gl-yrow gl-yh">
              <span />
              {data.yoyYears.map((y) => (
                <span key={y}>{y}</span>
              ))}
            </div>
            {ROWS.map((r) => (
              <div key={r.metric} className="gl-yrow">
                <b>{r.label}</b>
                {data.yoyYears.map((y) => {
                  const key = `${r.metric}:${y}`;
                  const fromData = data.figures.find((f) => f.year === y && f.metric === r.metric)?.value;
                  const stored = saved[key] ?? (fromData !== undefined ? (r.metric === 'money_raised_cents' ? fromData / 100 : fromData) : undefined);
                  return (
                    <span key={y}>
                      <YoyCell
                        metric={r.metric}
                        saved={stored}
                        open={openKey === key && stored === undefined}
                        onOpen={() => setOpenKey(key)}
                        onSave={(n) => {
                          setSaved((s) => ({ ...s, [key]: n }));
                          setOpenKey(null);
                        }}
                      />
                    </span>
                  );
                })}
              </div>
            ))}
          </section>
        </>
      ) : (
        <p className="gl-none">No goals set for {year}.</p>
      )}
    </div>
  );
}
