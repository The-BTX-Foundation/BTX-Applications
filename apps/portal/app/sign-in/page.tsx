// The sign-in screen (drafts signin.html, signin-phone.html and the wrong and expired code states).
// `?demo=email|code|wrong|expired` draws one state with the draft's sample data, for design review.
import type { Metadata } from 'next';
import { SignInFlow, type DemoState } from '@/components/sign-in-flow';

export const metadata: Metadata = { title: 'Sign in' };

const DEMOS: DemoState[] = ['email', 'code', 'wrong', 'expired'];

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const state = DEMOS.find((d) => d === demo);
  return <SignInFlow demo={state} />;
}
