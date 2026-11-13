// Shown at once while the Awardees data loads (Next.js loading file for /scholarships/awardees): grey blocks shaped like
// the page.
import { AwardeesSkeleton } from '@/components/awardees/awardees-skeleton';

// The skeleton.
export default function AwardeesLoading() {
  return <AwardeesSkeleton />;
}
