// Shown at once while Your availability loads (Next.js loading file for /scholarships/interviews/availability): the
// header blocks and the line's grey day rows.
import { AvailabilitySkeleton } from '@/components/availability/availability-skeleton';

// The skeleton.
export default function AvailabilityLoading() {
  return <AvailabilitySkeleton />;
}
