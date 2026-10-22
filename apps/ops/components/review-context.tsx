'use client';

// Gives the Rayken Review widget the context of the screen being reviewed. Renders nothing, and does nothing unless
// NEXT_PUBLIC_RAYKEN_REVIEW is '1' (Preview deployments only). Never includes names, emails, ids or codes.
// The screen is worked out when the widget asks, from the address at that moment: the widget asks right after a screen
// change, before React has run this component's effect for the new page, so a value saved here would name the old screen.
import { useEffect } from 'react';
import { getReviewAccount } from '@/lib/review-account';
import { reviewScreen } from '@/lib/review-screens';

declare global {
  interface Window {
    RaykenReview?: { context?: () => Record<string, string> };
  }
}

export function ReviewContext() {
  const on = process.env.NEXT_PUBLIC_RAYKEN_REVIEW === '1';
  useEffect(() => {
    if (!on) return;
    // The account is read when the widget asks too, because the Shell sets it after this component mounts.
    window.RaykenReview = {
      ...window.RaykenReview,
      context: (): Record<string, string> => {
        const { screen, routeKey } = reviewScreen(window.location.pathname);
        const account = getReviewAccount();
        return account ? { account, screen, routeKey } : { screen, routeKey };
      },
    };
  }, [on]);
  return null;
}
