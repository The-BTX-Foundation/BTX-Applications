'use client';

// Google Analytics 4 on every page: sets analytics up once (lib/analytics-client.ts decides whether the Google tag may
// load) and sends a clean page view on each screen change. Renders nothing. Owner notes: apps/portal/ANALYTICS.md.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { pageView, startAnalytics } from '@/lib/analytics-client';

// Placed first in <body>, so its set-up starts before any page sends an event (those wait in a queue until it is done).
export default function Analytics() {
  const pathname = usePathname();

  // once per page load
  useEffect(() => {
    void startAnalytics();
  }, []);

  // every screen change, the first one included; the page view reads the address itself, so only the path matters here
  useEffect(() => {
    pageView();
  }, [pathname]);

  return null;
}
