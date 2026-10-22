// The staff sign-in screen. ?error=access means the account has no Ops Hub role (it was just signed out); ?error=link
// means an emailed link was expired or already used. ?next= is where to go afterwards (a same-site path only).
import type { Metadata } from 'next';
import { SignIn } from '@/components/sign-in';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Sign in' };

// Reads the query and draws the screen. A repeated ?next= arrives as an array; safeNext ignores anything that isn't
// one string.
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const { next, error } = await searchParams;
  return <SignIn next={safeNext(next)} notice={error === 'access' ? 'access' : error === 'link' ? 'link' : undefined} />;
}
