'use client';

// Programs > Mentorship (Figma "Programs > Mentorship", laptop and phone): the program is planned, not active, so the
// page is its "Where it stands" checklist. "Share the application" has nothing to call in the draft schema (there is no
// mentor application table), so it answers "not connected yet". Mentor pairings have no table either, so the page has no
// pairing list yet.
import { useState } from 'react';
import { setStepDone, shareMentorApplication } from '@/lib/actions/programs';
import type { MentorData, MentorStep } from '@/mock/programs';
import { Ring } from '../ring';
import { AreaHeader, Notice, OwnerChip, StepCheck } from '../area/parts';
import './programs.css';

export function MentorshipView({ data }: { data: MentorData }) {
  const [steps, setSteps] = useState<MentorStep[]>(data.steps);
  const [note, setNote] = useState<string | null>(null);
  const done = steps.filter((s) => s.state === 'done').length;
  const total = steps.length;
  const now = steps.find((s) => s.state !== 'done');

  async function toggle(id: string) {
    const s = steps.find((x) => x.id === id);
    if (!s) return;
    const nowDone = s.state !== 'done';
    const r = await setStepDone(id, nowDone);
    if (!r.ok) return setNote(r.message);
    setNote(null);
    setSteps((l) => l.map((x) => (x.id === id ? { ...x, state: nowDone ? 'done' : 'todo', status: nowDone ? 'Done' : 'Not started', phoneSub: nowDone ? 'Done' : 'Not scheduled', phonePill: nowDone ? 'Done' : 'Not started' } : x)));
  }

  async function share() {
    const r = await shareMentorApplication();
    setNote(r.ok ? null : r.message);
  }

  return (
    <>
      <AreaHeader title="Mentorship program" sub={data.subtitle} phoneSub={data.phoneSub} />

      <div className="pg-stats one o-ph">
        <div>
          <p>Launch date</p>
          <b>{data.launch.value}</b>
          <span>{data.launch.note}</span>
        </div>
      </div>

      <section className="ar-panel" aria-labelledby="mn-list">
        <div className="ar-ph ring">
          <Ring frac={done / total} label={`${done}/${total}`} color="gold" size={44} />
          <div>
            <h2 id="mn-list">Where it stands</h2>
            <p>{now ? `${done} of ${total} done, now ${now.title}` : `${done} of ${total} done`}</p>
          </div>
        </div>
        {steps.map((s) => (
          <div key={s.id} className={`pg-mn${s.state === 'done' ? ' done' : ''}`}>
            <StepCheck done={s.state === 'done'} label={s.title} onClick={() => toggle(s.id)} />
            <span className="pg-mn-t">
              <b>
                <span className="o-lg">{s.title}</span>
                <span className="o-ph">{s.phoneTitle ?? s.title}</span>
              </b>
              {s.unassigned ? (
                <span className="pg-mn-un o-lg">
                  <OwnerChip o="unassigned" />
                </span>
              ) : null}
              <span className="o-ph">{s.phoneSub}</span>
              {s.action ? (
                <button type="button" className="o-btn s pg-mn-btn o-ph" onClick={share}>
                  {s.action}
                </button>
              ) : null}
            </span>
            {s.action ? (
              <button type="button" className="o-btn s pg-mn-btn o-lg" onClick={share}>
                {s.action}
              </button>
            ) : s.status ? (
              <span className="pg-mn-st o-lg">{s.status}</span>
            ) : null}
            {s.phonePill ? <span className={`ar-pill pg-mn-pill o-ph${s.state === 'done' ? ' ink' : ''}`}>{s.phonePill}</span> : null}
          </div>
        ))}
      </section>
      <Notice text={note} />
    </>
  );
}
