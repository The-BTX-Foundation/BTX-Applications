// The old step 3 address (the essay, replaced by short answers on 2026-10-12): sends old links to the new step,
// keeping ?demo= for review links.
import { redirect } from 'next/navigation';

export default async function EssayRedirect({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  redirect(demo ? `/apply/short-answers?demo=${encodeURIComponent(demo)}` : '/apply/short-answers');
}
