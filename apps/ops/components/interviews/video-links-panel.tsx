'use client';

// "Add the video links" (Figma "Today: add the video links"): one link per paired interview, set by an admin and shown
// to the student in the Portal before the interview (D7). The Today page places this; it does not edit that page.
// Usage on a server page: `const data = await loadVideoLinks();` then `<VideoLinksPanel data={data} onClose={...} />`
// from a client component that holds the open/closed state (the "Add links" button).
// Links are Teams only (2026-11-06). "Make Teams links" first shows what it will do (a confirm step with the counts),
// then has the server make a Teams meeting for every interview still without one, save and email them, and fills the
// fields. The fields stay so one link can be fixed by hand. Only fields the admin changed are checked (as on the server);
// an old non-Teams link that was not touched shows a warning but does not block saving.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VideoLinksData } from '@/lib/interviews';
import { makeTeamsLinksAction, previewTeamsLinksAction, saveVideoLinks } from '@/lib/actions/interviews';
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
  // The confirm step: what "Make Teams links" will do, or null when it is not showing.
  const [confirm, setConfirm] = useState<{ text: string; toMake: number; toEmail: number } | null>(null);
  // Read once when the dialog opens: the 24-hour hand-check note is about the moment the admin looks.
  const [openedAt] = useState(() => Date.now());
  const text = (id: string) => (urls[id] ?? '').trim();
  const changed = (id: string) => text(id) !== (saved[id] ?? '');
  // A field the admin changed that is not a Teams link: blocks saving (the server refuses it too).
  const bad = (id: string) => changed(id) && text(id) !== '' && !isVideoUrl(text(id));
  // An untouched old link that is not a Teams link (from before Teams only): a warning, not a block.
  const legacy = (id: string) => !changed(id) && text(id) !== '' && !isVideoUrl(text(id));
  // Inside 24 hours the button leaves an old link alone (the server's hand-check rule), so the note says so.
  const soon = (startsAt: string) => Date.parse(startsAt) - openedAt <= 24 * 3_600_000;
  const TRY_AGAIN = "That didn't go through. Try again.";

  // Asks the server what "Make Teams links" would do and shows the confirm step.
  async function askMake() {
    setBusy(true);
    setError('');
    setNote('');
    let res: Awaited<ReturnType<typeof previewTeamsLinksAction>>;
    try {
      res = await previewTeamsLinksAction();
    } catch {
      // A network drop or a server timeout: a fixed plain message, and the buttons work again.
      setBusy(false);
      setError(TRY_AGAIN);
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setConfirm({ text: res.confirm, toMake: res.toMake, toEmail: res.toEmail });
  }

  // After the confirm step: the server makes the missing Teams links and emails them, then they show in the fields.
  async function makeLinks() {
    setConfirm(null);
    setBusy(true);
    setError('');
    setNote('');
    let res: Awaited<ReturnType<typeof makeTeamsLinksAction>>;
    try {
      res = await makeTeamsLinksAction();
    } catch {
      // Some links may have been made before the drop; pressing again is safe (the same meeting comes back).
      setBusy(false);
      setError(TRY_AGAIN);
      router.refresh();
      return;
    }
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
    // Only changed fields are checked, matching the server, which checks only the links it is sent.
    if (data.rows.some((r) => bad(r.slotId))) {
      setError(TEAMS_ONLY_MESSAGE);
      return;
    }
    setBusy(true);
    setError('');
    // Only links that changed are sent.
    const edits = data.rows.filter((r) => changed(r.slotId)).map((r) => ({ slotId: r.slotId, url: urls[r.slotId] ?? '' }));
    const res = edits.length === 0 ? { ok: true, message: '' } : await saveVideoLinks(edits);
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
              {legacy(r.slotId) ? (
                <span className="iv-vl-w">{soon(r.startsAt) ? 'Not a Teams link. This interview is within 24 hours, so it needs a hand check: paste the Teams link here.' : 'Not a Teams link. Make Teams links replaces it.'}</span>
              ) : null}
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
      {confirm ? (
        <>
          <p className="iv-vl-n" role="status">
            {confirm.text}
          </p>
          <div className="s-dlg-b">
            {/* Nothing to make and nothing to email: only Back. */}
            {confirm.toMake > 0 || confirm.toEmail > 0 ? (
              <button type="button" className="o-btn p lg" onClick={makeLinks} disabled={busy}>
                {confirm.toMake > 0 ? `Make ${confirm.toMake} Teams ${confirm.toMake === 1 ? 'link' : 'links'}` : 'Send the emails'}
              </button>
            ) : null}
            <button type="button" className="o-btn s lg" onClick={() => setConfirm(null)}>
              Back
            </button>
          </div>
        </>
      ) : (
        <div className="s-dlg-b">
          <button type="button" className="o-btn p lg" onClick={askMake} disabled={busy || data.rows.length === 0}>
            Make Teams links
          </button>
          <button type="button" className="o-btn s lg" onClick={save} disabled={busy || data.rows.length === 0}>
            Save and send
          </button>
          <button type="button" className="o-btn s lg" onClick={onClose}>
            Cancel
          </button>
        </div>
      )}
    </Dialog>
  );
}
