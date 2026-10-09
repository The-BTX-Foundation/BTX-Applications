// The sign-in screen (drafts signin.html, signin-phone.html and the wrong and expired code states).
// `?demo=email|code|wrong|expired` draws one state with the draft's sample data, for design review.
import type { Metadata } from 'next';
import { SignInFlow, type DemoState } from '@/components/sign-in-flow';
import { loadCodeLifetime } from '@/lib/cycle';

export const metadata: Metadata = { title: 'Sign in' };

const DEMOS: DemoState[] = ['email', 'code', 'wrong', 'expired'];

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ demo?: string; next?: string }> }) {
  const { demo, next } = await searchParams;
  const { text, minutes } = await loadCodeLifetime();
  // only same-site paths under /apply are accepted as a return address
  const safeNext = next && /^\/apply(\/|$)/.test(next) && !next.startsWith('//') ? next : undefined;
  const state = DEMOS.find((d) => d === demo);
  return <SignInFlow demo={state} next={safeNext} codeLifetime={text} lifetimeMinutes={minutes} />;
}
