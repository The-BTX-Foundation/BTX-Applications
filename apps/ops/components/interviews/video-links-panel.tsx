'use client';

// "Add the video links" (Figma "Today: add the video links"): one link per paired interview, set by an admin and shown
// to the student in the Portal before the interview (D7). The Today page places this; it does not edit that page.
// Usage on a server page: `const data = await loadVideoLinks();` then `<VideoLinksPanel data={data} onClose={...} />`
// from a client component that holds the open/closed state (the "Add links" button).
// Links are Teams only (2026-11-06). "Make Teams links" has the server make a Teams meeting for every interview still
// without one, saves and emails them, and fills the fields. The fields stay so one link can be fixed by hand.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VideoLinksData } from '@/lib/interviews';
import { makeTeamsLinksAction, saveVideoLinks } from '@/lib/actions/interviews';
import { isVideoUrl, TEAMS_ONLY_MESSAGE } from '@/lib/pairing-slots';
import { Dialog } from '../sch-parts';
import '../scholarships.css';
import './video-links-panel.css';

// The dialog: one field per paired interview, "Make Teams links", and "Save and send" for links fixed by hand.
export function VideoLinksPanel({ data, onClose }: { data: VideoLinksData; onClose: () => void }) {
  const router = useRouter();
  const [urls, setUrls] = useState<Record<string, string>>(() => Object.fromEntries(data.rows.map((r) => [r.slotId, r.url])));
  // What is saved now for each interview. Links made by "Make Teams links" are already saved and emailed, so they are
  // added here and "Save and send" does not count them as changed.
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(data.rows.map((r) => [r.slotId, r.url])));
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const bad = (id: string) => (urls[id] ?? '').trim() !== '' && !isVideoUrl((urls[id] ?? '').trim());

  // Has the server make the missing Teams links, then shows them in the fields.
  async function makeLinks() {
    setBusy(true);
    setError('');
    setNote('');
    const res = await makeTeamsLinksAction();
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    const made = Object.fromEntries(res.links.map((l) => [l.slotId, l.url]));
    setUrls((u) => ({ ...u, ...made }));
    setSaved((v) => ({ ...v, ...made }));
    setNote(res.message);
    if (res.links.length > 0) router.refresh();
  }

  async function save() {
    if (data.rows.some((r) => bad(r.slotId))) {
      setError(TEAMS_ONLY_MESSAGE);
      return;
    }
    setBusy(true);
    setError('');
    // Only links that changed are sent.
    const changed = data.rows.filter((r) => (urls[r.slotId] ?? '').trim() !== (saved[r.slotId] ?? '')).map((r) => ({ slotId: r.slotId, url: urls[r.slotId] ?? '' }));
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
            <label className="iv-vl-r" key={r.slotId} data-review-private>
              <b>
                {r.when} · {r.applicant} · {r.code}
              </b>
              <span>{r.names}</span>
              <input
                type="url"
                inputMode="url"
                className={bad(r.slotId) ? 'bad' : undefined}
                placeholder="Teams link"
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
      {note ? (
        <p className="iv-vl-n" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="iv-vl-e" role="alert">
          {error}
        </p>
      ) : null}
      <div className="s-dlg-b">
        <button type="button" className="o-btn p lg" onClick={makeLinks} disabled={busy || data.rows.length === 0}>
          Make Teams links
        </button>
        <button type="button" className="o-btn s lg" onClick={save} disabled={busy || data.rows.length === 0}>
          Save and send
        </button>
        <button type="button" className="o-btn s lg" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
