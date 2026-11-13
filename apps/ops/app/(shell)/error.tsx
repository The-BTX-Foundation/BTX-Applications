'use client';

// The error boundary for every signed-in page: a calm "Something went wrong" with Try again. The error's message and
// stack are never shown (they can hold details); only its digest, a short id that matches the server log, is logged.
import { useEffect } from 'react';
import { ErrorCard } from '@/components/error-card';

// Logs the digest once, then draws the card; Try again calls Next's reset.
export default function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Ops Hub page error', error.digest ?? 'no digest');
  }, [error]);
  return <ErrorCard onRetry={reset} />;
}
