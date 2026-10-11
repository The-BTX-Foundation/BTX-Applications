// Application step 2: This fall's scholarship.
import type { Metadata } from 'next';
import { ScholarshipForm } from '@/components/scholarship-form';
import { ApplyLoadError } from '@/components/load-error-pages';
import { loadApply } from '@/lib/apply';

export const metadata: Metadata = { title: "This fall's scholarship" };

export default async function ScholarshipPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadApply('/apply/scholarship', demo);
  if (d.failed) return <ApplyLoadError />;
  if (d.mock) return <ScholarshipForm application={null} files={[]} view={d.view} demo={demo} />;
  return <ScholarshipForm application={d.application} files={d.files} view={d.view} />;
}
