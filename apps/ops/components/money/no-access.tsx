// What a reviewer sees on a Money page: the draft schema gives reviewers nothing in Money (admin and board only), so
// the page says so instead of drawing empty tables. Not in the Figma frames: the wording is the Ops Hub's usual short style.
import { AlertMark } from '@/components/icons';
import { PageHeader } from '@/components/page-header';

export function MoneyNoAccess({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="o-err" aria-live="polite">
        <AlertMark />
        <h2>Money is for admins and board members</h2>
        <p>Ask a BTX admin if you need to see it.</p>
      </section>
    </>
  );
}
