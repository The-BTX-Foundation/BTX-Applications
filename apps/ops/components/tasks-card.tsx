'use client';

// The Tasks panel on Today (Figma "section.tk: Tasks"): Mine / Team / Approvals tabs, then tasks grouped by when they
// are due. Laptop draws a table (task, area, due, comments, one action); phone draws a list with buttons under the row.
// Mine and Team come from the tasks tables (lib/today.ts); mock mode shows the same list on both tabs. Approvals are the approval rows.
import { useState } from 'react';
import Link from 'next/link';
import { OIcon } from './icons';
import type { TodayData, TaskRow } from '@/mock/today';
import type { VideoLinksData } from '@/lib/interviews';
import { isVideoLinksTask } from '@/lib/area-map';
import { VideoLinksPanel } from './interviews/video-links-panel';

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
function Row({ row, onVideoLinks }: { row: TaskRow; onVideoLinks?: () => void }) {
  const videoTask = Boolean(onVideoLinks) && isVideoLinksTask(row.title);
  // The approval row opens the budget approval screen: the laptop button, and the title (the phone has no button).
  const href = row.href ?? (row.approval ? '/finance/budget/approval' : '/tasks');
  const titleParts = (
    <>
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
            {row.sub2 ? (
              <>
                <i className="o-dots" />
                {row.sub2}
              </>
            ) : null}
            {row.commentsInSub ? (
              <>
                <i className="o-dots" />
                <Comments n={row.commentsInSub} />
              </>
            ) : null}
          </span>
    </>
  );
  return (
    <div className="o-tr">
      <div className="o-tr-main">
        <span className="o-lead o-lg">{row.lead === 'circle' ? <span className="o-ck" /> : <OIcon name={row.typeIcon} size={20} />}</span>
        <span className="o-ck o-ph" />
        {row.approval ? (
          <Link href={href} className="o-tt" style={{ color: 'inherit', textDecoration: 'none' }}>
            {titleParts}
          </Link>
        ) : (
          <span className="o-tt">{titleParts}</span>
        )}
        <span className="o-ar o-lg">
          <span className="o-area">{row.area}</span>
        </span>
        <span className="o-du o-lg">
          {row.due}
          {row.rel ? <span className={row.rel.late ? 'o-rel late' : 'o-rel'}>{row.rel.text}</span> : null}
        </span>
        <span className="o-cmc o-lg">{row.comments ? <Comments n={row.comments} /> : null}</span>
        <span className="o-ra o-lg">
          {row.action && videoTask ? (
            <button type="button" className={`o-btn ${row.action.kind}`} onClick={onVideoLinks}>
              {row.action.label}
            </button>
          ) : row.action ? (
            <Link href={href} className={`o-btn ${row.action.kind}`}>
              {row.action.label}
            </Link>
          ) : null}
        </span>
        <span className={row.phoneLate ? 'o-du late o-ph' : 'o-du o-ph'}>{row.phoneDue}</span>
      </div>
      {row.phoneActions ? (
        <div className="o-act o-ph">
          {row.phoneActions.map((a, n) =>
            videoTask && n === 0 ? (
              <button key={a.label + n} type="button" className={`o-btn ${a.kind}`} onClick={onVideoLinks}>
                {a.label}
              </button>
            ) : (
            <Link key={a.label + n} href={n === 0 && a.kind === 'p' ? href : '/tasks'} className={`o-btn ${a.kind}`}>
              {a.label}
            </Link>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

// The panel.
// videoLinks is set for admins only: it makes the "Send interview video links" task open the panel.
export function TasksCard({ data, videoLinks }: { data: TodayData; videoLinks?: VideoLinksData }) {
  const [tab, setTab] = useState<Tab>('mine');
  const [vlOpen, setVlOpen] = useState(false);
  const { counts, groups } = data;
  const source = tab !== 'mine' && data.teamGroups ? data.teamGroups : groups;
  const shown = source
    .map((g) => ({ ...g, rows: tab === 'approvals' ? g.rows.filter((r) => r.approval) : g.rows }))
    .filter((g) => g.rows.length > 0);
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'mine', label: 'Mine', n: counts.mine },
    { id: 'team', label: 'Team', n: counts.team },
    { id: 'approvals', label: 'Approvals', n: counts.approvals },
  ];
  return (
    <section className="o-tk" aria-labelledby="tk-h" data-review="Today tasks">
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
            <Row key={r.id} row={r} onVideoLinks={videoLinks ? () => setVlOpen(true) : undefined} />
          ))}
        </div>
      ))}
      {videoLinks && vlOpen ? <VideoLinksPanel data={videoLinks} onClose={() => setVlOpen(false)} /> : null}
    </section>
  );
}
