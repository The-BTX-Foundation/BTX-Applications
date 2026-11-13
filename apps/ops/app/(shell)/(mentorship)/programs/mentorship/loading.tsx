// Shown at once while the Mentorship data loads (Next.js loading file for /programs/mentorship): grey blocks shaped like
// the page.
import { MentorshipSkeleton } from '@/components/mentorship/mentorship-skeleton';

// The skeleton.
export default function MentorshipLoading() {
  return <MentorshipSkeleton />;
}
