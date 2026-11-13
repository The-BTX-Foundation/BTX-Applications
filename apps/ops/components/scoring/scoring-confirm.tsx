'use client';

// The live Publish confirm's go button (lib/scoring-arm.ts): unarmed for ARM_MS after the confirm opens, acts on a
// pointer click once armed, or on the key-up of an Enter/Space whose key-down began on it; a held key's repeats and the
// browser's own click after a key never act. `data-armed` shows the state (false when the confirm first draws).
import { useEffect, useRef, useState } from 'react';
import { ARM_MS, nowMs, type Arm } from '@/lib/scoring-arm';

export const PUB_WHY_ID = 'sc-pub-why';

export function PublishGo({ arm, onGo }: { arm: Arm; onGo: () => void }) {
  const [ready, setReady] = useState(false);
  const keyActed = useRef(0);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), ARM_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <button
      type="button"
      className="rf-btn rf-btn-gold"
      data-k="pub-yes"
      data-armed={ready ? 'true' : 'false'}
      aria-describedby={PUB_WHY_ID}
      onClick={(e) => {
        if (e.detail === 0 && nowMs() - keyActed.current < 500) return;
        if (arm.click(nowMs())) onGo();
      }}
      onKeyDown={(e) => {
        if (arm.keyDown('pub-yes', e.key, e.repeat)) e.preventDefault();
      }}
      onKeyUp={(e) => {
        const r = arm.keyUp('pub-yes', e.key, nowMs());
        if (r.handled) e.preventDefault();
        if (!r.act) return;
        keyActed.current = nowMs();
        onGo();
      }}
    >
      Publish
    </button>
  );
}
