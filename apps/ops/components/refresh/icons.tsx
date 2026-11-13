// The refreshed pages' bare line icons, drawn on a 24 x 24 grid with a 1.75 stroke (.rf-i, 20px unless a rule sizes it).
// Every symbol the demo pages' sprites define (apps/design/ops-refresh/directions/p-*/index.html), drawn and named as the
// demo does, so a page draws the same marks its signed-off demo does. Where demos drew a symbol two ways, the most common
// drawing wins, except `video`, which keeps Today's signed-off drawing. `scoring` is Today's area mark for Scoring.
import type { ReactNode } from 'react';

const PATHS = {
  alert: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.5v.01" /></>),
  approve: (<><path d="M12 3l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 21l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.1z" /><path d="M8.8 12.2l2.2 2.2 4.2-4.4" /></>),
  auto: (<><path d="M19 8a7.5 7.5 0 00-13.5-1.5M5 16a7.5 7.5 0 0013.5 1.5" /><path d="M5.5 3v3.5H9M18.5 21v-3.5H15" /></>),
  award: (<><circle cx="12" cy="9" r="5.5" /><path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5" /></>),
  back: <path d="M15 6l-6 6 6 6" />,
  bell: (<><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 004 0" /></>),
  cal: (<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>),
  cap: (<><path d="M2.5 9.5L12 5l9.5 4.5L12 14z" /><path d="M6.5 11.5v4c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2v-4M21.5 9.5v5" /></>),
  cert: (<><circle cx="12" cy="9" r="5" /><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5L15 13.5" /></>),
  chat: <path d="M5 5h14a1 1 0 011 1v10a1 1 0 01-1 1h-8l-5 3v-3H5a1 1 0 01-1-1V6a1 1 0 011-1z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chev: <path d="M9 6l6 6-6 6" />,
  clock: (<><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>),
  down: <path d="M6 9l6 6 6-6" />,
  file: (<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  gift: (<><rect x="4" y="9" width="16" height="11" rx="1" /><path d="M3 9h18M12 9v11M12 9c-1.5-3-5-3.5-5-1.2C7 9 12 9 12 9zM12 9c1.5-3 5-3.5 5-1.2C17 9 12 9 12 9z" /></>),
  goals: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>),
  grip: <path d="M9 6v.01M15 6v.01M9 12v.01M15 12v.01M9 18v.01M15 18v.01" strokeWidth="3" />,
  image: (<><rect x="4" y="5" width="16" height="14" rx="1.5" /><circle cx="9" cy="10" r="1.6" /><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19 17" /></>),
  key: (<><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2 2M14 9l2 2" /></>),
  lock: (<><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></>),
  mail: (<><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="M4 7l8 6 8-6" /></>),
  mega: (<><path d="M4 10v4h3l7 4V6L7 10z" /><path d="M17.5 9.5a3.5 3.5 0 010 5" /></>),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  money: (<><rect x="3" y="6" width="18" height="12" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>),
  open: <path d="M5 12h14M13 6l6 6-6 6" />,
  pen: (<><path d="M5 19l1-4L15.5 5.5a2 2 0 013 3L9 18z" /><path d="M13.5 7.5l3 3" /></>),
  people: (<><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><circle cx="17" cy="9.5" r="2.5" /><path d="M16 14.5c2.3 0 4 1.4 4.5 4" /></>),
  photo: (<><rect x="3" y="6" width="18" height="13" rx="2" /><circle cx="12" cy="12.5" r="3.2" /><path d="M8.5 6l1.5-2h4l1.5 2" /></>),
  pin: (<><path d="M9 4h6l-1 5 3 3v1H7v-1l3-3z" /><path d="M12 13v7" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (<><path d="M19 12a7 7 0 11-2.1-5" /><path d="M19 4v4h-4" /></>),
  score: <path d="M5 7h10M5 12h14M5 17h7" />,
  scoring: (<><path d="M5 6h14M5 12h14M5 18h8" /><path d="M16 16.5l1.8 1.8L21 15" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  send: (<><path d="M4 12l16-7-6 16-3-7z" /><path d="M11 14l9-9" /></>),
  share: <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v6h14v-6" />,
  snooze: (<><circle cx="12" cy="13" r="7" /><path d="M12 9.5V13l2.5 1.5M5 4.5L3 6.5M19 4.5l2 2" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>),
  task: (<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  up: <path d="M6 15l6-6 6 6" />,
  upload: <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v4h14v-4" />,
  video: (<><rect x="3" y="7" width="12" height="10" rx="1.5" /><path d="M15 11l6-3v8l-6-3" /></>),
  wait: (<><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>),
  x: <path d="M6 6l12 12M18 6L6 18" />,
} as const satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/** Every icon name, for tests and pickers. */
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

// One bare line icon (decorative, hidden from screen readers). Size comes from the CSS (.rf-i is 20px).
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`rf-i${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
