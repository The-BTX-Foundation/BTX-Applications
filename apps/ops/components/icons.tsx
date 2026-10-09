// Stroke icons for the Ops Hub, drawn on a 20 x 20 grid. The paths come from the Ops Hub Figma frames (the Phase A
// drafts' icon set), so the shell and the pages draw the same marks the design does.
import type { ReactNode } from 'react';

const PATHS = {
  today: (
    <>
      <circle cx="10" cy="10" r="3.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </>
  ),
  tasks: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M6.5 10l2.3 2.3L13.5 7.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4" />
    </>
  ),
  goals: (
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.8" />
      <circle cx="10" cy="10" r="0.8" />
    </>
  ),
  chat: <path d="M4 4h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 14H9l-4 3v-3H4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 4 4z" />,
  scholarships: (
    <>
      <path d="M2 8l8-4 8 4-8 4-8-4z" />
      <path d="M5 9.5V13c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5V9.5" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="5" width="15" height="10" rx="2" />
      <circle cx="10" cy="10" r="2.2" />
    </>
  ),
  programs: (
    <>
      <path d="M4.5 17.5V3" />
      <path d="M4.5 3.5h10l-2.2 3.5 2.2 3.5h-10" />
    </>
  ),
  outreach: (
    <>
      <path d="M3 8.2v3.6h3l6 4V4.2l-6 4H3z" />
      <path d="M15 7.3a3.2 3.2 0 0 1 0 5.4" />
    </>
  ),
  people: (
    <>
      <circle cx="7.5" cy="7" r="2.7" />
      <path d="M2.8 16c.6-2.7 2.5-4.2 4.7-4.2s4.1 1.5 4.7 4.2" />
      <circle cx="14" cy="7.6" r="2.2" />
      <path d="M13 12.1c2.3-.3 4.2 1 4.8 3.7" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.2 13.2L17 17" />
    </>
  ),
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  right: <path d="M7.5 5l5 5-5 5" />,
  down: <path d="M5.5 8l4.5 4.5L14.5 8" />,
  check: <path d="M5 10.5l3.2 3.2L15 6.8" />,
  menu: <path d="M3.5 6.5h15M3.5 11h15M3.5 15.5h15" />,
  close: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  upload: (
    <>
      <path d="M10 13.5V3.5M6 7.5l4-4 4 4" />
      <path d="M3.5 13v2.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V13" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </>
  ),
  file: (
    <>
      <path d="M5 2.5h6.5L15 6v11.5H5z" />
      <path d="M11.5 2.5V6H15" />
    </>
  ),
  approval: (
    <>
      <path d="M10 2.5l2 1.5 2.5-.2.8 2.4 2 1.5-.8 2.3.8 2.3-2 1.5-.8 2.4-2.5-.2-2 1.5-2-1.5-2.5.2-.8-2.4-2-1.5.8-2.3-.8-2.3 2-1.5.8-2.4 2.5.2z" />
      <path d="M7.3 10l1.9 1.9 3.6-3.7" />
    </>
  ),
  scoring: (
    <>
      <path d="M4 5h12M4 10h12M4 15h7" />
      <path d="M14 13.5l1.4 1.4 2.6-2.8" />
    </>
  ),
  meeting: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M6.8 10.2l2.2 2.2 4.2-4.4" />
    </>
  ),
  more: (
    <>
      <circle cx="4.5" cy="10" r="1.1" fill="currentColor" />
      <circle cx="10" cy="10" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.1" fill="currentColor" />
    </>
  ),
  send: <path d="M10 16V4.5M5 9.5l5-5 5 5" />,
  refresh: (
    <>
      <path d="M16 8.5A6 6 0 0 0 5.2 6.3L4 7.8" />
      <path d="M4 3.8v4h4" />
      <path d="M4 11.5a6 6 0 0 0 10.8 2.2l1.2-1.5" />
      <path d="M16 16.2v-4h-4" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

export type OpsIconName = keyof typeof PATHS;

// A stroke icon at a chosen size (default 20). Decorative, so it is hidden from screen readers.
export function OIcon({ name, size = 20, className }: { name: OpsIconName; size?: number; className?: string }) {
  return (
    <svg
      className={`o-i${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

// The load-error mark: an outlined circle with a "!" (the Ops Hub's shared "didn't load" card).
export function AlertMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="13" cy="13" r="10.5" />
      <path d="M13 7.5v7" />
      <circle cx="13" cy="18.2" r="0.6" fill="var(--ink)" />
    </svg>
  );
}
