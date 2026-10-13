// MOCK: the numbers beside sidebar entries (what needs the signed-in person). The real counts come from the Ops Hub
// tables (tasks, approvals, unread chat, scoring queue) once they exist; until then these are the Figma frames' values.
export const NAV_COUNTS: Record<string, number> = {
  today: 6,
  chat: 4,
  scholarships: 3,
  money: 2,
  outreach: 1,
  scoring: 3,
};

// The same numbers with ?demo=stress, from the Figma stress frames. A count can be text ("99+") or a zero that is drawn.
export type Counts = Record<string, number | string>;
// Sidebar (Figma "Today, stress"): 99+ unread in Board chat, nothing waiting in Scholarships.
export const NAV_COUNTS_STRESS_SIDE: Counts = { today: 6, chat: '99+', scholarships: 0, money: 2, outreach: 1 };
// Phone tab bar (Figma "Phone: Today, stress").
export const NAV_COUNTS_STRESS_TABS: Counts = { today: '99+', chat: '99+' };
// Phone menu sheet (Figma "Phone: menu open, stress"): this frame draws Board chat and Scoring as 0.
export const NAV_COUNTS_STRESS_MENU: Counts = { today: 6, chat: 0, scoring: 0 };
