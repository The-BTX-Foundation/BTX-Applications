// Shown at once while the Newsletter data loads (Next.js loading file for /outreach/newsletter): grey blocks shaped like
// the page.
import { NewsletterSkeleton } from '@/components/newsletter/newsletter-skeleton';

// The skeleton.
export default function NewsletterLoading() {
  return <NewsletterSkeleton />;
}
