import type { Metadata } from 'next';
import { ApplyStart } from '@/components/apply-start';

export const metadata: Metadata = { title: 'Opening your application' };

export default async function StartPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // only same-site paths under /apply are accepted as a return address
  const safe = next && /^\/apply(\/|$)/.test(next) && !next.startsWith('//') ? next : undefined;
  return <ApplyStart next={safe} />;
}
