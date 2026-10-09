'use client';

// The Tasks panel on Today (Figma "section.tk: Tasks"): Mine / Team / Approvals tabs, then tasks grouped by when they
// are due. Laptop draws a table (task, area, due, comments, one action); phone draws a list with buttons under the row.
// MOCK data (mock/today.ts): Team shows the same list and Approvals only the approval rows until the task tables exist.
import { useState } from 'react';
import Link from 'next/link';
import { OIcon } from './icons';
import { TODAY, type TaskRow } from '@/mock/today';

type Tab = 'mine' | 'team' | 'approvals';

// The comment bubble and count.
function Comments({ n }: { n: number }) {
  return (
    <span className="o-cm">
      <OIcon name="chat" size={18} />
      {n}
    </span>
  );
}

// One task row, in both layouts (the other layout's parts are hidden by CSS).
function Row({ row }: { row: TaskRow }) {
  return (
    <div className="o-tr">
      <div className="o-tr-main">
        <span className="o-lead o-lg">{row.lead === 'circle' ? <span className="o-ck" /> : <OIcon name={row.typeIcon} size={20} />}</span>
        <span className="o-ck o-ph" />
        <span className="o-tt">
          <b>
            <span className="o-lg">{row.title}</span>
            <span className="o-ph">{row.phoneTitle ?? row.title}</span>
          </b>
          <span className="o-ty o-ph">{row.phoneSub}</span>
          <span className="o-ty o-lg">
            <OIcon name={row.typeIcon} size={15} className="o-ti" />
            {row.typeLabel}
            <i className="o-dots" />
            {row.sub}
            {row.commentsInSub ? (
              <>
                <i className="o-dots" />
                <Comments n={row.commentsInSub} />
              </>
            ) : null}
          </span>
        </span>
        <span className="o-ar o-lg">
          <span className="o-area">{row.area}</span>
        </span>
        <span className="o-du o-lg">
          {row.due}
          {row.rel ? <span className={row.rel.late ? 'o-rel late' : 'o-rel'}>{row.rel.text}</span> : null}
        </span>
        <span className="o-cmc o-lg">{row.comments ? <Comments n={row.comments} /> : null}</span>
        <span className="o-ra o-lg">
          {row.action ? (
            <Link href="/tasks" className={`o-btn ${row.action.kind}`}>
              {row.action.label}
            </Link>
          ) : null}
        </span>
        <span className={row.phoneLate ? 'o-du late o-ph' : 'o-du o-ph'}>{row.phoneDue}</span>
      </div>
      {row.phoneActions ? (
        <div className="o-act o-ph">
          {row.phoneActions.map((a) => (
            <Link key={a.label} href="/tasks" className={`o-btn ${a.kind}`}>
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// The panel.
export function TasksCard() {
  const [tab, setTab] = useState<Tab>('mine');
  const { counts, groups } = TODAY;
  const shown = groups
    .map((g) => ({ ...g, rows: tab === 'approvals' ? g.rows.filter((r) => r.approval) : g.rows }))
    .filter((g) => g.rows.length > 0);
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'mine', label: 'Mine', n: counts.mine },
    { id: 'team', label: 'Team', n: counts.team },
    { id: 'approvals', label: 'Approvals', n: counts.approvals },
  ];
  return (
    <section className="o-tk" aria-labelledby="tk-h">
      <div className="o-tkh">
        <h2 className="o-h2" id="tk-h">
          Tasks
        </h2>
        <div className="o-seg" role="group" aria-label="Show">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label} <b>{t.n}</b>
            </button>
          ))}
        </div>
        <Link href="/tasks" className="o-btn s lg o-lg">
          <OIcon name="plus" size={16} />
          Add a task
        </Link>
      </div>
      <div className="o-th o-lg" aria-hidden="true">
        <span />
        <span>Task</span>
        <span className="o-th-a">Area</span>
        <span>Due</span>
      </div>
      {shown.map((g) => (
        <div key={g.label}>
          <p className="o-tg">
            {g.label} <b>{g.rows.length}</b>
          </p>
          {g.rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </div>
      ))}
    </section>
  );
}
