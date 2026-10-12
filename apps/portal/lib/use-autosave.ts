'use client';

// Autosave for the application steps: changes are collected and sent about 0.8 seconds after typing stops. The save
// time shown in the rail comes from the database row's own updated_at. In mock mode (no application) it only pretends.
import { useEffect, useRef, useState } from 'react';
import { getBrowserClient, saveApplication } from '@btx/data';

type Patch = Parameters<typeof saveApplication>[2];
const DELAY_MS = 800;

export function useAutosave(applicationId: string | null, initialSavedAt: string | null) {
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [failed, setFailed] = useState(false);
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sends everything collected so far (plus `extra`). Returns true when it is saved.
  async function flush(extra: Patch = {}): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = { ...pending.current, ...extra };
    pending.current = {};
    if (Object.keys(patch).length === 0) return true;
    if (!applicationId) {
      setSavedAt(new Date().toISOString());
      return true;
    }
    const r = await saveApplication(getBrowserClient(), applicationId, patch);
    if (!r.ok) {
      // keep the unsent answers so the next edit or Continue tries again
      pending.current = { ...patch, ...pending.current };
      setFailed(true);
      return false;
    }
    setFailed(false);
    setSavedAt(r.savedAt);
    return true;
  }

  // Adds changed columns and restarts the 0.8 second wait.
  function schedule(patch: Patch) {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DELAY_MS);
  }

  // Stops the wait if the page goes away.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { savedAt, failed, schedule, flush };
}
