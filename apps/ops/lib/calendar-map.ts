// Pure mapping for the refreshed Calendar page's live mode: the merged CalItems that lib/calendar.ts reads from the real
// tables (calendar_events, interviews, tasks, posts, milestones, the cycle's dates) -> the view contract (lib/calendar-view.ts).
// No server imports, so it is unit-tested (tests/calendar-map.test.ts).
import { MO, WD, atDay } from './refresh-time';
import type { CalendarData, CalItem } from '@/components/calendar/types';
import type { CalendarView, CalViewItem } from './calendar-view';

/** "10:00 AM" -> 600; null or anything else -> null. */
export function minutesOf(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!m) return null;
  return (Number(m[1]) % 12) * 60 + Number(m[2]) + (m[3].toUpperCase() === 'PM' ? 720 : 0);
}

/** Eastern minutes after midnight of an instant (a timed thing before this is past). */
export function easternMinutes(instant: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return get('hour') * 60 + get('minute');
}

/** "Tue, Nov 10" for the header. */
export function headerDate(day: string): string {
  const d = atDay(day);
  return `${WD[d.getUTCDay()]}, ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** One merged CalItem -> one row of the refreshed page. */
export function toViewItem(i: CalItem): CalViewItem {
  const kind = i.span ? 'span' : i.source;
  // A bar's title drops the "to Fri Nov 20" its chip carries (the row's meta line says the dates).
  const title = i.source === 'interview' ? i.student || i.code || 'Interview' : kind === 'span' ? i.title.replace(/, to [A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}$/, '') : i.title;
  return {
    id: i.id,
    kind,
    area: i.area,
    date: i.date,
    endDate: kind === 'span' ? (i.endDate ?? i.date) : null,
    time: kind === 'span' ? null : minutesOf(i.start),
    title,
    code: i.source === 'interview' ? i.code || null : null,
    // An event's merged chip starts with its time ("6:00 Board meeting"); the page adds the time itself.
    chip: i.source === 'event' && !i.span ? i.title : i.chip,
    people: i.people,
    // Live mode has no "waits on" data and no done marks on cycle dates yet.
    waiting: null,
    done: false,
    ...(i.source === 'event' && i.eventKind ? { eventKind: i.eventKind } : {}),
  };
}

/**
 * Builds the live view from the merged calendar data. Live caps: `add` true (calendar_events insert; the
 * calendar_events_team_all policy lets admin and board insert), `undoAdd` true (the same policy lets them delete the row
 * they just added: Undo is that reverse write), `share` and `nudge` false (no backend: the "Needs you" card and the nudge
 * are drawn only in mock mode), so `needs` is null.
 */
export function liveCalendarView(data: CalendarData, nowInstant: string): CalendarView {
  return {
    today: data.today,
    nowMin: easternMinutes(nowInstant),
    dateLabel: headerDate(data.today),
    me: data.me,
    people: data.people,
    items: data.items.map(toViewItem),
    itemsFailed: false,
    needs: null,
    caps: { add: true, undoAdd: true, share: false, nudge: false },
  };
}
