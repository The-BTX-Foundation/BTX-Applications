'use client';

// The "Add a post" form (also used by "Plan November" on the Plan page): what, date, owner. It writes through
// lib/actions/outreach.ts (in memory in mock mode).
import { useState } from 'react';
import { addPost } from '@/lib/actions/outreach';
import type { Person } from '@/mock/area';
import { Field, Modal } from '../area/parts';

export type NewPost = { id: string; title: string; postOn: string | null; owner: Person | null };

// "2026-10-07" -> "Wed Oct 7".
export function dayWord(iso: string | null): string {
  if (!iso) return 'Date not set';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');
}

export function PostForm({ title, staff, channelId, onClose, onSaved }: { title: string; staff: Person[]; channelId?: string; onClose: () => void; onSaved: (p: NewPost) => void }) {
  const [what, setWhat] = useState('');
  const [date, setDate] = useState('');
  const [owner, setOwner] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const t = what.trim();
    if (!t) return setErr('Say what the post is about.');
    const person = staff.find((s) => s.name === owner) ?? null;
    setBusy(true);
    setErr(null);
    const r = await addPost({ channelId, title: t, postOn: date || null, ownerId: person?.id });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    onSaved({ id: r.id, title: t, postOn: date || null, owner: person });
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={go} noValidate>
        <Field label="What it is">
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Post title" maxLength={200} />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Owner">
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {err ? (
          <p className="ar-err" role="alert">
            {err}
          </p>
        ) : null}
        <div className="ar-btns">
          <button type="submit" className="o-btn p" disabled={busy}>
            Add post
          </button>
          <button type="button" className="o-btn s" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
