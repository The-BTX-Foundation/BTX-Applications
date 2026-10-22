'use client';

// Gives the Rayken Review widget the context of the screen being reviewed. Renders nothing, and does nothing unless
// NEXT_PUBLIC_RAYKEN_REVIEW is '1' (app/RaykenReview.tsx). Never includes names, emails, ids or codes.
// The screen is worked out when the widget asks, from the address at that moment: the widget asks right after a screen
// change, before React has run this component's effect for the new page, so a value saved here would name the old screen.
//
// It also guards students. A review pass belongs to a board member testing with a +apply address. If a real student
// (a Terpmail account) is signed in while this browser holds one, the pass reached them through a forwarded link: it is
// forgotten and the page reloads once, so the review tool never runs over a student's application.
import { useEffect } from 'react';
import { getAuthMode, getBrowserClient } from '@btx/data';
import { forgetReviewPass, holdsReviewPass, isRealStudent, safeStorage, widgetHasPass } from '@/lib/review-pass';
import { reviewScreen } from '@/lib/review-screens';

declare global {
  interface Window {
    RaykenReview?: { context?: () => Record<string, string> };
    __raykenReview?: { onEvent?: unknown; token?: unknown } & Record<string, unknown>;
  }
}

const RELOADED = 'rr-student-guard';

// Forgets the pass, then reloads once (the loader stays idle without it). If a reload already happened on this tab
// and the pass is somehow still there, it switches the widget off in place instead of reloading again.
async function protectStudent(): Promise<void> {
  await forgetReviewPass();
  let reloaded = false;
  try {
    reloaded = window.sessionStorage.getItem(RELOADED) === '1';
    window.sessionStorage.setItem(RELOADED, '1');
  } catch {
    reloaded = true; // storage blocked: never risk a reload loop
  }
  if (!reloaded) {
    window.location.reload();
    return;
  }
  // No second reload: revoke the widget's pass in place. Its next call to the review tool is refused, and the widget
  // then forgets the pass and takes itself down.
  if (window.__raykenReview) {
    window.__raykenReview.onEvent = null;
    window.__raykenReview.token = 'revoked';
  }
}

export function ReviewContext() {
  const on = process.env.NEXT_PUBLIC_RAYKEN_REVIEW === '1';
  useEffect(() => {
    if (!on) return;
    window.RaykenReview = {
      ...window.RaykenReview,
      context: () => ({ account: 'Student', ...reviewScreen(window.location.pathname) }),
    };
    if (getAuthMode() !== 'supabase') return;
    let done = false;
    const check = (account: { email?: string | null; app_metadata?: Record<string, unknown> | null } | null | undefined) => {
      if (done || !isRealStudent(account)) return;
      // the pass is checked here, not once at mount: the loader can restore a pass from IndexedDB after this runs
      if (!holdsReviewPass(safeStorage(), document.cookie) && !widgetHasPass()) return;
      done = true;
      void protectStudent();
    };
    const client = getBrowserClient();
    client.auth
      .getSession()
      .then(({ data }) => check(data.session?.user))
      .catch(() => {});
    const { data } = client.auth.onAuthStateChange((_event, session) => check(session?.user));
    return () => {
      done = true;
      data.subscription.unsubscribe();
    };
  }, [on]);
  return null;
}
