// The landing page. Which variant shows (before open, open, closed) comes from the published cycle's dates.
// `?preview=soon|closed` forces a variant in mock mode only, for design review.
import type { Metadata } from 'next';
import { Landing } from '@/components/landing';
import { loadLanding } from '@/lib/cycle';

export const metadata: Metadata = { title: 'The Legacy Scholarship' };

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const { variant, view } = await loadLanding(preview);
  return <Landing variant={variant} view={view} />;
}
