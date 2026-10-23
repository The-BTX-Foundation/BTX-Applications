'use client';

// True inside the BTX Ops Hub iPhone app, false on the website and on the server. Read through useSyncExternalStore so the
// first server render and the first client render agree, then the real answer shows without a state update in an effect.
import { useSyncExternalStore } from 'react';
import { nativePush } from './native-push';

const subscribe = () => () => {};

export function useInApp(): boolean {
  return useSyncExternalStore(subscribe, () => nativePush() !== null, () => false);
}
