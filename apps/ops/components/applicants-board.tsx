'use client';

// The Applicants screen (Figma "Scholarships > Applicants", laptop and phone): tabs and filters, the list, and on a
// laptop the detail panel for the selected applicant. Reviews are blind: rows show a code and initials, never a name.
// REAL: the list rows (code, initials, applied, interview). MOCK (mock/scoring.ts): scores, interviewers, stages and the
// interview summary. Clicking a row on a laptop selects it; on a phone it opens the full application.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ApplicantRow } from '@/lib/applicants';
import { plainInitials } from '@/lib/format';
import { BOARD_NAMES } from '@/mock/scoring';
import { OIcon } from './icons';
import { PageHeader } from './page-header';

type Tab = 'all' | 'needs' | 'interview' | 'scored';
type Sort = 'attention' | 'applied' | 'code';

// The two-letter circles for the people who interview.
function Avatars({ list }: { list: string[] }) {
  return (
    <span className="o-avs">
      {list.map((i) => (
        <span key={i} className="o-avx">
          {i}
        </span>
      ))}
    </span>
  );
}

// The score cell (laptop): your draft, not started, or the average with how many scores are published.
function ScoreCell({ row }: { row: ApplicantRow }) {
  const s = row.scoring.score;
  if (s.kind === 'draft')
    return (
      <span className="o-sc">
        <b className="o-sc-1">{s.line1}</b>
        <span className="o-sc-2">{s.line2}</span>
      </span>
    );
  if (s.kind === 'avg' && s.line2)
    return (
      <span className="o-sc">
        <b className="o-sc-1">{s.line1}</b>
        <span className="o-sc-2">{s.line2}</span>
      </span>
    );
  if (s.kind === 'avg') return <b className="o-sc-1">{s.line1}</b>;
  return <span className="o-sc-n">{s.line1}</span>;
}

// The stage cell (laptop): a "hot" pill, a plain state, or the Scored chip.
function StageCell({ row }: { row: ApplicantRow }) {
  const st = row.scoring.stage;
  if (st.kind === 'needs-score') return <span className="o-hot">{st.label}</span>;
  if (st.kind === 'scored')
    return (
      <span className="o-done">
        <OIcon name="check" size={14} />
        {st.label}
      </span>
    );
  return <span className="o-state">{st.label}</span>;
}

// The detail panel for one applicant.
function Detail({ row }: { row: ApplicantRow }) {
  const sc = row.scoring;
  const names = sc.interviewers.map((i) => BOARD_NAMES[i] ?? i).join(', ');
  return (
    <aside className="o-dt" aria-label="Applicant details">
      <div className="o-dt-h">
        <span className="o-dt-av">{plainInitials(row.initials) === '—' ? '—' : row.initials}</span>
        <div>
          <h2>{row.code}</h2>
          <p>Fall 2026 · Legacy cycle</p>
        </div>
      </div>
      <dl className="o-dt-m">
        <dt>Applied</dt>
        <dd>{row.applied}</dd>
        <dt>Interview</dt>
        <dd>{row.interviewLine || 'Not booked'}</dd>
        <dt>Interviewers</dt>
        <dd>{names || 'Not paired yet'}</dd>
      </dl>
      <div className="o-dt-pr">
        <h3>Where this application is</h3>
        <ol>
          {sc.progress.map((p) => (
            <li key={p.label} className={p.state}>
              <span className="o-dot">{p.state === 'done' ? <OIcon name="check" size={12} /> : null}</span>
              <div>
                <b>{p.label}</b>
                {p.note ? <span>{p.note}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="o-dt-sm">
        <h3>Interview summary</h3>
        <p>{sc.summary ?? 'No interview summary yet.'}</p>
        <p className="o-dt-lock">
          <OIcon name="lock" size={20} />
          <span>Scores are private until both interviewers publish.</span>
        </p>
      </div>
      <div className="o-dt-ac">
        <Link href={`/scholarships/applicants/${row.code}`} className={`o-btn xl ${sc.stage.kind === 'needs-score' ? 'p' : 's'}`}>
          {sc.action}
        </Link>
        {sc.stage.kind === 'needs-score' ? (
          <Link href={`/scholarships/applicants/${row.code}`} className="o-btn xl s">
            Open application
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

// The whole screen.
export function ApplicantsBoard({ cycleLabel, rows }: { cycleLabel: string; rows: ApplicantRow[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [who, setWho] = useState('');
  const [sort, setSort] = useState<Sort>('attention');
  const [pick, setPick] = useState(rows[0]?.code ?? '');
  const [searching, setSearching] = useState(false);

  const counts = {
    all: rows.length,
    needs: rows.filter((r) => r.scoring.stage.kind === 'needs-score' || r.scoring.stage.kind === 'waiting').length,
    interview: rows.filter((r) => r.scoring.stage.kind === 'interview').length,
    scored: rows.filter((r) => r.scoring.group === 'scored').length,
  };

  // The rows after the tab, the search (code or initials) and the interviewer filter, in the chosen order.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\./g, '');
    let list = rows.filter((r) => {
      const k = r.scoring.stage.kind;
      if (tab === 'needs' && !(k === 'needs-score' || k === 'waiting')) return false;
      if (tab === 'interview' && k !== 'interview') return false;
      if (tab === 'scored' && r.scoring.group !== 'scored') return false;
      if (who && !r.scoring.interviewers.includes(who)) return false;
      if (q && !r.code.toLowerCase().includes(q) && !plainInitials(r.initials).toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'code') list = [...list].sort((a, b) => a.code.localeCompare(b.code));
    if (sort === 'applied') list = [...list].reverse();
    return list;
  }, [rows, tab, query, who, sort]);

  const attention = shown.filter((r) => r.scoring.group === 'attention');
  const done = shown.filter((r) => r.scoring.group === 'scored');
  const picked = rows.find((r) => r.code === pick) ?? shown[0];
  const people = Array.from(new Set(rows.flatMap((r) => r.scoring.interviewers)));
  const tabs: { id: Tab; lg: string; ph: string }[] = [
    { id: 'all', lg: 'All', ph: 'All' },
    { id: 'needs', lg: 'Needs a score', ph: 'Needs score' },
    { id: 'interview', lg: 'Interview left', ph: 'Interview left' },
    { id: 'scored', lg: 'Scored', ph: 'Scored' },
  ];

  // Downloads the rows now on screen as a CSV (code, initials, applied, interview, stage), for the staff who need a copy.
  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [['Code', 'Initials', 'Applied', 'Interview', 'Stage'].join(',')];
    for (const r of shown) {
      lines.push([r.code, r.initials, r.applied, r.interviewDay ? `${r.interviewDay} ${r.interviewTime}`.trim() : '', r.scoring.stage.label].map(esc).join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'applicants.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Selects the row on a laptop; on a phone the link goes to the full application.
  function onRow(e: React.MouseEvent, code: string) {
    if (window.matchMedia('(min-width: 900px)').matches) {
      e.preventDefault();
      setPick(code);
    }
  }

  // One list row, drawn for both layouts.
  function Row({ r }: { r: ApplicantRow }) {
    const st = r.scoring.stage;
    const sc = r.scoring.score;
    return (
      <Link href={`/scholarships/applicants/${r.code}`} className={`o-ar-row${picked?.code === r.code ? ' picked' : ''}`} onClick={(e) => onRow(e, r.code)}>
        <span className="o-ap-c o-lg">
          <span className="o-ap-av">{r.initials}</span>
          <b>{r.code}</b>
        </span>
        <span className="o-ph o-ph-t">
          <b>
            {r.code} · {r.initials}
          </b>
          <span>
            {st.label}
            {r.scoring.interviewers.length && st.kind !== 'waiting' ? ` · ${r.scoring.interviewers.join(', ')}` : ''}
          </span>
        </span>
        <span className="o-ap-d o-lg">{r.applied}</span>
        <span className="o-ap-d o-lg">
          {r.interviewDay ? (
            r.upcoming ? (
              <span className="o-ap-2">
                <span>{r.interviewDay}</span>
                <span className="o-ap-t">{r.interviewTime}</span>
              </span>
            ) : (
              r.interviewDay
            )
          ) : null}
        </span>
        <span className="o-ap-d o-lg">{r.scoring.interviewers.length ? <Avatars list={r.scoring.interviewers} /> : null}</span>
        <span className="o-ap-d o-lg">
          <ScoreCell row={r} />
        </span>
        <span className="o-ap-d o-lg">
          <StageCell row={r} />
        </span>
        <span className="o-ph o-ph-r">
          {sc.kind === 'draft' ? <span className="o-out">{sc.line2}</span> : null}
          {sc.kind === 'none' && sc.line1 ? <span className="o-ph-n">{sc.line1}</span> : null}
          {sc.kind === 'avg' ? <b className="o-ph-s">{sc.line1}</b> : null}
          {sc.kind === 'none' && !sc.line1 && r.upcoming ? <span className="o-out">{r.interviewTime}</span> : null}
        </span>
      </Link>
    );
  }

  return (
    <>
      <PageHeader title="Applicants" actionsClass="o-ap-acts" sub={
          <>
            <span className="o-lg">{`${cycleLabel} · ${rows.length} applicants · reviews are blind, so applicants show as a code and initials`}</span>
            <span className="o-ph">{`Scholarships · ${cycleLabel.replace(/ cycle$/, '')} · ${rows.length} applicants`}</span>
          </>
        }>
        <label className="o-search o-lg o-ap-search">
          <OIcon name="search" size={20} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code or initials" aria-label="Search code or initials" />
        </label>
        <button type="button" className="o-btn s lg o-lg" onClick={exportCsv}>
          <OIcon name="upload" size={16} />
          Export
        </button>
        <button type="button" className="o-sq o-ph" aria-label="Search code or initials" aria-expanded={searching} onClick={() => setSearching((v) => !v)}>
          <OIcon name="search" size={22} />
        </button>
      </PageHeader>
      {searching ? (
        <div className="o-ph o-search o-ap-q">
          <OIcon name="search" size={20} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code or initials" aria-label="Search code or initials" autoFocus />
        </div>
      ) : null}

      <div className="o-ap-bar">
        <div className="o-seg o-ap-seg" role="group" aria-label="Show">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
              <span className="o-lg">
                {t.lg} <b>{counts[t.id]}</b>
              </span>
              <b className="o-ph o-segn">{counts[t.id]}</b>
              <span className="o-ph o-segl">{t.ph}</span>
            </button>
          ))}
        </div>
        <label className="o-chip o-lg">
          <span>Interviewer</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {BOARD_NAMES[p] ?? p}
              </option>
            ))}
          </select>
          <OIcon name="down" size={14} />
        </label>
        <label className="o-chip o-lg">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="attention">Needs attention first</option>
            <option value="applied">Newest first</option>
            <option value="code">Code</option>
          </select>
          <OIcon name="down" size={14} />
        </label>
      </div>

      <div className="o-ap-body">
        <section className="o-ap-tab" aria-label="Applicants">
          <div className="o-ap-th o-lg" aria-hidden="true">
            <span>Applicant</span>
            <span>Applied</span>
            <span>Interview</span>
            <span>Interviewers</span>
            <span>Score</span>
            <span>Stage</span>
          </div>
          <div className="o-ap-scroll">
            {shown.length === 0 ? <p className="o-ap-none">No applicants match.</p> : null}
            {attention.length > 0 ? (
              <>
                <p className="o-tg">
                  Needs attention <b>{attention.length}</b>
                </p>
                {attention.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </>
            ) : null}
            {done.length > 0 ? (
              <>
                <p className="o-tg">
                  Scored <b>{done.length}</b>
                </p>
                {done.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </>
            ) : null}
          </div>
        </section>
        {picked ? <Detail row={picked} /> : null}
      </div>
    </>
  );
}
