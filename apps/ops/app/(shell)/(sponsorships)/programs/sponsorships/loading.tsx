// Shown at once while the Sponsorships data loads (Next.js loading file for /programs/sponsorships): grey blocks shaped
// like the page, with the h1 kept for screen readers.
import { SponsorshipsSkeleton } from '@/components/sponsorships/sponsorships-skeleton';

// The skeleton.
export default function SponsorshipsLoading() {
  return <SponsorshipsSkeleton />;
}
