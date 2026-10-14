// Pure part of the Calendar loader: merges the rows of every source table into one sorted list of CalItems. No server
// imports, so tests can use it.
import { dateOnlyLabel, timeLabel } from './format';
import { easternDate, plusDays } from './team-dates';
import { lateText } from './tasks-shared';
import type { CalArea, CalItem } from '@/components/calendar/types';
import { minutes } from '@/components/calendar/dates';

export type CalSources = {
  events: { id: string; title: string; area: string | null; starts_at: string; all_day: boolean; video_url: string | null; owner_id: string | null }[];
  /** Booked interviews with their pair (interview_pairings) and code (application_reviews). */
  interviews: { slot_id: string; starts_at: string; code: string; people: string[]; video_url: string | null }[];
  /** Open tasks with a due date, and who they are assigned to. */
  tasks: { id: string; title: string; area: string; due_on: string; people: string[] }[];
  posts: { id: string; title: string; post_on: string; channel: string; owner_id: string | null }[];
  cycles: { id: string; opens_at: string | null; closes_at: string | null; interview_start: string | null; interview_end: string | null; decision_date: string | null }[];
  milestones: { id: string; name: string; area: string; due_on: string }[];
};

const AREAS: CalArea[] = ['scholarships', 'programs', 'money', 'outreach'];
const area = (a: string | null | undefined): CalArea => (AREAS.includes(a as CalArea) ? (a as CalArea) : 'scholarships');
// "7:00 PM" -> "7:00" (the month grid's chips drop AM/PM).
const short = (t: string) => t.replace(/ (AM|PM)$/, '');

// Everything on the calendar, sorted by day and then by time (all-day and due items first).
export function buildCalendarItems(s: CalSources, today: string): CalItem[] {
  const out: CalItem[] = [];
  for (const e of s.events) {
    const start = e.all_day ? null : timeLabel(e.starts_at);
    out.push({ id: `ev-${e.id}`, date: easternDate(e.starts_at), source: 'event', area: area(e.area), chip: start ? `${short(start)} ${e.title}` : e.title, title: e.title, start, people: e.owner_id ? [e.owner_id] : [], video: Boolean(e.video_url) });
  }
  for (const i of s.interviews) {
    const start = timeLabel(i.starts_at);
    out.push({ id: `iv-${i.slot_id}`, date: easternDate(i.starts_at), source: 'interview', area: 'scholarships', chip: `${short(start)} Interview`, title: `Interview ${i.code}`, start, people: i.people, video: Boolean(i.video_url) });
  }
  for (const t of s.tasks) {
    if (t.due_on < today) {
      const late = Math.round((Date.parse(today) - Date.parse(t.due_on)) / 86_400_000);
      out.push({ id: `tk-${t.id}`, date: t.due_on, endDate: plusDays(today, -1), source: 'task', area: area(t.area), chip: `${t.title}, ${lateText(late)}`, title: t.title, start: null, people: t.people, span: true, late: true });
    } else {
      out.push({ id: `tk-${t.id}`, date: t.due_on, source: 'task', area: area(t.area), chip: t.title, title: t.title, start: null, people: t.people });
    }
  }
  for (const p of s.posts) out.push({ id: `po-${p.id}`, date: p.post_on, source: 'post', area: 'outreach', chip: p.channel, title: p.title, start: null, people: p.owner_id ? [p.owner_id] : [] });
  for (const c of s.cycles) {
    const one = (key: string, date: string | null, label: string) => {
      if (date) out.push({ id: `cy-${c.id}-${key}`, date: date.length > 10 ? easternDate(date) : date, source: 'cycle', area: 'scholarships', chip: label, title: label, start: null, people: [] });
    };
    one('open', c.opens_at, 'Applications open');
    one('close', c.closes_at, 'Applications close');
    if (c.interview_start && c.interview_end) {
      const label = `Interviews, to ${dateOnlyLabel(c.interview_end)}`;
      out.push({ id: `cy-${c.id}-iv`, date: c.interview_start, endDate: c.interview_end, source: 'cycle', area: 'scholarships', chip: label, title: label, start: null, people: [], span: true });
    }
    one('decision', c.decision_date, 'Decisions out');
  }
  for (const m of s.milestones) out.push({ id: `ms-${m.id}`, date: m.due_on, source: 'task', area: area(m.area), chip: m.name, title: m.name, start: null, people: [] });
  return out.sort((a, b) => a.date.localeCompare(b.date) || minutes(a.start) - minutes(b.start));
}
