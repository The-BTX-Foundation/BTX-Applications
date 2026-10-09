'use client';

// Programs > Certifications (Figma "Programs > Certifications", laptop and phone): the plan numbers, the setup
// checklist, and the certification ideas. "Add an idea" and "Add a task" write through lib/actions/programs.ts
// (in memory in mock mode). The chat beside it is drawn by the page.
import { useState } from 'react';
import { addCertificationIdea, addProgramTask, setStepDone } from '@/lib/actions/programs';
import type { CertData, CertIdea, CertStep } from '@/mock/programs';
import { OIcon } from '../icons';
import { Ring } from '../ring';
import { AreaHeader, Notice, OwnerChip, StepCheck, TextForm } from '../area/parts';
import './programs.css';

export function CertView({ data }: { data: CertData }) {
  const [steps, setSteps] = useState<CertStep[]>(data.checklist.steps);
  const [ideas, setIdeas] = useState<CertIdea[]>(data.ideas);
  const [form, setForm] = useState<'idea' | 'task' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const done = steps.filter((s) => s.state === 'done').length;
  const nextIdx = steps.findIndex((s) => s.state !== 'done');
  const total = steps.length;

  // Ticks or unticks a step; the first open step after the ticked ones becomes the "next" step.
  async function toggle(id: string) {
    const s = steps.find((x) => x.id === id);
    if (!s) return;
    const nowDone = s.state !== 'done';
    const r = await setStepDone(id, nowDone);
    if (!r.ok) {
      setNote(r.message);
      return;
    }
    setNote(null);
    setSteps((list) => {
      const flipped = list.map((x) => (x.id === id ? { ...x, state: nowDone ? ('done' as const) : ('todo' as const), dueNote: nowDone ? 'Done' : undefined } : x));
      const first = flipped.findIndex((x) => x.state !== 'done');
      return flipped.map((x, i) => (x.state === 'done' ? x : { ...x, state: i === first ? ('next' as const) : ('todo' as const) }));
    });
  }

  const nowTitle = nextIdx >= 0 ? steps[nextIdx].title : null;
  const nowLine = nowTitle ? `${done} of ${total} done, now ${nowTitle}` : `${done} of ${total} done`;
  const phoneNow = nowTitle ? `${done} of ${total} done, now ${nextIdx === data.checklist.steps.findIndex((s) => s.state === 'next') ? data.checklist.phoneNowLabel : nowTitle}` : `${done} of ${total} done`;
  const addIdeaBtn = nextIdx >= 0 && steps[nextIdx].action;

  return (
    <>
      <AreaHeader
        title="Certification program"
        phoneTitle="Certifications"
        sub={data.subtitle}
        phoneSub={`Programs · setting up · ${done} of ${total} steps`}
        phoneAction={
          <button type="button" className="o-sq" aria-label="Add a task" onClick={() => setForm('task')}>
            <OIcon name="plus" size={22} />
          </button>
        }
      >
        <button type="button" className="o-btn s lg" onClick={() => setForm('task')}>
          <OIcon name="plus" size={16} />
          Add a task
        </button>
      </AreaHeader>

      {/* laptop: the plan */}
      <section className="ar-panel o-lg" aria-labelledby="ce-plan">
        <div className="ar-ph">
          <h2 id="ce-plan">The plan</h2>
        </div>
        <div className="pg-ovg">
          <div>
            <p>Pilot budget</p>
            <b>{data.plan.budget}</b>
            <span>{data.plan.budgetNote}</span>
          </div>
          <div>
            <p>Students</p>
            <b>{data.plan.students}</b>
            <span>{data.plan.studentsNote}</span>
          </div>
        </div>
      </section>

      {/* phone: the four numbers */}
      <div className="pg-stats o-ph">
        <div>
          <p>Pilot budget</p>
          <b>{data.plan.budget}</b>
          <span>{data.plan.budgetNote}</span>
        </div>
        <div>
          <p>Students</p>
          <b>{data.plan.students}</b>
          <span>{data.plan.studentsNote}</span>
        </div>
        <div>
          <p>First certifications</p>
          <b>{data.plan.first}</b>
          <span>{data.plan.firstNote}</span>
        </div>
        <div>
          <p>Ideas</p>
          <b>{ideas.length}</b>
          <span>{data.plan.ideasNote}</span>
        </div>
      </div>

      <section className="ar-panel" aria-labelledby="ce-list">
        <div className="ar-ph ring">
          <Ring frac={done / total} label={`${done}/${total}`} color="gold" size={44} />
          <div>
            <h2 id="ce-list">Setup checklist</h2>
            <p>
              <span className="o-lg">{nowLine}</span>
              <span className="o-ph">{phoneNow}</span>
            </p>
          </div>
        </div>
        <div className="pg-th o-lg" aria-hidden="true">
          <span />
          <span>Step</span>
          <span>Owner</span>
          <span>Due</span>
        </div>
        {steps.map((s) => (
          <div key={s.id} className={`pg-st${s.state === 'next' ? ' next' : ''}${s.state === 'done' ? ' done' : ''}`}>
            <StepCheck done={s.state === 'done'} label={s.title} onClick={() => toggle(s.id)} />
            <span className="pg-t">
              <b>{s.title}</b>
              {s.sub ? <span className="o-lg">{s.sub}</span> : null}
              <span className="o-ph">{s.phoneSub}</span>
            </span>
            <span className="pg-ow o-lg">
              <OwnerChip o={s.owner} solid />
            </span>
            <span className="pg-du o-lg">
              {s.due ? <b>{s.due}</b> : null}
              {s.dueNote ? <i>{s.dueNote}</i> : null}
            </span>
            <span className="pg-ac o-lg">
              {s.state === 'next' && addIdeaBtn ? (
                <button type="button" className="o-btn p" onClick={() => setForm('idea')}>
                  {s.action}
                </button>
              ) : null}
            </span>
            <span className={`ar-pill pg-pill o-ph${s.state === 'done' ? ' ink' : ''}`}>{s.state === 'done' ? 'Done' : s.state === 'next' ? 'Next' : 'Not started'}</span>
          </div>
        ))}
      </section>

      <section className="ar-panel" aria-labelledby="ce-ideas">
        <div className="ar-ph">
          <h2 id="ce-ideas">Certification ideas</h2>
          <span>Ideas, not decided</span>
        </div>
        {ideas.length === 0 ? <p className="pg-empty">No ideas yet. Add the first one from the checklist.</p> : null}
        {ideas.map((i) => (
          <div key={i.id} className="pg-idea">
            <span>
              <b>{i.name}</b>
              <span>Suggested by {i.by}</span>
            </span>
            <em>{i.decision === 'chosen' ? 'Chosen' : i.decision === 'dropped' ? 'Dropped' : 'Not decided'}</em>
          </div>
        ))}
      </section>
      <Notice text={note} />

      {form === 'idea' ? (
        <TextForm
          title="Add an idea"
          label="Certification"
          placeholder="Name of the certification"
          submit="Add idea"
          onClose={() => setForm(null)}
          onSubmit={async (name) => {
            const r = await addCertificationIdea({ programId: data.programId, name });
            if (r.ok) setIdeas((l) => [...l, { id: r.id, name, by: 'You', decision: 'not_decided' }]);
            return r;
          }}
        />
      ) : null}
      {form === 'task' ? (
        <TextForm
          title="Add a task"
          label="What needs doing"
          placeholder="Task name"
          submit="Add task"
          onClose={() => setForm(null)}
          onSubmit={async (title) => {
            const r = await addProgramTask({ title, checklistId: data.checklistId });
            if (r.ok) setSteps((l) => [...l, { id: r.id, title, sub: 'Not started', owner: null, state: l.some((x) => x.state === 'next') ? 'todo' : 'next', phoneSub: 'Not started' }]);
            return r;
          }}
        />
      ) : null}
    </>
  );
}
