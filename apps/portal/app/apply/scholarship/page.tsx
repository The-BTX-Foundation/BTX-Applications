// Application step 2: This fall's scholarship.
import type { Metadata } from 'next';
import { ScholarshipForm } from '@/components/scholarship-form';
import { loadApply } from '@/lib/apply';

export const metadata: Metadata = { title: "This fall's scholarship" };

export default async function ScholarshipPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadApply('/apply/scholarship');
  if (d.mock) return <ScholarshipForm application={null} files={[]} view={d.view} demo={demo === '1'} />;
  return <ScholarshipForm application={d.application} files={d.files} view={d.view} />;
}
