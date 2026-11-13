// Shown at once while the Board members data loads (Next.js loading file for /people): the title and the grey member rows.
import { PeopleSkeleton } from '@/components/people/people-skeleton';

// The skeleton.
export default function PeopleLoading() {
  return <PeopleSkeleton />;
}
