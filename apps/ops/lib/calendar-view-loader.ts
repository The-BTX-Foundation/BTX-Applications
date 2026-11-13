// The Calendar page's loader (refreshed page, shape in lib/calendar-view.ts). Mock mode (no Supabase env) returns the demo's
// sample from mock/calendar-view.ts; live mode reads the real tables through lib/calendar.ts and maps them in lib/calendar-map.ts.
import { hasSupabaseEnv } from '@btx/data';
import { CALENDAR_VIEW, CALENDAR_VIEW_EMPTY, CALENDAR_VIEW_STRESS } from '@/mock/calendar-view';
import { loadCalendar } from './calendar';
import { liveCalendarView } from './calendar-map';
import type { CalendarResult } from './calendar-view';

/**
 * Loads what the Calendar page draws. Mock mode only (live mode ignores `demo`): `?demo=stress` the crowded day and the
 * longest names, `?demo=empty` nothing set yet, `?demo=error` the calendar panel's own load error (the title still draws),
 * `?demo=failed` the whole-page "didn't load" card. (`?demo=loading` is handled by the page: it draws the skeleton.)
 */
export async function loadCalendarView({ demo }: { demo?: string } = {}): Promise<CalendarResult> {
  if (!hasSupabaseEnv()) {
    if (demo === 'failed') return { failed: true };
    const view = demo === 'stress' ? CALENDAR_VIEW_STRESS : demo === 'empty' ? CALENDAR_VIEW_EMPTY : CALENDAR_VIEW;
    return demo === 'error' ? { ...view, items: [], needs: null, itemsFailed: true, failed: false } : { ...view, failed: false };
  }
  const data = await loadCalendar();
  if (data.failed) return { failed: true };
  return { ...liveCalendarView(data, new Date().toISOString()), failed: false };
}
