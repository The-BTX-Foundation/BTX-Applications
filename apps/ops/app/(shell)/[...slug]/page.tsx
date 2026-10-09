// Every sidebar route that has no page yet lands here: the Ops Hub's load-error-style empty page, "Not built yet".
// There is nothing else on it on purpose (no invented screens). A path that is not in the sidebar is a 404.
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { AlertMark } from '@/components/icons';
import { ALL_ROUTES } from '@/lib/nav';

type Props = { params: Promise<{ slug: string[] }> };

// Finds the sidebar entry for the requested path, if there is one.
async function entry(params: Props['params']) {
  const { slug } = await params;
  const href = `/${slug.join('/')}`;
  return ALL_ROUTES.find((r) => r.href === href);
}

// The tab title is the page's name.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await entry(params);
  return { title: e?.label ?? 'Not found' };
}

// The "Not built yet" page.
export default async function NotBuilt({ params }: Props) {
  const e = await entry(params);
  if (!e) notFound();
  return (
    <>
      <PageHeader title={e.label} />
      <section className="o-err" aria-live="polite">
        <AlertMark />
        <h2>Not built yet</h2>
        <p>This page is still being designed and built.</p>
      </section>
    </>
  );
}
