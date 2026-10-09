'use client';

// Outreach > Instagram (Figma "Outreach > Instagram", laptop and phone): the posts by month with how far each has got,
// and the selected post's checklist, caption preview and photo. "Add a post" and "Send for approval" write through
// lib/actions/outreach.ts (in memory in mock mode). Post images are not stored yet (the draft has no bucket), so the
// photo box is a placeholder in every mode.
import { useLayoutEffect, useRef, useState } from 'react';
import { addPost, sendPostForApproval } from '@/lib/actions/outreach';
import type { InstagramData, Post, PostStep } from '@/mock/outreach';
import { OIcon } from '../icons';
import { Ring } from '../ring';
import { AreaHeader, Glyph, Notice, OwnerChip, StepCheck } from '../area/parts';
import { dayWord, PostForm } from './post-form';
import './outreach.css';

// The five steps of a post, from how many are done.
function stepsOf(p: Post): PostStep[] {
  const names = ['Draft the caption', 'Pick the photo', `Board approval: ${p.approver}`, 'Schedule it', 'Mark it posted'];
  return names.map((title, i) => ({ title, state: i < p.done ? 'done' : i === p.done ? 'now' : 'todo' }));
}

// A small ring for the Progress column (no label inside).
function MiniRing({ done }: { done: number }) {
  return (
    <span className="ou-mini">
      <Ring frac={done / 5} label="" color="gold" size={44} />
    </span>
  );
}

function Detail({ post, onSend, note }: { post: Post; onSend: () => void; note: string | null }) {
  const steps = stepsOf(post);
  const now = steps.find((s) => s.state === 'now');
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const cap = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  const [full, setFull] = useState(false);
  useLayoutEffect(() => {
    const el = cap.current;
    if (el && !full) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [post.caption, full]);
  const atApproval = now?.title.startsWith('Board approval');
  return (
    <>
      <div className="ou-dh">
        <p>Instagram post · {post.date}</p>
        <h2>{post.title}</h2>
      </div>
      <div className="ou-dbody">
        <div className="ou-chk">
          <Ring frac={doneCount / 5} label={`${doneCount}/5`} color="gold" size={44} />
          <div>
            <h3>Post checklist</h3>
            <p>{now ? `${doneCount} of 5 done, now ${now.title.split(':')[0]}` : `${doneCount} of 5 done`}</p>
          </div>
        </div>
        <ul className="ou-steps">
          {steps.map((s) => (
            <li key={s.title} className={s.state}>
              <StepCheck done={s.state === 'done'} label={s.title} />
              <span>{s.title}</span>
              {s.state === 'done' ? <i>Done</i> : s.state === 'now' ? <i>Now</i> : null}
            </li>
          ))}
        </ul>
        <div className="ou-cap">
          <b>Caption preview</b>
          <p ref={cap} className={full ? 'full' : ''}>
            {post.caption ?? 'No caption yet.'}
          </p>
          {clipped || full ? (
            <button type="button" className="ou-ul" onClick={() => setFull((v) => !v)}>
              {full ? 'Show less' : 'Show full caption'}
            </button>
          ) : null}
        </div>
        <div className="ou-photo">
          <Glyph name="image" size={16} />
          {post.photo}
        </div>
        {atApproval || post.sent ? (
          <button type="button" className="o-btn p ou-send" onClick={onSend} disabled={post.sent}>
            {post.sent ? 'Sent for approval' : 'Send for approval'}
          </button>
        ) : null}
        <Notice text={note} />
      </div>
    </>
  );
}

export function InstagramView({ data }: { data: InstagramData }) {
  const [posts, setPosts] = useState<Post[]>(data.posts);
  const [sel, setSel] = useState<string>(data.posts[0]?.id ?? '');
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const upcoming = posts.filter((p) => p.group === 'upcoming');
  const past = posts.filter((p) => p.group === 'posted');
  const selected = posts.find((p) => p.id === sel) ?? posts[0];
  const shownPhone = showAll ? upcoming : upcoming.slice(0, 3);
  const monthCount = Math.max(data.monthCount, upcoming.length);

  async function send(p: Post) {
    const r = await sendPostForApproval(p.id);
    if (!r.ok) return setNote(r.message);
    setNote(null);
    setPosts((l) => l.map((x) => (x.id === p.id ? { ...x, sent: true, state: `Waiting on ${x.approver.split(' ')[0]}`, phoneState: 'Waiting on the board' } : x)));
  }

  const row = (p: Post) => (
    <button key={p.id} type="button" className={`ou-pr${p.id === selected?.id ? ' on' : ''}`} onClick={() => setSel(p.id)} aria-pressed={p.id === selected?.id}>
      <span className="ou-pt">
        <b title={p.title}>{p.title}</b>
        <span className="o-lg">
          <Glyph name="image" size={13} />
          Instagram post
        </span>
        <span className="o-ph">
          {p.date} · {p.owner === 'unassigned' || !p.owner ? 'Unassigned' : p.owner.name}
        </span>
      </span>
      <span className="ou-pd o-lg">{p.date}</span>
      <span className="ou-po o-lg">
        <OwnerChip o={p.owner} />
      </span>
      <span className="ou-pp o-lg">
        {p.state === 'Posted' ? null : (
          <>
            <MiniRing done={p.done} />
            {p.done} of 5
          </>
        )}
      </span>
      <span className={`ou-ps o-lg${p.state === 'Posted' ? ' posted' : ''}`}>
        {p.state === 'Posted' ? (
          <span className="ar-pill soft">
            <Glyph name="tick" size={12} />
            Posted
          </span>
        ) : (
          p.state
        )}
      </span>
      <span className={`ou-phs o-ph${p.phoneState === 'Not started' ? ' pill' : ''}`}>{p.phoneState}</span>
      <span className="ou-ph5 o-ph">{p.done} of 5</span>
    </button>
  );

  return (
    <>
      <AreaHeader
        tall
        title="Instagram"
        sub={data.subtitle}
        phoneSub={data.phoneSub}
        phoneAction={
          <button type="button" className="o-sq" aria-label="Add a post" onClick={() => setAdding(true)}>
            <OIcon name="plus" size={22} />
          </button>
        }
      >
        <button type="button" className="o-btn s lg ou-addp" onClick={() => setAdding(true)}>
          <OIcon name="plus" size={16} />
          Add a post
        </button>
      </AreaHeader>

      <div className="ou-ig">
        {/* laptop: the table */}
        <section className="ar-panel ou-list o-lg" aria-label="Posts">
          <div className="ou-lth" aria-hidden="true">
            <span>Post</span>
            <span>Date</span>
            <span>Owner</span>
            <span>Progress</span>
            <span>State</span>
          </div>
          <p className="ou-grp">
            {data.monthLabel} <i>{monthCount}</i>
          </p>
          {upcoming.map(row)}
          <p className="ou-grp">
            {data.pastLabel} <i>{Math.max(data.pastCount, past.length)}</i>
          </p>
          {past.map(row)}
        </section>

        {/* phone: the month card */}
        <section className="ar-panel ou-month o-ph" aria-label="Posts">
          <div className="ou-mh">
            <h2>{data.monthLabel}</h2>
            <p>
              {plural(monthCount)} · target {data.target}
            </p>
          </div>
          {shownPhone.map(row)}
          {!showAll && monthCount > shownPhone.length ? (
            <button type="button" className="ou-ul ou-all" onClick={() => setShowAll(true)}>
              Show all {monthCount}
            </button>
          ) : null}
        </section>

        {selected ? (
          <section className="ar-panel ou-detail" aria-label="The selected post">
            <Detail post={selected} onSend={() => send(selected)} note={note} />
          </section>
        ) : null}
      </div>

      {adding ? (
        <PostForm
          title="Add a post"
          staff={data.staff}
          channelId={data.channelId}
          onClose={() => setAdding(false)}
          onSaved={(p) => {
            setPosts((l) => [
              ...l.filter((x) => x.group === 'upcoming'),
              { id: p.id, title: p.title, date: dayWord(p.postOn), owner: p.owner ?? 'unassigned', done: 0, state: 'Not started', phoneState: 'Not started', group: 'upcoming', approver: 'Kelsey Davis', caption: null, photo: '[Photo]' },
              ...l.filter((x) => x.group === 'posted'),
            ]);
            setSel(p.id);
          }}
        />
      ) : null}
    </>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? 'post' : 'posts'}`;
