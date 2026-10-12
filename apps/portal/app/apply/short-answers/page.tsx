// Application step 3: Short answers (three required questions).
import type { Metadata } from 'next';
import { ShortAnswersForm } from '@/components/short-answers-form';
import { ApplyLoadError } from '@/components/load-error-pages';
import { loadApply } from '@/lib/apply';

export const metadata: Metadata = { title: 'Short answers' };

export default async function ShortAnswersPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadApply('/apply/short-answers', demo);
  if (d.failed) return <ApplyLoadError />;
  if (d.mock) return <ShortAnswersForm application={null} files={[]} view={d.view} demo={demo} />;
  return <ShortAnswersForm application={d.application} files={d.files} view={d.view} />;
}
