'use client';

// Board members (Figma laptop and phone): the board members, each person's title, whether they have admin rights and last
// sign-in, and what admin rights add. One staff role, board member; app_metadata.role 'admin' means a board member with admin
// rights. Only a board member with admin rights sees "Give admin rights" / "Remove admin rights", and nobody gets it on their
// own row; the server action and the database check the same rules again. The change asks first ("Give Kelsey Davis admin
// rights?"), then shows "Kelsey Davis now has admin rights · Undo".
// MOCK mode keeps the roles in lib/mock-store.ts. LIVE mode calls the server action in lib/people-actions.ts, which writes
// app_metadata with the service key. There is no invite control (owner, 2026-10-12): accounts are set up server side
// through inviteStaff() in lib/people-actions.ts.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasSupabaseEnv } from '@btx/data';
import { OIcon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Dialog } from '@/components/money/ui';
import { Toast } from '@/components/money/ui';
import { TestPushButton } from './test-push';
import { dayLabel } from '@/lib/format';
import { useMockState } from '@/lib/mock-store';
import { changeRoleAction } from '@/lib/people-actions';
import type { PeopleData, PersonRow } from '@/lib/money-shared';
import { ADMIN_RIGHTS_LIST, type StaffRole } from '@/lib/role';

// The role a button click offers: there are only two values, so board -> admin (give) and admin -> board (remove).
function offered(role: StaffRole): StaffRole {
  return role === 'board' ? 'admin' : 'board';
}

// Keyed by the role the click sets: 'admin' gives the rights, 'board' removes them.
const BUTTON: Record<StaffRole, string> = { admin: 'Give admin rights', board: 'Remove admin rights' };
const EXPLAINER = `Every board member can do everything here, from tasks and chat to scoring and selection. Admin rights also let a board member ${ADMIN_RIGHTS_LIST}. No one can remove their own admin rights.`;

// What the dialog explains.
function explain(p: PersonRow, to: StaffRole): string {
  const first = p.display_name.split(' ')[0];
  if (to === 'admin') return `With admin rights, ${first} can also ${ADMIN_RIGHTS_LIST}.`;
  return `${first} stays a board member and can still do everything else.`;
}

// The toast after a change ("now has" / "no longer has"), and after an undo.
function done(name: string, to: StaffRole, undone?: boolean): string {
  if (to === 'admin') return undone ? `${name} has admin rights again` : `${name} now has admin rights`;
  return `${name} no longer has admin rights`;
}

// "Today", "Fri Oct 2", or "Invited" when the person has not signed in yet.
function lastActive(iso: string | null, now: string): string {
  if (!iso) return 'Invited';
  return dayLabel(iso) === dayLabel(now) ? 'Today' : dayLabel(iso);
}

export function PeopleView({ data, demo, role }: { data: PeopleData; demo?: string; role: StaffRole }) {
  const router = useRouter();
  const live = data.mode === 'live';
  const [roles, setRoles] = useMockState<Record<string, StaffRole>>(`roles:${demo ?? ''}`, {});
  const [ask, setAsk] = useState<{ p: PersonRow; to: StaffRole } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: { id: string; role: StaffRole } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const isAdmin = role === 'admin';

  const people = data.people.map((p) => ({ ...p, role: live ? p.role : (roles[p.user_id] ?? p.role) }));
  const canChange = (p: PersonRow) => isAdmin && p.user_id !== data.me;

  // Changes a role (live: the server action; mock: this tab's state) and shows the toast.
  async function change(id: string, to: StaffRole, text: string, undo?: { id: string; role: StaffRole }) {
    if (id === data.me) return; // no one changes their own role
    setBusy(true);
    setError(null);
    if (live && hasSupabaseEnv()) {
      const r = await changeRoleAction(id, to);
      setBusy(false);
      if (!r.ok) {
        setError(r.reason);
        setAsk(null);
        return;
      }
      router.refresh();
    } else {
      setBusy(false);
      setRoles((cur) => ({ ...cur, [id]: to }));
    }
    setAsk(null);
    setToast({ text, undo });
  }

  const adminCell = (p: PersonRow) => {
    const yes = p.role === 'admin';
    return (
      <>
        <span className={yes ? undefined : 'mn-no'}>{`${yes ? 'Yes' : 'No'}${p.user_id === data.me ? ' · you' : ''}`}</span>
        {canChange(p) ? (
          <button type="button" className="mn-link" onClick={() => setAsk({ p, to: offered(p.role) })}>
            {BUTTON[offered(p.role)]}
          </button>
        ) : null}
      </>
    );
  };
  const phoneCell = (p: PersonRow) =>
    canChange(p) ? (
      <button type="button" className="mn-link" onClick={() => setAsk({ p, to: offered(p.role) })}>
        {BUTTON[offered(p.role)]}
      </button>
    ) : p.user_id === data.me ? (
      <>You</>
    ) : null;

  return (
    <>
      <PageHeader
        title="Board members"
        sub={
          <>
            <span className="o-lg">{`${people.length} board members · ${people.filter((p) => p.role === 'admin').length} with admin rights`}</span>
            <span className="o-ph">{`${people.length} board members`}</span>
          </>
        }
      />

      {error ? (
        <p className="mn-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mn-pp">
        <section className="o-card mn-panel mn-people o-lg" aria-label="Board members" data-review="Board members list">
          <div className="mn-th mn-prow">
            <span>Person</span>
            <span>Title</span>
            <span>Admin rights</span>
            <span>Last active</span>
          </div>
          {people.map((p) => (
            <div key={p.user_id} className="mn-tr mn-prow" data-review-private>
              <span className="mn-pn">
                <span className="mn-av pp">{p.initials}</span>
                <b>{p.display_name}</b>
              </span>
              <span>{p.title ?? ''}</span>
              <span className="mn-pr">{adminCell(p)}</span>
              <b>{lastActive(p.last_sign_in_at, data.now)}</b>
            </div>
          ))}
        </section>

        <section className="o-card mn-panel mn-roles o-lg" aria-labelledby="mn-rl" data-review="What admin rights add">
          <div className="mn-ph">
            <h2 id="mn-rl">What admin rights add</h2>
          </div>
          <p>{EXPLAINER}</p>
        </section>

        {isAdmin ? <TestPushButton /> : null}

        <section className="o-card mn-plist o-ph" aria-label="Board members" data-review="Board members list">
          {people.map((p) => (
            <div key={p.user_id} className="mn-pcard" data-review-private>
              <span className="mn-av pp">{p.initials}</span>
              <span className="mn-pcard-n">
                <b>{p.display_name}</b>
                <span>{[`${p.title ?? ''}${p.role === 'admin' ? `${p.title ? ' · ' : ''}admin rights` : ''}`, lastActive(p.last_sign_in_at, data.now)].filter(Boolean).join(', ')}</span>
              </span>
              <span className="mn-pcard-r">{phoneCell(p)}</span>
            </div>
          ))}
        </section>
        <section className="o-card mn-rolecard o-ph">
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            <OIcon name="people" size={18} />
            <span>
              <b>What admin rights add</b>
              <span>{more ? EXPLAINER : 'Admin rights add a few extra controls.'}</span>
            </span>
            <OIcon name={more ? 'down' : 'right'} size={18} />
          </button>
        </section>
      </div>

      {ask ? (
        <Dialog title={ask.to === 'admin' ? `Give ${ask.p.display_name} admin rights?` : `Remove admin rights from ${ask.p.display_name}?`} onClose={() => setAsk(null)} narrow>
          <p className="mn-dlg-p">{explain(ask.p, ask.to)}</p>
          <div className="mn-qa">
            <button
              type="button"
              className="o-btn p mn-b36"
              disabled={busy}
              onClick={() => void change(ask.p.user_id, ask.to, done(ask.p.display_name, ask.to), { id: ask.p.user_id, role: ask.p.role })}
            >
              {BUTTON[ask.to]}
            </button>
            <button type="button" className="o-btn s mn-b36" onClick={() => setAsk(null)}>
              Cancel
            </button>
          </div>
        </Dialog>
      ) : null}

      {toast ? (
        <Toast
          onUndo={
            toast.undo
              ? () => {
                  const u = toast.undo!;
                  const name = people.find((x) => x.user_id === u.id)?.display_name ?? '';
                  void change(u.id, u.role, done(name, u.role, true));
                }
              : undefined
          }
        >
          {toast.text}
        </Toast>
      ) : null}
    </>
  );
}
