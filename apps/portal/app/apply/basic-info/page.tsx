// Application step 1: Basic info. `?demo=1` loads the draft's sample answers for design review (mock mode).
import type { Metadata } from 'next';
import { BasicInfoForm } from '@/components/basic-info-form';
import { ApplyLoadError } from '@/components/load-error-pages';
import { loadApply } from '@/lib/apply';

export const metadata: Metadata = { title: 'Basic info' };

export default async function BasicInfoPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadApply('/apply/basic-info', demo);
  if (d.failed) return <ApplyLoadError />;
  if (d.mock) return <BasicInfoForm demo={demo} application={null} files={[]} view={d.view} />;
  return <BasicInfoForm application={d.application} files={d.files} email={d.email} view={d.view} />;
}
