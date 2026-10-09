'use client';

// The dates drawing: Opens, Apply by, the interview weeks (dashed), and Decision on one true-to-scale line, with a
// Today marker. Dates are proportional to days from the opening date, so the picture is the real schedule.
// Geometry follows the drafts (landing.html at 1344px wide, landing-phone.html at 350px wide). It is measured in
// the browser because the shapes keep their pixel size while the line stretches.
import { useLayoutEffect, useRef, useState } from 'react';
import { Diamond, Ln } from './icons';

export type DatesProps = {
  /** open = applications are open (Apply by is the current joint); before = they have not opened yet. */
  mode?: 'open' | 'before';
  /** Days from the opening date to each point (today is negative before opening). */
  days?: { apply: number; interviewStart: number; interviewEnd: number; decision: number; today: number };
  /** The words on the Today marker, like "Today: 2 days left". */
  todayLabel?: string;
  /** Date text shown above each label (Google Sans Code capitals). */
  dates?: { opens: string; apply: string; interview: string; decision: string };
  /** Phone, before opening: the label above the line at the Apply by joint, like "Apply by Sep 14". */
  applyLabel?: string;
};

// Fall 2026: Aug 17 (day 0), apply by Sep 14 (28), interviews Sep 15 to Oct 9 (29 to 53), decision Oct 23 (67),
// and Sat Sep 12 as the example "today" (26) used in the drafts.
const FALL_2026: Required<Omit<DatesProps, 'mode'>> = {
  days: { apply: 28, interviewStart: 29, interviewEnd: 53, decision: 67, today: 26 },
  todayLabel: 'Today: 2 days left',
  dates: { opens: 'Aug 17', apply: 'Sep 14', interview: 'Sep 15 to Oct 9', decision: 'Oct 23' },
  applyLabel: 'Apply by Sep 14',
};

// Draws the dates chain at the width of its container: laptop labels under the line, phone labels with the
// Interview label dropped below.
export function DatesDrawing(props: DatesProps) {
  const { days, todayLabel, dates, applyLabel } = { ...FALL_2026, ...props };
  const before = props.mode === 'before';
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  // Measure the container, and again whenever it resizes.
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
  const x0 = phone ? 40 : 60;
  const x1 = w - (phone ? 10 : 12);
  const len = x1 - x0;
  const at = (d: number) => x0 + (len * d) / days.decision;
  const a = at(days.apply);
  // before opening, the Today marker sits left of the line's start, joined to it by a dashed stretch
  const t = before ? x0 - (phone ? 30 : 48) : at(days.today);
  const b0 = at(days.interviewStart);
  const b1 = at(days.interviewEnd);
  const bc = (b0 + b1) / 2;
  const svgH = phone ? 107 : 63;
  const tickEnd = (x: number) => (phone && x === bc ? 106 : 62);

  return (
    <div className="rl" ref={box}>
      {w > 0 ? (
        <>
          <p className="tdy" style={{ left: Math.max(0, Math.round(t - 20)) }}>
            {before ? 'Today' : todayLabel}
          </p>
          {before && phone ? (
            <p className="tdy" style={{ left: Math.round(a - 60), width: 120, textAlign: 'center' }}>
              {applyLabel}
            </p>
          ) : null}
          <svg width={w} height={svgH} viewBox={`0 0 ${w} ${svgH}`} aria-hidden="true" style={{ marginBottom: phone ? -44 : 0 }}>
            <Ln x1={x0} y1={y} x2={x1} y2={y} w={1.5} />
            {before ? (
              <line x1={t} y1={y} x2={x0} y2={y} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
            ) : (
              <Ln x1={x0} y1={y} x2={t} y2={y} w={3} />
            )}
            <Ln x1={x0} y1={y} x2={x0} y2={tickEnd(x0)} w={1} />
            <Ln x1={a} y1={y} x2={a} y2={tickEnd(a)} w={1} />
            <Ln x1={bc} y1={y + 6} x2={bc} y2={tickEnd(bc)} w={1} />
            <Ln x1={x1} y1={y} x2={x1} y2={tickEnd(x1)} w={1} />
            <rect x={b0} y={40} width={b1 - b0} height={12} fill="var(--bg)" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
            <path d={`M${t - 6} 32h12l-6 9z`} fill="var(--ink)" />
            <Diamond x={x0} y={y} state={before ? 'next' : 'done'} openFill="var(--bg)" />
            <Diamond x={a} y={y} state={before ? 'next' : 'now'} openFill="var(--bg)" />
            <Diamond x={x1} y={y} state="next" openFill="var(--bg)" />
          </svg>
          <ol className="hcl" style={{ height: phone ? 92 : 48 }}>
            <li style={{ left: x0 - (phone ? 10 : 12), textAlign: 'left' }}>
              <span className="cdt">{dates.opens}</span>
              <span className="clb">Opens</span>
            </li>
            {phone ? null : (
              <li style={{ left: a - 100, width: 200, textAlign: 'center' }}>
                <span className="cdt">{dates.apply}</span>
                <span className={before ? 'clb' : 'clb b'}>Apply by</span>
              </li>
            )}
            <li style={phone ? { left: bc - 75, width: 150, textAlign: 'center', top: 44 } : { left: bc - 130, width: 260, textAlign: 'center' }}>
              <span className="cdt">{dates.interview}</span>
              <span className="clb">Interview</span>
            </li>
            <li style={{ right: 0, textAlign: 'right' }}>
              <span className="cdt">{dates.decision}</span>
              <span className="clb">Decision</span>
            </li>
          </ol>
        </>
      ) : null}
    </div>
  );
}
