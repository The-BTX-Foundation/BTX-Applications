'use client';

// "Add the video links" (Figma "Today: add the video links"): one link per paired interview, set by an admin and shown
// to the student in the Portal before the interview (D7). The Today page places this; it does not edit that page.
// Usage on a server page: `const data = await loadVideoLinks();` then `<VideoLinksPanel data={data} onClose={...} />`
// from a client component that holds the open/closed state (the "Add links" button).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VideoLinksData } from '@/lib/interviews';
import { saveVideoLinks } from '@/lib/actions/interviews';
import { isVideoUrl } from '@/lib/pairing-slots';
import { Dialog } from '../sch-parts';
import '../scholarships.css';
import './video-links-panel.css';

export function VideoLinksPanel({ data, onClose }: { data: VideoLinksData; onClose: () => void }) {
  const router = useRouter();
  const [urls, setUrls] = useState<Record<string, string>>(() => Object.fromEntries(data.rows.map((r) => [r.slotId, r.url])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bad = (id: string) => (urls[id] ?? '').trim() !== '' && !isVideoUrl((urls[id] ?? '').trim());

  async function save() {
    if (data.rows.some((r) => bad(r.slotId))) {
      setError('Each link must start with https:// and be a full web address.');
      return;
    }
    setBusy(true);
    setError('');
    // Only links that changed are sent.
    const changed = data.rows.filter((r) => (urls[r.slotId] ?? '').trim() !== r.url).map((r) => ({ slotId: r.slotId, url: urls[r.slotId] ?? '' }));
    const res = changed.length === 0 ? { ok: true, message: '' } : await saveVideoLinks(changed);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Dialog title="Add the video links" width={560} onClose={onClose}>
      <p>Saving sends each link to the applicant and both interviewers.</p>
      {data.rows.length === 0 ? (
        <p className="iv-vl-n">No paired interviews are waiting for a link.</p>
      ) : (
        <div className="iv-vl">
          {data.rows.map((r) => (
            <label className="iv-vl-r" key={r.slotId}>
              <b>
                {r.when} · {r.code} {r.initials}
              </b>
              <span>{r.names}</span>
              <input
                type="url"
                inputMode="url"
                className={bad(r.slotId) ? 'bad' : undefined}
                placeholder="Paste the video link"
                aria-label={`Video link for ${r.code}`}
                value={urls[r.slotId] ?? ''}
                maxLength={500}
                onChange={(e) => setUrls({ ...urls, [r.slotId]: e.target.value })}
              />
            </label>
          ))}
        </div>
      )}
      {data.unpaired > 0 ? <p className="iv-vl-n">{data.unpaired} booked {data.unpaired === 1 ? 'interview has' : 'interviews have'} no pair yet. Re-run pairing on the Interviews page first.</p> : null}
      {error ? (
        <p className="iv-vl-e" role="alert">
          {error}
        </p>
      ) : null}
      <div className="s-dlg-b">
        <button type="button" className="o-btn p lg" onClick={save} disabled={busy || data.rows.length === 0}>
          Save and send
        </button>
        <button type="button" className="o-btn s lg" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
