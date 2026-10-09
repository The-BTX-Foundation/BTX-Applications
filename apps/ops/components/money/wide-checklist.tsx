'use client';

// A checklist panel for the Money pages ("Year-end giving", "Getting started with grants"; Figma "checklist pattern"):
// a progress ring and title, then the steps with owner and due date. The step that is up next has the gold row and
// "Next · Owner". On a phone the panel is one card that opens to show the steps.
import { useState } from 'react';
import { OIcon } from '@/components/icons';
import { Ring } from '@/components/ring';
import { dateOnlyLabel } from '@/lib/format';
import { checklistLine, type WideChecklist } from '@/lib/money-shared';
import { Tick, WhoMark } from './ui';

// `only` draws just the laptop table or just the phone card (a page may place them differently).
export function WideChecklistPanel({ list, only, now }: { list: WideChecklist; only?: 'lg' | 'ph'; now?: string }) {
  const done = list.steps.filter((s) => s.done).length;
  const next = list.steps.find((s) => s.current);
  const [open, setOpen] = useState(false);
  // The phone card names the date only when the next step is due within two weeks.
  const soon = next?.due_on && now ? (Date.parse(next.due_on) - Date.parse(now.slice(0, 10))) / 86_400_000 <= 14 : false;
  const owner = next?.owner.kind === 'person' ? next.owner.name : next?.owner.kind === 'group' ? next.owner.name : 'Unassigned';
  return (
    <>
      {only === 'ph' ? null : (
      <section className="o-card mn-panel mn-wide o-lg" aria-labelledby={`wc-${list.id}`}>
        <div className="mn-q4h">
          <Ring frac={done / list.steps.length} label={`${done}/${list.steps.length}`} color="gold" size={44} />
          <div>
            <h2 id={`wc-${list.id}`}>{list.title}</h2>
            <p>{checklistLine(list)}</p>
          </div>
        </div>
        <div className="mn-th mn-wrow">
          <span />
          <span>Step</span>
          <span>Owner</span>
          <span>Due</span>
          <span />
        </div>
        {list.steps.map((s) => (
          <div key={s.id} className={`mn-tr mn-wrow${s.current ? ' cur' : ''}`}>
            <Tick done={s.done} />
            <span className="mn-wt">
              <b>{s.title}</b>
              <span>{s.kind}</span>
            </span>
            <WhoMark who={s.owner} />
            <span className="mn-due">
              {s.due_on ? dateOnlyLabel(s.due_on) : ''}
              {s.done ? <span>Done</span> : null}
            </span>
            <span className="mn-next">{s.current ? `Next · ${owner}` : ''}</span>
          </div>
        ))}
      </section>
      )}

      {only === 'lg' ? null : (
      <section className="o-card mn-wcard o-ph" aria-label={list.title}>
        <button type="button" className="mn-wcard-h" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Ring frac={done / list.steps.length} label={`${done}/${list.steps.length}`} color="gold" size={32} />
          <span className="mn-wcard-t">
            <b>{list.title.replace(' with grants', '')}</b>
            <span>
              {checklistLine(list)}
              {next ? ` · ${owner}${soon && next.due_on ? `, ${dateOnlyLabel(next.due_on)}` : ''}` : ''}
            </span>
          </span>
          <OIcon name={open ? 'down' : 'right'} size={18} />
        </button>
        {open
          ? list.steps.map((s) => (
              <div key={s.id} className={`mn-wcard-s${s.current ? ' cur' : ''}`}>
                <Tick done={s.done} />
                <span>
                  <b>{s.title}</b>
                  <span>
                    {s.owner.kind === 'person' || s.owner.kind === 'group' ? s.owner.name : 'Unassigned'}
                    {s.due_on ? ` · ${dateOnlyLabel(s.due_on)}` : ''}
                  </span>
                </span>
              </div>
            ))
          : null}
      </section>
      )}
    </>
  );
}
