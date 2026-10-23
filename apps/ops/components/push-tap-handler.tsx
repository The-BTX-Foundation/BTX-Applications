'use client';

// A tapped push opens the Ops Hub page it carries (the path is checked in lib/native-push.ts: this site only). Inside the
// iPhone app only; it renders nothing.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { nativePush } from '@/lib/native-push';
import { useInApp } from '@/lib/use-in-app';

export function PushTapHandler() {
  const router = useRouter();
  const inApp = useInApp();
  useEffect(() => {
    const n = inApp ? nativePush() : null;
    if (!n) return;
    return n.onOpen((path) => router.push(path));
  }, [inApp, router]);
  return null;
}
