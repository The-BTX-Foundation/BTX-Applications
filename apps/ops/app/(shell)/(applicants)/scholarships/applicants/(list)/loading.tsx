// Shown at once while the Applicants data loads (Next.js loading file for /scholarships/applicants).
import { ApplicantsSkeleton } from '@/components/applicants/applicants-skeleton';

// The skeleton.
export default function ApplicantsLoading() {
  return <ApplicantsSkeleton />;
}
