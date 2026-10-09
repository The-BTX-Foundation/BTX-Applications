// Application step 1: Basic info. `?demo=1` loads the draft's sample answers for design review.
import type { Metadata } from 'next';
import { BasicInfoForm } from '@/components/basic-info-form';

export const metadata: Metadata = { title: 'Basic info' };

export default async function BasicInfoPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  return <BasicInfoForm demo={demo === '1'} />;
}
