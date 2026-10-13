'use client';

// The Ops Hub's shared "didn't load" card (Figma "load error" frames): an alert mark, "<Thing> didn't load.", a line of
// advice, and a gold "Try again" that asks the server for the page again.
import { useRouter } from 'next/navigation';
import { AlertMark, OIcon } from './icons';

export function LoadError({ what }: { what: string }) {
  const router = useRouter();
  return (
    <section className="o-err" role="alert">
      <AlertMark />
      <h2>{what} didn&apos;t load.</h2>
      <p>Check your connection, then try again.</p>
      <button type="button" className="o-btn p" onClick={() => router.refresh()}>
        <OIcon name="refresh" size={16} />
        Try again
      </button>
    </section>
  );
}
