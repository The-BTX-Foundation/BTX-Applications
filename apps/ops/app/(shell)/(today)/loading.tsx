// Shown at once while Today's server data loads (Next.js loading file, for "/" only: this is the (today) route group):
// the same skeleton as `?demo=loading`.
import { TodaySkeleton } from '@/components/today/today-skeleton';

// The skeleton.
export default function TodayLoading() {
  return <TodaySkeleton />;
}
