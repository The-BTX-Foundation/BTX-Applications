'use client';

// Gives the Rayken Review widget the context of the screen being reviewed. Renders nothing, and does nothing unless
// NEXT_PUBLIC_RAYKEN_REVIEW is '1' (Preview deployments only). Never includes names, emails, ids or codes.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getReviewAccount } from '@/lib/review-account';
import { reviewScreen } from '@/lib/review-screens';

declare global {
  interface Window {
    RaykenReview?: { context?: () => Record<string, string> };
  }
}

export function ReviewContext() {
  const pathname = usePathname();
  const on = process.env.NEXT_PUBLIC_RAYKEN_REVIEW === '1';
  useEffect(() => {
    if (!on) return;
    const { screen, routeKey } = reviewScreen(pathname);
    // The account is read when the widget asks, because the Shell sets it after this component mounts.
    window.RaykenReview = {
      ...window.RaykenReview,
      context: (): Record<string, string> => {
        const account = getReviewAccount();
        return account ? { account, screen, routeKey } : { screen, routeKey };
      },
    };
  }, [on, pathname]);
  return null;
}
