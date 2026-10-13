'use client';

// A tiny in-memory store for MOCK mode (no Supabase env): the Money and People pages keep their changes here (an approval,
// a logged gift, a changed role) so the same item looks the same on every page until the tab reloads. Nothing is saved.
// Live mode never writes here; it writes to the database and asks the server for the page again.
import { useCallback, useSyncExternalStore } from 'react';

const mem = new Map<string, unknown>();
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

// Like useState, but the value lives under `key` for the whole tab session. `initial` is what the page loaded with.
export function useMockState<T>(key: string, initial: T): [T, (next: T | ((cur: T) => T)) => void] {
  const get = useCallback(() => (mem.has(key) ? (mem.get(key) as T) : initial), [key, initial]);
  const value = useSyncExternalStore(subscribe, get, () => initial);
  const set = useCallback(
    (next: T | ((cur: T) => T)) => {
      const cur = get();
      mem.set(key, typeof next === 'function' ? (next as (c: T) => T)(cur) : next);
      subs.forEach((f) => f());
    },
    [get, key],
  );
  return [value, set];
}
