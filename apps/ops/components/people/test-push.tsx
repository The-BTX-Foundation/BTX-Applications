'use client';

// "Send a test push to my phone", for board members with admin rights, inside the iPhone app only.
import { useState } from 'react';
import { useInApp } from '@/lib/use-in-app';

export function TestPushButton() {
  const inApp = useInApp();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!inApp) return null;
  const send = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch('/api/push/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const j = (await r.json().catch(() => null)) as { configured?: boolean; delivered?: number; noDevice?: number } | null;
      if (!r.ok || !j) setMsg("Couldn't send the test.");
      else if (!j.configured) setMsg('Push is not set up on the server yet.');
      else if (j.noDevice) setMsg('This phone has no notifications on. Turn on Notifications in the menu first.');
      else setMsg(j.delivered ? 'Sent. It should arrive in a few seconds.' : "Sent, but Apple didn't accept it. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="o-card" style={{ padding: 16, display: 'grid', gap: 8 }}>
      <b>Notifications on this phone</b>
      <p style={{ margin: 0 }}>Sends a test push to the phones you turned Notifications on for.</p>
      <div>
        <button type="button" className="o-btn s" disabled={busy} onClick={send}>
          Send a test push to my phone
        </button>
      </div>
      {msg ? <p role="status" style={{ margin: 0 }}>{msg}</p> : null}
    </div>
  );
}
