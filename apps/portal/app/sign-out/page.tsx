'use client';

// Sign out (from the top bar's account menu): clears the session in this browser, then goes to the landing page.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@btx/data';

export default function SignOutPage() {
  const router = useRouter();
  useEffect(() => {
    let done = false;
    signOut()
      .catch(() => undefined)
      .finally(() => {
        if (done) return;
        router.replace('/');
        router.refresh();
      });
    return () => {
      done = true;
    };
  }, [router]);
  return (
    <main id="main" className="pm" style={{ padding: 24, fontSize: 16 }}>
      Signing you out…
    </main>
  );
}
