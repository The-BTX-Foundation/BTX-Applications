// Shown at once while the Fundraising data loads (Next.js loading file for /finance/fundraising): grey blocks shaped like
// the page.
import { FundraisingSkeleton } from '@/components/fundraising/fundraising-skeleton';

// The skeleton.
export default function FundraisingLoading() {
  return <FundraisingSkeleton />;
}
