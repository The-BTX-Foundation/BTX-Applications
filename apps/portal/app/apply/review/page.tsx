// Application step 5: Review and submit. `?demo=1|failed` draws the drafts' states in mock mode.
import type { Metadata } from 'next';
import { ReviewForm } from '@/components/review-form';
import { loadApply } from '@/lib/apply';

export const metadata: Metadata = { title: 'Review and submit' };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadApply('/apply/review');
  if (d.mock) return <ReviewForm application={null} files={[]} view={d.view} demo={demo} />;
  return <ReviewForm application={d.application} files={d.files} view={d.view} />;
}
