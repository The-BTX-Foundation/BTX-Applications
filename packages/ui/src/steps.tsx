// The application's step progress, drawn as a load path: done joints are gold, the current one is the big
// outlined gold joint, later ones are open, and the done part of the line is thicker.
//   StepRail      laptop side rail (shown at 1024px and wider)
//   StepProgress  phone chain under the top bar (shown below 1024px)
import Link from 'next/link';
import { Diamond, Icon, Ln } from './icons';
import { HELP_EMAIL } from './top-bar';

export type Step = {
  name: string;
  /** The small line under the name: "Done", "In progress", "Not started", "Optional". */
  status: string;
  /** Where a finished step links back to. */
  href?: string;
  /** True when the step's required answers are complete (draws a gold joint even after the current step). */
  done?: boolean;
};

type RailProps = {
  steps: readonly Step[];
  /** The current step, counting from 1. */
  current: number;
  title?: string;
  subtitle?: string;
  /** The save line ("Saved 4:12 PM"). Leave out when nothing has been saved yet. */
  saved?: string;
};

// The laptop rail: title, the vertical chain with each step's name and status, and at the bottom the save line
// and the help address.
export function StepRail({ steps, current, title = 'Fall 2026 application', subtitle, saved }: RailProps) {
  const n = steps.length;
  const pitch = 64;
  const cx = 20;
  const y0 = 32;
  const ys = steps.map((_, i) => y0 + i * pitch);
  return (
    <nav className="rail" aria-label="Application steps">
      <p className="rt">{title}</p>
      {subtitle ? <p className="rs">{subtitle}</p> : null}
      <div className="ch" style={{ height: n * pitch }}>
        <svg width="40" height={n * pitch} viewBox={`0 0 40 ${n * pitch}`} aria-hidden="true">
          <Ln x1={cx} y1={ys[0]} x2={cx} y2={ys[n - 1]} w={1.5} />
          {current > 1 ? <Ln x1={cx} y1={ys[0]} x2={cx} y2={ys[current - 1]} w={3} /> : null}
          {ys.map((y) => (
            <Ln key={y} x1={cx} y1={y} x2={cx + 16} y2={y} w={1} />
          ))}
          {ys.map((y, i) => (
            <Diamond key={y} x={cx} y={y} state={i + 1 === current ? 'now' : (steps[i].done ?? i + 1 < current) ? 'done' : 'next'} />
          ))}
        </svg>
        <ol>
          {steps.map((s, i) => {
            const body = (
              <>
                <b>{s.name}</b>
                <span>{s.status}</span>
              </>
            );
            if (i + 1 !== current && (s.done ?? i + 1 < current)) {
              return (
                <li key={s.name} className="done">
                  {s.href ? <Link href={s.href}>{body}</Link> : <div>{body}</div>}
                </li>
              );
            }
            if (i + 1 === current) {
              return (
                <li key={s.name} className="now" aria-current="step">
                  <div>{body}</div>
                </li>
              );
            }
            return (
              <li key={s.name}>
                <div>{body}</div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="rf">
        {saved ? (
          <p className="sv">
            <Icon name="check" />
            <span>{saved}</span>
          </p>
        ) : null}
        <p className="hp">
          Questions?{' '}
          <a href={`mailto:${HELP_EMAIL}`} className="lk">
            {HELP_EMAIL}
          </a>
        </p>
      </div>
    </nav>
  );
}

// The phone progress: "Step 1 of 5", the save line, and the chain drawn flat across the width.
export function StepProgress({
  total,
  current,
  saved,
  done,
}: {
  total: number;
  current: number;
  saved?: string;
  /** Which steps (counting from 1) are complete; defaults to every step before the current one. */
  done?: number[];
}) {
  const w = 350;
  const pad = 12;
  const y = 12;
  const xs = Array.from({ length: total }, (_, i) => pad + (i * (w - 2 * pad)) / (total - 1));
  return (
    <div className="pg">
      <div className="pr">
        <b>
          Step {current} of {total}
        </b>
        {saved ? (
          <span>
            <Icon name="check" small />
            {saved}
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${w} 24`} aria-hidden="true" style={{ width: '100%', maxWidth: w, height: 'auto' }}>
        <Ln x1={xs[0]} y1={y} x2={xs[total - 1]} y2={y} w={1.5} />
        {current > 1 ? <Ln x1={xs[0]} y1={y} x2={xs[current - 1]} y2={y} w={3} /> : null}
        {xs.map((x, i) => (
          <Diamond key={x} x={x} y={y} state={i + 1 === current ? 'now' : (done ? done.includes(i + 1) : i + 1 < current) ? 'done' : 'next'} />
        ))}
      </svg>
    </div>
  );
}
