'use client';

// True when the window is wide enough for Basic info's two-column layout (1240px and up). Server rendering and the
// first paint assume narrow; the client switches after hydration.
import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1240px)';

export function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener('change', notify);
      return () => m.removeEventListener('change', notify);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
