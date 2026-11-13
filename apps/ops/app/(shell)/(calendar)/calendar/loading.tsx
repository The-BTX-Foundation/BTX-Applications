// Shown at once while the Calendar's server data loads (Next.js loading file, for /calendar only: this is the (calendar)
// route group): the same skeleton as `?demo=loading`.
import { CalendarSkeleton } from '@/components/calendar/calendar-skeleton';

// The skeleton.
export default function CalendarLoading() {
  return <CalendarSkeleton />;
}
