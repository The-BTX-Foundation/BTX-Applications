'use client';

// The Notifications row in the phone menu, shown only inside the BTX Ops Hub iPhone app (Figma "Notifications row: the
// three states", node 466:12043). Off, On, or Blocked (the person said no to iOS's prompt or turned it off in iPhone
// Settings; the app can't turn it back on, so the row links to Settings). On the website it renders nothing.
import { useEffect, useState } from 'react';
import { nativePush } from '@/lib/native-push';
import { useInApp } from '@/lib/use-in-app';
import { OIcon } from './icons';

type State = 'loading' | 'none' | 'off' | 'on' | 'blocked';

export function NotificationsRow() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const inApp = useInApp();

  useEffect(() => {
    const n = inApp ? nativePush() : null;
    if (!n) return;
    let live = true;
    n.permission()
      .then((perm) => {
        if (!live) return;
        setState(perm === 'denied' ? 'blocked' : perm === 'granted' && n.isOn() ? 'on' : 'off');
      })
      .catch(() => live && setState('none'));
    return () => {
      live = false;
    };
  }, [inApp]);

  if (!inApp || state === 'loading' || state === 'none') return null;
  const n = nativePush();
  if (!n) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    if (state === 'on') {
      await n.disable();
      setState('off');
    } else {
      const r = await n.enable();
      if (r.ok) setState('on');
      else if (r.reason === 'denied') setState('blocked');
      else setNote("Couldn't turn on notifications. Try again.");
    }
    setBusy(false);
  };

  if (state === 'blocked') {
    return (
      <div className="o-m-r o-m-nt" data-review="Notifications row">
        <OIcon name="bell" size={22} />
        <span className="o-m-l">
          Notifications
          <small className="o-m-sm">Off in Settings</small>
        </span>
        <button type="button" className="o-m-lk" onClick={() => n.openSettings()}>
          Open Settings
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="o-m-r o-m-nt" data-review="Notifications row">
        <OIcon name="bell" size={22} />
        <span className="o-m-l" id="o-nt-l">
          Notifications
        </span>
        <button type="button" role="switch" aria-checked={state === 'on'} aria-labelledby="o-nt-l" className="o-sw" disabled={busy} onClick={toggle}>
          <span className="o-sw-k" />
        </button>
      </div>
      {note ? (
        <p className="o-m-nn" role="status">
          {note}
        </p>
      ) : null}
    </>
  );
}
