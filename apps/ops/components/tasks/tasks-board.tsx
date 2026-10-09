'use client';

// The Tasks page (Figma "Tasks, laptop / phone"): a header with search and "Add a task", Mine / Team / Approvals plus
// Person and Area filters, the tasks grouped by due date, and on a laptop the selected task's details beside them.
// Phone: the same list, a "+" instead of the search box, and the details open under the header when "Open" is tapped
// (a guess: the design has no phone details frame). In mock mode actions change this page's state only (reset on reload);
// in live mode the same handlers write through ./tasks-writes (NOT TESTED: needs the Ops Hub tables, draft schema).
import { useMemo, useRef, useState } from 'react';
import './tasks.css';
import { OIcon, type OpsIconName } from '../icons';
import { PageHeader } from '../page-header';
import { timeLabel } from '@/lib/format';
import { lateText, type Bucket, type Person, type TaskComment, type TaskItem, type TasksData } from '@/lib/tasks-shared';
import { writeComment, writeStatus, writeTask } from './tasks-writes';

export type Tab = 'mine' | 'team' | 'approvals';

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: 'late', label: 'Late' },
  { id: 'this_week', label: 'This week' },
  { id: 'next_week', label: 'Next week' },
  { id: 'later', label: 'Later' },
];

const TYPE_ICON: Record<string, OpsIconName> = { task: 'tasks', post: 'outreach', request: 'calendar', approval: 'approval', scoring: 'scoring', meeting: 'meeting' };
const icon = (type: string): OpsIconName => TYPE_ICON[type] ?? 'tasks';

// "99+" past 99.
const count = (n: number) => (n > 99 ? '99+' : String(n));

function Avatar({ p, small }: { p: Person | undefined; small?: boolean }) {
  if (!p) {
    return (
      <span className={`tk2-av none${small ? ' sm' : ''}`} aria-hidden="true">
        ?
      </span>
    );
  }
  return (
    <span className={`tk2-av${small ? ' sm' : ''}`} aria-hidden="true">
      {p.initials}
    </span>
  );
}

function Comments({ n }: { n: number }) {
  return (
    <span className="tk2-cm">
      <OIcon name="chat" size={18} />
      {count(n)}
    </span>
  );
}

// The phone's pill: "2 days late", "Tomorrow", a weekday, or the full date for later weeks.
function phonePill(t: TaskItem): string {
  if (t.late_days) return lateText(t.late_days);
  if (t.rel) return t.rel;
  if (t.bucket === 'this_week') return t.weekday;
  return t.due_label;
}

function Row({
  t,
  owner,
  selected,
  onSelect,
  onDone,
  onOpen,
}: {
  t: TaskItem;
  owner: Person | undefined;
  selected: boolean;
  onSelect: () => void;
  onDone: () => void;
  onOpen: () => void;
}) {
  const circle = t.type === 'task' || t.type === 'post';
  const late = t.late_days > 0;
  const pill = phonePill(t);
  return (
    <div className={`tk2-row${selected ? ' sel' : ''}`}>
      <div
        className="tk2-main"
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onSelect();
          }
        }}
      >
        <span className="tk2-lead">
          {circle ? (
            <button type="button" className="tk2-ck" aria-label={`Mark done: ${t.title}`} onClick={(e) => { e.stopPropagation(); onDone(); }} />
          ) : (
            <OIcon name={icon(t.type)} size={20} />
          )}
        </span>
        <span className="tk2-tt">
          <b>
            <span className="tk2-lg">{t.title}</span>
            <span className="tk2-ph">{t.phone_title ?? t.title}</span>
          </b>
          <span className="tk2-ty tk2-lg">
            <OIcon name={icon(t.type)} size={15} />
            {t.type_label}
            {t.context ? (
              <>
                <i className="tk2-dot" />
                {t.context}
              </>
            ) : null}
            {t.extra ? (
              <>
                <i className="tk2-dot" />
                {t.extra}
              </>
            ) : null}
          </span>
          <span className="tk2-ty tk2-ph">
            <OIcon name={icon(t.type)} size={15} />
            {t.type_label}
            <i className="tk2-dot" />
            {t.owner_id === null ? 'Unassigned' : t.area_name}
            {t.comment_count > 0 && !late ? (
              <>
                <i className="tk2-dot" />
                <Comments n={t.comment_count} />
              </>
            ) : null}
          </span>
        </span>
        <span className="tk2-ow tk2-lg">
          <Avatar p={owner} small />
          <span>{owner ? (owner.table_name ?? owner.display_name) : 'Unassigned'}</span>
        </span>
        <span className="tk2-ar tk2-lg">
          <span className="o-area">{t.area_name}</span>
        </span>
        <span className="tk2-du tk2-lg">
          {t.due_label}
          {late ? <span className="tk2-late">{lateText(t.late_days)}</span> : t.rel ? <span className="tk2-rel">{t.rel}</span> : null}
        </span>
        <span className="tk2-cc tk2-lg">{t.comment_count > 0 ? <Comments n={t.comment_count} /> : null}</span>
        <span className="tk2-pd tk2-ph">
          <span className={late ? 'tk2-pill late' : 'tk2-pill'}>{pill}</span>
          <span className="tk2-pdl">{late ? t.due_label : (t.due_note ?? (t.bucket === 'this_week' ? t.short_date : t.extra ?? t.short_date))}</span>
        </span>
      </div>
      {late ? (
        <div className="tk2-act tk2-ph">
          <button type="button" className="o-btn p" onClick={onDone}>
            {t.action ?? 'Mark done'}
          </button>
          <button type="button" className="o-btn s" onClick={onOpen}>
            Open
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Details({
  t,
  people,
  comments,
  onApprove,
  onDecline,
  onDone,
  onComment,
  onClose,
}: {
  t: TaskItem | undefined;
  people: Person[];
  comments: TaskComment[];
  onApprove: () => void;
  onDecline: () => void;
  onDone: () => void;
  onComment: (body: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  if (!t) {
    return (
      <div className="tk2-dt-empty">
        <p>Select a task to see its details.</p>
      </div>
    );
  }
  const by = (id: string | null) => people.find((p) => p.user_id === id);
  const owner = by(t.owner_id);
  const a = t.approval;
  const send = () => {
    const body = text.trim();
    if (!body) return;
    onComment(body);
    setText('');
  };
  return (
    <>
      <div className="tk2-dth">
        <button type="button" className="tk2-close tk2-ph" onClick={onClose}>
          Close
        </button>
        <p className="tk2-dty">
          <OIcon name={icon(t.type)} size={15} />
          {t.type_label}
          <i className="tk2-dot" />
          {t.area_name}
        </p>
        <h2>{t.title}</h2>
        <div className="tk2-meta">
          <p>
            <span>Owner</span>
            <b>{owner ? owner.display_name : 'Unassigned'}</b>
          </p>
          <p>
            <span>Due</span>
            <b>{t.due_label || 'No date'}</b>
          </p>
          {t.checklist ? (
            <p>
              <span>Checklist</span>
              <b>{t.checklist}</b>
            </p>
          ) : null}
        </div>
      </div>
      <div className="tk2-dtb">
        {a ? (
          <>
            <p className="tk2-sum">
              {a.summary.map((s, i) => (
                <span key={i}>
                  {i === 0 ? s.split(/(\$[\d,]+)/).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part)) : s}
                </span>
              ))}
            </p>
            <div className="tk2-bl">
              {a.lines.map((l) => (
                <div key={l.label}>
                  <p>
                    <span>{l.label}</span>
                    <b>{`$${(l.cents / 100).toLocaleString('en-US')}`}</b>
                  </p>
                  <span className="tk2-bt">
                    <span style={{ width: `${Math.max(1, (l.cents / a.totalCents) * 100)}%` }} />
                  </span>
                </div>
              ))}
            </div>
            <p className="tk2-hint">{a.hint}</p>
          </>
        ) : null}
        <div className="tk2-dta">
          {a ? (
            <>
              <button type="button" className="o-btn p xl" onClick={onApprove}>
                {a.approveLabel}
              </button>
              <button type="button" className="o-btn s xl" onClick={onDecline}>
                Decline
              </button>
            </>
          ) : (
            <button type="button" className="o-btn p xl" onClick={onDone}>
              Mark done
            </button>
          )}
        </div>
      </div>
      <p className="tk2-cmh">
        Comments <b>{count(t.comment_count)}</b>
      </p>
      <div className="tk2-cml">
        {comments.map((c) => {
          const p = by(c.author_id);
          return (
            <div key={c.id} className="tk2-cmt">
              <Avatar p={p} small />
              <div>
                <p className="tk2-mh">
                  <b>{p?.display_name ?? 'Someone'}</b>
                  <span>{timeLabel(c.created_at)}</span>
                </p>
                <p className="tk2-bub">{c.body}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="tk2-cmp"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" />
        <button type="submit" className="tk2-go" aria-label="Send comment">
          <OIcon name="send" size={20} />
        </button>
      </form>
    </>
  );
}

export function TasksBoard({ data, startTab }: { data: TasksData; startTab: Tab }) {
  const { people, areas, me, mode } = data;
  const [tasks, setTasks] = useState<TaskItem[]>(data.tasks);
  const [comments, setComments] = useState<Record<string, TaskComment[]>>(data.comments);
  const [tab, setTab] = useState<Tab>(startTab);
  const [who, setWho] = useState('');
  const [area, setArea] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftArea, setDraftArea] = useState(areas[0]?.slug ?? '');
  const [showAll, setShowAll] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const seq = useRef(0);
  const [selected, setSelected] = useState<string | null>(() => {
    const open = data.tasks.filter((t) => (startTab === 'mine' ? t.mine : t.team));
    return (open.find((t) => t.type === 'approval') ?? open[0])?.id ?? null;
  });

  const orig = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);
  const finished = tasks.filter((t) => t.status === 'done' || t.status === 'declined');
  const added = tasks.filter((t) => t.id.startsWith('new'));
  // Counts move with what was done or added on this page.
  const counts = {
    mine: data.counts.mine - finished.filter((t) => t.mine).length + added.length,
    team: data.counts.team - finished.length + added.length,
    approvals: data.counts.approvals - finished.filter((t) => t.type === 'approval').length,
    open: data.counts.open - finished.length + added.length,
    done_week: data.counts.done_week + finished.length,
  };

  const visible = tasks.filter((t) => {
    if (t.status !== 'open' && t.status !== 'in_progress') return false;
    if (tab === 'mine' ? !t.mine : !t.team) return false;
    if (tab === 'approvals' && t.type !== 'approval') return false;
    if (who && t.owner_id !== who) return false;
    if (area && t.area !== area) return false;
    if (query.trim() && !t.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });
  const groups = BUCKETS.map((b) => ({ ...b, rows: visible.filter((t) => t.bucket === b.id) })).filter((g) => g.rows.length > 0);
  const hidden = tab === 'team' && !who && !area && !query && !showAll && counts.team > visible.length ? counts.team : 0;
  const sel = tasks.find((t) => t.id === selected && (t.status === 'open' || t.status === 'in_progress')) ?? visible.find((t) => t.type === 'approval') ?? visible[0];

  const patch = (id: string, f: (t: TaskItem) => TaskItem) => setTasks((ts) => ts.map((t) => (t.id === id ? f(t) : t)));
  const finish = (id: string, status: 'done' | 'declined') => {
    patch(id, (t) => ({ ...t, status }));
    if (mode === 'live') void writeStatus(id, status);
  };
  const addComment = (id: string, body: string) => {
    const c: TaskComment = { id: `c${++seq.current}-${id}`, task_id: id, author_id: me, body, created_at: new Date().toISOString() };
    setComments((m) => ({ ...m, [id]: [...(m[id] ?? []), c] }));
    patch(id, (t) => ({ ...t, comment_count: t.comment_count + 1 }));
    if (mode === 'live') void writeComment(id, body);
  };
  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    const a = areas.find((x) => x.slug === draftArea) ?? areas[0];
    const id = `new${++seq.current}`;
    const t: TaskItem = {
      id,
      title,
      type: 'task',
      type_label: 'Task',
      area: a.slug,
      area_name: a.name,
      status: 'open',
      due_on: null,
      bucket: 'later',
      owner_id: me,
      context: null,
      mine: true,
      team: true,
      comment_count: 0,
      due_label: '',
      weekday: '',
      short_date: '',
      late_days: 0,
      rel: null,
    };
    setTasks((ts) => [...ts, t]);
    setSelected(id);
    setDraft('');
    setAdding(false);
    if (mode === 'live') void writeTask(title, a.slug, me);
  };
  const open = (id: string) => {
    setSelected(id);
    setPhoneOpen(true);
  };
  const ownerOf = (t: TaskItem) => people.find((p) => p.user_id === t.owner_id);
  const doneTitles = [...data.done.map((d) => d.title), ...finished.filter((t) => !orig.has(t.id) || orig.get(t.id)?.status === 'open').map((t) => t.title)];
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'mine', label: 'Mine', n: counts.mine },
    { id: 'team', label: 'Team', n: counts.team },
    { id: 'approvals', label: 'Approvals', n: counts.approvals },
  ];

  return (
    <div className="tk2">
      <PageHeader title="Tasks" sub={
          <>
            {`${counts.open} open across the board`}
            <span className="tk2-lg">{` · ${counts.done_week} done this week`}</span>
          </>
        } actionsClass="tk2-acts">
        <label className="o-search tk2-search tk2-lg">
          <OIcon name="search" size={20} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
        </label>
        <button type="button" className="o-btn s lg tk2-lg" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          <OIcon name="plus" size={16} />
          Add a task
        </button>
        <button type="button" className="tk2-sq tk2-ph" aria-label="Add a task" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          <OIcon name="plus" size={22} />
        </button>
      </PageHeader>

      <div className="tk2-bar">
        <div className="o-seg tk2-seg" role="group" aria-label="Show">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label} <b>{t.n}</b>
            </button>
          ))}
        </div>
        <label className="tk2-chip tk2-lg">
          <span>Person</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.display_name}
              </option>
            ))}
          </select>
          <OIcon name="down" size={14} />
        </label>
        <label className="tk2-chip">
          <span>
            Area<i className="tk2-ph">:</i>
          </span>
          <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
            <option value="">All</option>
            {areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
          <OIcon name="down" size={14} />
        </label>
      </div>

      {adding ? (
        <form
          className="tk2-add"
          onSubmit={(e) => {
            e.preventDefault();
            addTask();
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What needs doing?" aria-label="New task" autoFocus />
          <select value={draftArea} onChange={(e) => setDraftArea(e.target.value)} aria-label="Area for the new task">
            {areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="submit" className="o-btn p">
            Add
          </button>
          <button type="button" className="o-btn s" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : null}

      <div className={`tk2-body${phoneOpen ? ' open' : ''}`}>
        <section className="tk2-tab" aria-label="Tasks">
          <div className="tk2-th tk2-lg" aria-hidden="true">
            <span />
            <span>Task</span>
            <span>Owner</span>
            <span>Area</span>
            <span>Due</span>
          </div>
          <div className="tk2-scroll">
            {groups.length === 0 ? <p className="tk2-none">Nothing here.</p> : null}
            {groups.map((g) => (
              <div key={g.id}>
                <p className="tk2-tg">
                  {g.label} <b>{g.rows.length}</b>
                </p>
                {g.rows.map((t) => (
                  <Row key={t.id} t={t} owner={ownerOf(t)} selected={sel?.id === t.id} onSelect={() => { setSelected(t.id); }} onDone={() => finish(t.id, 'done')} onOpen={() => open(t.id)} />
                ))}
              </div>
            ))}
            {hidden ? (
              <button type="button" className="tk2-all" onClick={() => setShowAll(true)}>
                Show all {hidden}
              </button>
            ) : null}
            <button type="button" className="tk2-done" aria-expanded={doneOpen} onClick={() => setDoneOpen((v) => !v)}>
              <span>
                <b>Done this week {doneTitles.length}</b>
                {doneOpen ? null : <span className="tk2-dn">{doneTitles.join(', ')}</span>}
              </span>
              <OIcon name="down" size={20} className={doneOpen ? 'up' : ''} />
            </button>
            {doneOpen ? (
              <ul className="tk2-dl">
                {doneTitles.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
        <aside className="tk2-dt" aria-label="Task details">
          <Details
            key={sel?.id ?? 'none'}
            t={sel}
            people={people}
            comments={sel ? (comments[sel.id] ?? []) : []}
            onApprove={() => sel && finish(sel.id, 'done')}
            onDecline={() => sel && finish(sel.id, 'declined')}
            onDone={() => sel && finish(sel.id, 'done')}
            onComment={(b) => sel && addComment(sel.id, b)}
            onClose={() => setPhoneOpen(false)}
          />
        </aside>
      </div>
    </div>
  );
}
