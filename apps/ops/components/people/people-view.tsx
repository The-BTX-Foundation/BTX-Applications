'use client';

// Admin > People and roles (Figma laptop and phone): the staff, each person's title, role and last sign-in, and what each
// role can do. Only an admin sees "Change role" and "Invite a person", and nobody gets "Change role" on their own row; the
// server action and the database check the same rules again. Changing a role asks first ("Make Kelsey Davis an Admin?"),
// then shows "Kelsey Davis is now an Admin · Undo".
// MOCK mode keeps the roles in lib/mock-store.ts. LIVE mode calls the server action in lib/people-actions.ts, which writes
// app_metadata with the service key: NOT TESTED: needs the service key.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasSupabaseEnv } from '@btx/data';
import { OIcon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Dialog } from '@/components/money/ui';
import { Toast } from '@/components/money/ui';
import { dayLabel } from '@/lib/format';
import { useMockState } from '@/lib/mock-store';
import { changeRoleAction } from '@/lib/people-actions';
import type { PeopleData, PersonRow } from '@/lib/money-shared';
import type { StaffRole } from '@/lib/role';

const NAME: Record<StaffRole, string> = { admin: 'Admin', board: 'Board', reviewer: 'Reviewer' };
const WITH_ARTICLE: Record<StaffRole, string> = { admin: 'an Admin', board: 'a Board member', reviewer: 'a Reviewer' };
const BUTTON: Record<StaffRole, string> = { admin: 'Make Admin', board: 'Make Board member', reviewer: 'Make Reviewer' };

// The role a "Change role" click offers. The Figma shows Board -> Admin; the others are a guess (see the report):
// an admin goes down to Board, a reviewer goes up to Board.
function offered(role: StaffRole): StaffRole {
  return role === 'board' ? 'admin' : 'board';
}

// What the dialog explains.
function explain(p: PersonRow, to: StaffRole): string {
  const first = p.display_name.split(' ')[0];
  const today = p.role === 'board' ? 'Board' : p.role === 'admin' ? 'an Admin' : 'a Reviewer';
  if (to === 'admin') return `${p.display_name} is ${today} today. As an Admin, ${first} can also change other people’s roles.`;
  return `${p.display_name} is ${today} today. As a Board member, ${first} can do everything except change people’s roles.`;
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

  const roleCell = (p: PersonRow) =>
    p.user_id === data.me ? (
      <>{NAME[p.role]} · you</>
    ) : (
      <>
        {NAME[p.role]}
        {canChange(p) ? (
          <button type="button" className="mn-link" onClick={() => setAsk({ p, to: offered(p.role) })}>
            Change role
          </button>
        ) : null}
      </>
    );

  return (
    <>
      <PageHeader
        title="People and roles"
        sub={
          <>
            <span className="o-lg">{`${people.length} people · only admins can change a role`}</span>
            <span className="o-ph">{`Admin · ${people.length} people`}</span>
          </>
        }
        actionsClass="mn-acts"
      >
        {isAdmin ? (
          <>
            <button type="button" className="o-btn s lg o-lg" onClick={() => setToast({ text: 'Inviting people is not available yet.' })}>
              <OIcon name="plus" size={16} />
              Invite a person
            </button>
            <button type="button" className="o-sq o-ph" aria-label="Invite a person" onClick={() => setToast({ text: 'Inviting people is not available yet.' })}>
              <OIcon name="plus" size={22} />
            </button>
          </>
        ) : null}
      </PageHeader>

      {error ? (
        <p className="mn-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mn-pp">
        <section className="o-card mn-panel mn-people o-lg" aria-label="People">
          <div className="mn-th mn-prow">
            <span>Person</span>
            <span>Title</span>
            <span>Role</span>
            <span>Last active</span>
          </div>
          {people.map((p) => (
            <div key={p.user_id} className="mn-tr mn-prow">
              <span className="mn-pn">
                <span className="mn-av pp">{p.initials}</span>
                <b>{p.display_name}</b>
              </span>
              <span>{p.title ?? ''}</span>
              <span className="mn-pr">{roleCell(p)}</span>
              <b>{lastActive(p.last_sign_in_at, data.now)}</b>
            </div>
          ))}
        </section>

        <section className="o-card mn-panel mn-roles o-lg" aria-labelledby="mn-rl">
          <div className="mn-ph">
            <h2 id="mn-rl">What each role can do</h2>
          </div>
          <p>Admins and board members can do everything here, from tasks and chat to scoring and budget approvals. Only admins can change roles, and no one can change their own.</p>
        </section>

        <section className="o-card mn-plist o-ph" aria-label="People">
          {people.map((p) => (
            <div key={p.user_id} className="mn-pcard">
              <span className="mn-av pp">{p.initials}</span>
              <span className="mn-pcard-n">
                <b>{p.display_name}</b>
                <span>{[p.title, lastActive(p.last_sign_in_at, data.now)].filter(Boolean).join(', ')}</span>
              </span>
              <span className="mn-pcard-r">{roleCell(p)}</span>
            </div>
          ))}
        </section>
        <section className="o-card mn-rolecard o-ph">
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            <OIcon name="people" size={18} />
            <span>
              <b>What each role can do</b>
              <span>{more ? 'Admins and board members can do everything here, from tasks and chat to scoring and budget approvals. Only admins can change roles, and no one can change their own.' : 'Board members can do everything except change roles.'}</span>
            </span>
            <OIcon name={more ? 'down' : 'right'} size={18} />
          </button>
        </section>
      </div>

      {ask ? (
        <Dialog title={`Make ${ask.p.display_name} ${WITH_ARTICLE[ask.to]}?`} onClose={() => setAsk(null)} narrow>
          <p className="mn-dlg-p">{explain(ask.p, ask.to)}</p>
          <div className="mn-qa">
            <button
              type="button"
              className="o-btn p mn-b36"
              disabled={busy}
              onClick={() => void change(ask.p.user_id, ask.to, `${ask.p.display_name} is now ${WITH_ARTICLE[ask.to]}`, { id: ask.p.user_id, role: ask.p.role })}
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
                  void change(u.id, u.role, `${name} is back to ${WITH_ARTICLE[u.role]}`);
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
