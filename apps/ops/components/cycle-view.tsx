'use client';

// The Fall 2026 cycle overview (Figma "Scholarships > Fall 2026 cycle"): where the cycle is (six phases), then the cycle
// checklist. The phase dates are REAL where the `cycles` table has them; the checklist is MOCK (mock/cycle.ts). Groups
// with "N steps" fold open and shut.
import { useState } from 'react';
import Link from 'next/link';
import type { CycleOverview } from '@/lib/cycle';
import { MOCK_CHECKLIST, type ChecklistGroup, type ChecklistRow, type Owner } from '@/mock/cycle';
import { OIcon } from './icons';
import { PageHeader } from './page-header';
import { Ring } from './ring';

// The little circle before an owner's name.
function OwnerMark({ o }: { o: Owner }) {
  if (o.kind === 'bot')
    return (
      <span className="o-ow bot">
        <OIcon name="refresh" size={14} />
      </span>
    );
  if (o.kind === 'group')
    return (
      <span className="o-ow">
        <OIcon name="people" size={14} />
      </span>
    );
  return <span className="o-ow">{o.initials}</span>;
}

// One checklist row.
function Row({ r }: { r: ChecklistRow }) {
  // The phone's one-line summary: owner, due date and how late or soon.
  const phoneSub = [r.owner.label, r.due, r.rel?.text.toLowerCase()].filter(Boolean).join(' · ');
  return (
    <div className={`o-cl-rw${r.state === 'late' ? ' late' : ''}`}>
      <div className="o-cl-ph o-ph">
        <span className={`o-cl-ck ${r.state}`} aria-label={r.state === 'done' ? 'Done' : r.state === 'late' ? 'Late' : 'To do'}>
          {r.state === 'done' ? <OIcon name="check" size={16} /> : null}
        </span>
        <span className="o-cl-pt">
          <b>{r.title}</b>
          <span>{phoneSub}</span>
          {r.action ? (
            <Link href="/tasks" className={`o-btn ${r.action.kind}`}>
              {r.action.label}
            </Link>
          ) : null}
        </span>
      </div>
    <div className="o-cl-row o-lg">
      <span className={`o-cl-ck ${r.state}`} aria-label={r.state === 'done' ? 'Done' : r.state === 'late' ? 'Late' : 'To do'}>
        {r.state === 'done' ? <OIcon name="check" size={16} /> : r.state === 'late' ? '!' : null}
      </span>
      <span className="o-cl-t">
        <b>{r.title}</b>
        <span>
          <OIcon name={r.icon} size={14} />
          {r.kind}
          <i className="o-dots" />
          {r.sub}
        </span>
      </span>
      <span className="o-cl-ow">
        <OwnerMark o={r.owner} />
        {r.owner.label}
      </span>
      <span className="o-cl-du">
        {r.due}
        {r.rel ? <span className={r.rel.late ? 'o-rel late' : 'o-rel'}>{r.rel.text}</span> : null}
      </span>
      <span className="o-cl-ac">
        {r.status ? <b>{r.status}</b> : null}
        {r.action ? (
          <Link href="/tasks" className={`o-btn ${r.action.kind}`}>
            {r.action.label}
          </Link>
        ) : null}
      </span>
    </div>
    </div>
  );
}

// A group header; groups with a fold open to a list of their steps.
function Group({ g }: { g: ChecklistGroup }) {
  const [open, setOpen] = useState(false);
  if (g.fold) {
    return (
      <>
        <button type="button" className="o-cl-tg fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span>
            {g.label} <b>{g.fold.note}</b>
          </span>
          <OIcon name={open ? 'down' : 'down'} size={16} className={open ? 'o-up' : ''} />
        </button>
        {open
          ? g.fold.steps.map((s) => (
              <div key={s} className="o-cl-step">
                <OIcon name="check" size={16} />
                {s}
              </div>
            ))
          : null}
      </>
    );
  }
  return (
    <>
      <p className="o-cl-tg">
        {g.label} {g.now ? <b>now</b> : null}
      </p>
      {g.rows.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </>
  );
}

// The page body (the chat panel is drawn by the page, beside it).
export function CycleView({ cycle }: { cycle: CycleOverview }) {
  const cl = MOCK_CHECKLIST;
  return (
    <>
      <PageHeader
        title={cycle.title}
        sub={
          <>
            <span className="o-lg">{cycle.sub}</span>
            <span className="o-ph">{cycle.phoneSub}</span>
          </>
        }
      >
        <Link href="/scholarships/cycle/settings" className="o-btn s lg o-lg">
          Cycle settings
        </Link>
        <Link href="/scholarships/cycle/settings" className="o-sq o-ph" aria-label="Cycle settings">
          <OIcon name="more" size={22} />
        </Link>
      </PageHeader>

      <section className="o-card o-panel" aria-labelledby="cy-where">
        <div className="o-ph2">
          <h2 className="o-h2" id="cy-where">
            Where the cycle is
          </h2>
          <span className="o-lg">Working schedule</span>
        </div>
        <div className="o-ph o-pstep">
          <ol>
            {cycle.phases.map((p, i) => (
              <li key={p.n} className={p.state}>
                {i > 0 ? <span className={`o-ps-line${cycle.phases[i - 1].state === 'done' ? ' on' : ''}`} /> : null}
                <span className="o-ph-c">{p.state === 'done' ? <OIcon name="check" size={16} /> : p.n}</span>
                <span className="o-ps-l">{p.short}</span>
              </li>
            ))}
          </ol>
          <p className="o-ps-now">{cycle.nowLine}</p>
          <p className="o-ps-next">{cycle.nextLine}</p>
        </div>
        <ol className="o-phases o-lg">
          {cycle.phases.map((p, i) => {
            const prev = cycle.phases[i - 1];
            return (
              <li key={p.n} className={p.state}>
                {i > 0 ? <span className={`o-ph-line${prev.state === 'done' ? ' on' : ''}`} /> : null}
                <span className="o-ph-c">{p.state === 'done' ? <OIcon name="check" size={16} /> : p.n}</span>
                <b>{p.label}</b>
                <span className="o-ph-d">{p.dates}</span>
                {p.state === 'done' && i < 2 ? <b className="o-ph-s">Done</b> : null}
                {p.state === 'now' && i < 2 ? <b className="o-ph-s">Now</b> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="o-card o-panel o-cl" aria-labelledby="cy-list">
        <div className="o-ph2 list">
          <Ring frac={cl.done / cl.total} label={`${cl.done}/${cl.total}`} color="gold" size={44} />
          <div>
            <h2 className="o-h2" id="cy-list">
              Cycle checklist
            </h2>
            <p>{`${cl.done} of ${cl.total} done, now ${cycle.nowLabel}`}</p>
          </div>
        </div>
        <div className="o-cl-th o-lg" aria-hidden="true">
          <span>Step</span>
          <span>Owner</span>
          <span>Due</span>
        </div>
        {cl.groups.map((g) => (
          <Group key={g.id} g={g} />
        ))}
      </section>
    </>
  );
}
