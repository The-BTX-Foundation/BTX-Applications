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
