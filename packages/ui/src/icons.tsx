// Stroke icons (20 x 20) and the drawn marks (error icon, diamonds) used across the BTX apps.
// The paths come from the Phase A kit (phase-a/portal/gen/pkit.py).
import type { CSSProperties } from 'react';

const PATHS = {
  check: <path d="M5 10.5l3.2 3.2L15 6.8" />,
  left: <path d="M12.5 5l-5 5 5 5" />,
  right: <path d="M7.5 5l5 5-5 5" />,
  down: <path d="M5.5 8l4.5 4.5L14.5 8" />,
  lock: (
    <>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </>
  ),
  menu: <path d="M3.5 6.5h13M3.5 10h13M3.5 13.5h13" />,
  close: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  user: (
    <>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 17c.8-3.3 3.2-5 6.2-5s5.4 1.7 6.2 5" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M3 5.5l7 5.5 7-5.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = {
  name: IconName;
  /** Draw it at 16px instead of 20px. */
  small?: boolean;
};

// An inline stroke icon. Decorative, so it is hidden from screen readers.
export function Icon({ name, small }: IconProps) {
  return (
    <svg className={small ? 'i sm' : 'i'} viewBox="0 0 20 20" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// The website's error icon: a filled ink circle with a "!".
export function ErrorIcon() {
  return (
    <svg className="ei" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill="var(--ink)" />
      <path d="M9 4.6v5.4" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="13.2" r="1.2" fill="var(--bg)" />
    </svg>
  );
}

// The select chevron (14 x 9).
export function Chevron() {
  return (
    <svg className="cv" width="14" height="9" viewBox="0 0 14 9" aria-hidden="true">
      <path d="M1.5 1.5l5.5 5.5 5.5-5.5" fill="none" stroke="var(--ink)" strokeWidth="1.8" />
    </svg>
  );
}

export type DiamondState = 'done' | 'now' | 'next';

// A joint on a load-path drawing: done = gold diamond, now = bigger gold diamond with an ink outline,
// next = open diamond. `openFill` is the ground the open diamond sits on.
export function Diamond({
  x,
  y,
  state,
  openFill = 'var(--surface)',
}: {
  x: number;
  y: number;
  state: DiamondState;
  openFill?: string;
}) {
  const r = { done: 8.5, now: 11, next: 7 }[state];
  const d = `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;
  if (state === 'done') return <path d={d} fill="var(--gold)" />;
  if (state === 'now') return <path d={d} fill="var(--gold)" stroke="var(--ink)" strokeWidth="1.5" />;
  return <path d={d} fill={openFill} stroke="var(--ink)" strokeWidth="1.5" />;
}

// A straight ink line used by the drawings.
export function Ln({
  x1,
  y1,
  x2,
  y2,
  w,
  style,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  style?: CSSProperties;
}) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth={w} style={style} />;
}
