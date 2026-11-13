// Shown at once while the Instagram data loads (Next.js loading file for /outreach/instagram): grey blocks shaped like the
// page, with the h1 kept for screen readers.
import { InstagramSkeleton } from '@/components/instagram/instagram-skeleton';

// The skeleton.
export default function InstagramLoading() {
  return <InstagramSkeleton />;
}
