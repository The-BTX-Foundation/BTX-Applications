'use client';

// "Areas" on Today: one row per area with its icon, its name and one drawn mark (a progress track with the deadline tick,
// a row of squares, or a plain line), and tapping the row peeks one more line under it.
import { useState } from 'react';
import type { AreaMark, AreaRow } from '@/lib/today-view';
import { Panel } from '@/components/refresh/panel';
import { Fold, Nw } from './parts';
import { AREA_ICON, TdIcon } from './td-icons';

// The mark under an area's name.
function Mark({ mark }: { mark: AreaMark }) {
  if (mark.kind === 'text') return <span className="td-k">{mark.text}</span>;
  if (mark.kind === 'squares') {
    return (
      <>
        <span className="rf-sq" role="img" aria-label={`${mark.left} done`}>
          {Array.from({ length: mark.total }, (_, i) => (
            <span key={i} className={i < mark.done ? 'rf-on' : undefined} />
          ))}
        </span>
        <span className="td-ml">
          <span>{mark.left}</span>
        </span>
      </>
    );
  }
  const pct = mark.total > 0 ? Math.min(100, (mark.done / mark.total) * 100) : 0;
  return (
    <>
      <span className="td-track" role="img" aria-label={`${mark.left}, ${mark.title}`}>
        {pct > 0 ? <span className="td-fill" style={{ width: `${pct}%` }} /> : null}
        <span className="td-tick" />
      </span>
      <span className="td-ml">
        <span>{mark.left}</span>
        {mark.right ? <span title={mark.title}>{mark.right}</span> : null}
      </span>
    </>
  );
}

// The panel.
export function Areas({ areas }: { areas: AreaRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (areas.length === 0) return null;
  // Opens or closes one area's peek line.
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Panel id="td-ah" title="Areas" className="td-areas">
        <ul>
          {areas.map((a) => (
            <li key={a.id}>
              <button type="button" className="td-area" aria-expanded={open.has(a.id)} aria-controls={`td-ar-${a.id}`} onClick={() => toggle(a.id)}>
                <span className="rf-kt" aria-hidden="true">
                  <TdIcon name={AREA_ICON[a.icon] ?? 'task'} />
                </span>
                <span className="td-am">
                  <span className="td-an">{a.name}</span>
                  <Mark mark={a.mark} />
                </span>
                <TdIcon name="down" className="td-ach" />
              </button>
              <Fold open={open.has(a.id)} id={`td-ar-${a.id}`}>
                <p className="td-peekline">
                  <Nw text={a.peek} />
                </p>
              </Fold>
            </li>
          ))}
        </ul>
    </Panel>
  );
}
