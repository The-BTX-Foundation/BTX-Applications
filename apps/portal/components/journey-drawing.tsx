'use client';

// The dates drawing for the screens after she submits (drafts status-book.html, status-booked.html, status.html,
// status-today.html, status-sent.html and their phone versions). One true-to-scale line from the day she applied to
// the decision, a Today marker, and either the interview weeks as a gold bar (no time yet) or a gold diamond at her
// interview day (booked). Day positions are measured from the application date, so the picture is the real schedule.
// Measured in the browser because the shapes keep their pixel size while the line stretches.
import { useLayoutEffect, useRef, useState } from 'react';
import { daysBetween, shortDay } from '@/lib/format';

export type JourneyDrawingProps = {
  /** "YYYY-MM-DD": the day she applied (the line starts here). */
  applied: string;
  today: string;
  decision: string;
  /** The interview weeks (shown as a gold bar) when she has no time yet. */
  window?: { start: string; end: string };
  /** Her interview day when she has booked (shown as a gold diamond). */
  at?: string;
};

export function JourneyDrawing({ applied, today, decision, window: win, at }: JourneyDrawingProps) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const phone = w > 0 && w < 700;
  const y = 46;
  const pad = phone ? 10 : 12;
  const x0 = pad;
  const x1 = w - pad;
  const total = Math.max(1, daysBetween(applied, decision));
  const at_ = (iso: string) => x0 + ((x1 - x0) * Math.min(total, Math.max(0, daysBetween(applied, iso)))) / total;
  const t = at_(today);
  const onDay = Boolean(at && today === at);
  const b0 = win ? at_(win.start) : 0;
  const b1 = win ? at_(win.end) : 0;
  const mid = at ? at_(at) : (b0 + b1) / 2;
  const label = at ? shortDay(at) : win ? `${shortDay(win.start)} to ${shortDay(win.end)}` : '';
  const triY = onDay ? 26 : 32;
  const ink = 'var(--ink)';
  const dm = (x: number, r: number) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;

  return (
    <div className="rl" ref={box} style={{ minHeight: 0, marginTop: 0 }}>
      {w > 0 ? (
        <>
          <p className="tdy" style={{ left: Math.max(0, Math.round(t - 20)), top: onDay ? 2 : 8 }}>
            Today
          </p>
          <svg width={w} height={63} viewBox={`0 0 ${w} 63`} aria-hidden="true">
            <line x1={x0} y1={y} x2={x1} y2={y} stroke={ink} strokeWidth={1.5} />
            <line x1={x0} y1={y} x2={t} y2={y} stroke={ink} strokeWidth={3} />
            <line x1={x0} y1={y} x2={x0} y2={62} stroke={ink} strokeWidth={1} />
            <line x1={x1} y1={y} x2={x1} y2={62} stroke={ink} strokeWidth={1} />
            <line x1={mid} y1={at ? y : 52} x2={mid} y2={62} stroke={ink} strokeWidth={1} />
            {win ? <rect x={b0} y={40} width={Math.max(0, b1 - b0)} height={12} fill="var(--gold)" stroke={ink} strokeWidth={1.5} /> : null}
            <path d={`M${t - 6} ${triY}h12l-6 9z`} fill={ink} />
            <path d={dm(x0, 8.5)} fill="var(--gold)" />
            {at ? <path d={dm(mid, 11)} fill="var(--gold)" stroke={ink} strokeWidth={1.5} /> : null}
            <path d={dm(x1, 7)} fill="var(--bg)" stroke={ink} strokeWidth={1.5} />
          </svg>
          <ol className="hcl" style={{ height: 48, marginTop: 8 }}>
            <li style={{ left: 0, textAlign: 'left', paddingTop: 20 }}>
              <span className="clb">Applied</span>
            </li>
            <li style={{ left: Math.round(mid - 130), width: 260, textAlign: 'center' }}>
              <span className="cdt">{label}</span>
              <span className="clb b">Interview</span>
            </li>
            <li style={{ right: 0, textAlign: 'right' }}>
              <span className="cdt">{shortDay(decision)}</span>
              <span className="clb">Decision</span>
            </li>
          </ol>
        </>
      ) : null}
    </div>
  );
}
