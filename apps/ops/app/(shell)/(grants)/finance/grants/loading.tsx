// Shown at once while the Grants data loads (Next.js loading file for /finance/grants): the title blocks, the phone's
// Finance tabs and the grey panels.
import { GrantsSkeleton } from '@/components/grants/grants-skeleton';

// The skeleton.
export default function GrantsLoading() {
  return <GrantsSkeleton />;
}
