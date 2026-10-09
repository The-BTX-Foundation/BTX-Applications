// Application step 4: Documents. `?demo=empty|uploading|failed` draws the drafts' states in mock mode.
import type { Metadata } from 'next';
import { DocumentsForm } from '@/components/documents-form';
import { ApplyLoadError } from '@/components/load-error-pages';
import { loadApply } from '@/lib/apply';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadApply('/apply/documents', demo);
  if (d.failed) return <ApplyLoadError />;
  if (d.mock) return <DocumentsForm application={null} files={[]} view={d.view} demo={demo} />;
  return <DocumentsForm application={d.application} files={d.files} view={d.view} userId={d.userId} />;
}
