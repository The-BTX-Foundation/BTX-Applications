// Shown at once while the Outreach Plan data loads (Next.js loading file for /outreach/plan): grey blocks shaped like the
// page.
import { OplanSkeleton } from '@/components/oplan/oplan-skeleton';

// The skeleton.
export default function OutreachPlanLoading() {
  return <OplanSkeleton />;
}
