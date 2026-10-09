// Application step 3: Essay (optional).
import type { Metadata } from 'next';
import { EssayForm } from '@/components/essay-form';
import { loadApply } from '@/lib/apply';

export const metadata: Metadata = { title: 'Essay' };

export default async function EssayPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadApply('/apply/essay');
  if (d.mock) return <EssayForm application={null} files={[]} view={d.view} demo={demo === '1'} />;
  return <EssayForm application={d.application} files={d.files} view={d.view} />;
}
