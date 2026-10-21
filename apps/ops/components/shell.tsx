'use client';

// The Ops Hub shell, drawn from the Figma "Sidebar", "Phone top bar", "Phone tabs" and menu-sheet frames:
//   laptop (900px and wider): the sidebar on the left, the page on the right;
//   phone: a top bar (menu button, logo, avatar), the page, and five bottom tabs. The menu button opens a sheet with
//   every route.
// The folding areas open on their own page and fold with a click. The user card at the bottom opens a small menu with
// "Sign out" (Figma "Sidebar > Sign-out menu" and "Phone menu > Sign out").
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signOut } from '@btx/data';
import { GROUPS, PEOPLE, TOP, type NavGroup } from '@/lib/nav';
import { NAV_COUNTS, NAV_COUNTS_STRESS_MENU, NAV_COUNTS_STRESS_SIDE, NAV_COUNTS_STRESS_TABS, type Counts } from '@/mock/nav';
import { accountFromRoleText, setReviewAccount } from '@/lib/review-account';
import { reviewScreen } from '@/lib/review-screens';
import { OIcon } from './icons';

type ShellUser = { name: string; initials: string; roleText: string };

// True when the path is this entry's page or a page under it.
function isHere(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

// The gold count pill (or the plain number on Board chat).
function Count({ n, plain }: { n?: number | string; plain?: boolean }) {
  if (n === undefined) return null;
  return <span className={plain ? 'o-ct plain' : 'o-ct'}>{n}</span>;
}

// The user card: initials, name and role. A click opens a small menu with "Sign out": a pop-up above the card on the laptop,
// a row under it in the phone menu (a pop-up would cover a menu row). It closes on Escape, on a click outside and on
// choosing an item, like the Portal's account menu (packages/ui/src/account-menu.tsx).
function UserCard({ user, phone }: { user: ShellUser; phone?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  // Ends the session (cookies in live mode, the tab's remembered email in mock mode), then goes to sign-in.
  async function leave() {
    setOpen(false);
    await signOut();
    try {
      sessionStorage.removeItem('btx-ops-alive');
    } catch {
      // storage blocked: nothing to clear
    }
    router.push('/sign-in');
  }
  const menu = (
    <div className={phone ? 'o-m-out' : 'o-me-menu'} id={id}>
      <button type="button" className="o-me-item" onClick={() => void leave()}>
        {phone ? <OIcon name="signout" size={22} /> : null}
        Sign out
      </button>
    </div>
  );
  return (
    <div className={phone ? 'o-m-mew' : 'o-me-w'} ref={root}>
      {open && !phone ? menu : null}
      <button
        ref={button}
        type="button"
        className={`${phone ? 'o-m-me' : 'o-me'}${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${user.name}, ${user.roleText}. Account menu`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="o-av" data-review-private>{user.initials}</span>
        <span className="o-me-t">
          <b data-review-private>{user.name}</b>
          <span>{user.roleText}</span>
        </span>
      </button>
      {open && phone ? menu : null}
    </div>
  );
}

// One folding area in the sidebar or the phone menu.
function Group({ group, pathname, open, onToggle, phone, counts }: { group: NavGroup; pathname: string; open: boolean; onToggle: () => void; phone?: boolean; counts: Counts }) {
  const prefix = phone ? 'o-m' : 'o-s';
  const count = counts[group.id];
  return (
    <div className={`o-ng ${open ? 'open' : 'shut'}`}>
      <button type="button" className={`${prefix}-gr`} aria-expanded={open} onClick={onToggle}>
        <OIcon name={group.icon} size={phone ? 22 : 19} />
        <span className={`${prefix}-gl`}>{group.label}</span>
        {open ? null : <Count n={count} />}
        <OIcon name={open ? 'down' : 'right'} size={phone ? 18 : 16} className="o-cv" />
      </button>
      {open ? (
        <div className="o-gs">
          {group.items.map((item) => {
            const here = isHere(pathname, item.href);
            return (
              <Link key={item.id} href={item.href} className={`${prefix}-sub${here ? ' on' : ''}`} aria-current={here ? 'page' : undefined}>
                <span>{item.label}</span>
                <Count n={counts[item.id]} />
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// Which folding areas are open: the one holding the current page, plus whatever the person has opened or folded.
function useOpenGroups(pathname: string, initial: Record<string, boolean> = {}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(initial);
  const isOpen = (g: NavGroup) => overrides[g.id] ?? g.items.some((i) => isHere(pathname, i.href));
  const toggle = (g: NavGroup) => setOverrides((o) => ({ ...o, [g.id]: !isOpen(g) }));
  return { isOpen, toggle };
}

// The whole shell around a page.
// `counts` are the real gold counts (live mode); without them the sample counts in mock/nav.ts are drawn.
export function Shell({ user, counts, children }: { user: ShellUser; counts?: Counts; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // The phone menu is open for one page: it remembers the path it was opened on, so going to another page closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menu = menuPath === pathname;
  const setMenu = (open: boolean) => setMenuPath(open ? pathname : null);
  // ?demo=stress draws the counts the Figma stress frames show; the normal view keeps the sample counts.
  const stress = useSearchParams().get('demo') === 'stress';
  const sideCounts: Counts = counts ?? (stress ? NAV_COUNTS_STRESS_SIDE : NAV_COUNTS);
  const tabCounts: Counts = counts ?? (stress ? NAV_COUNTS_STRESS_TABS : NAV_COUNTS);
  const menuCounts: Counts = counts ?? (stress ? NAV_COUNTS_STRESS_MENU : NAV_COUNTS);
  // Rayken Review (Preview only): tell the feedback widget whether this is an admin or a board member. Never the name.
  const roleText = user.roleText;
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_RAYKEN_REVIEW !== '1') return;
    setReviewAccount(accountFromRoleText(roleText));
  }, [roleText]);
  const side = useOpenGroups(pathname);
  // the phone menu opens with Scholarships unfolded (the Figma menu frame)
  const sheet = useOpenGroups(pathname, { scholarships: true });

  // "Keep me signed in" off: a new browser session (the tab's storage is gone) signs out. The sign-in screen sets
  // btx-ops-keep to 0 when the box is unticked, and btx-ops-alive for the current session.
  useEffect(() => {
    try {
      if (localStorage.getItem('btx-ops-keep') === '0' && !sessionStorage.getItem('btx-ops-alive')) {
        void signOut().then(() => router.push('/sign-in'));
      }
    } catch {
      // storage blocked: the session simply stays
    }
  }, [router]);

  return (
    <div className="o-app">
      <aside className="o-sb" aria-label="Ops Hub" data-review="Sidebar navigation">
        <img className="o-logo" src="/btx-logo-on-light.webp" alt="The BTX Foundation" width={68} height={30} />
        <nav className="o-nav" aria-label="Main">
          {TOP.map((t) => {
            const here = isHere(pathname, t.href);
            const needs = t.id === 'today';
            return (
              <Link key={t.id} href={t.href} className={`o-tl${here ? ' on' : ''}`} aria-current={here ? 'page' : undefined}>
                <OIcon name={t.icon} size={19} />
                <span>{t.label}</span>
                <Count n={sideCounts[t.id]} plain={!needs} />
              </Link>
            );
          })}
          <div className="o-sep" />
          {GROUPS.map((g) => (
            <Group key={g.id} group={g} pathname={pathname} open={side.isOpen(g)} onToggle={() => side.toggle(g)} counts={sideCounts} />
          ))}
          <div className="o-sep b" />
          <Link href={PEOPLE.href} className={`o-adm${isHere(pathname, PEOPLE.href) ? ' on' : ''}`}>
            <OIcon name="people" size={17} />
            <span>{PEOPLE.label}</span>
          </Link>
        </nav>
        <UserCard user={user} />
      </aside>

      <div className="o-col">
        <header className="o-pt" data-review="Phone top bar">
          <button type="button" className="o-ib" aria-label="Menu: areas and board members" onClick={() => setMenu(true)}>
            <OIcon name="menu" size={22} />
          </button>
          <img className="o-pt-logo" src="/btx-logo-on-light.webp" alt="The BTX Foundation" width={59} height={26} />
          <span className="o-av o-pt-av" aria-hidden="true" data-review-private>
            {user.initials}
          </span>
        </header>
        <div className="o-page" data-review={reviewScreen(pathname).screen}>
          {children}
        </div>
        <nav className="o-tabs" aria-label="Main" data-review="Phone tabs">
          {TOP.map((t) => {
            const here = isHere(pathname, t.href);
            return (
              <Link key={t.id} href={t.href} className={`o-tab${here ? ' on' : ''}`} aria-current={here ? 'page' : undefined}>
                <span className="o-tab-i">
                  <OIcon name={t.icon} size={22} />
                  {tabCounts[t.id] !== undefined ? <span className={`o-bd${t.id === 'chat' ? ' k' : ''}`}>{tabCounts[t.id]}</span> : null}
                </span>
                {t.id === 'chat' ? 'Chat' : t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {menu ? (
        <div className="o-mn-wrap">
          <button type="button" className="o-mn-scrim" aria-label="Close menu" onClick={() => setMenu(false)} />
          <nav className="o-mn" aria-label="Menu" data-review="Phone menu">
            <div className="o-mn-hd">
              <img src="/btx-logo-on-light.webp" alt="The BTX Foundation" width={59} height={26} />
              <button type="button" className="o-ib" aria-label="Close menu" onClick={() => setMenu(false)}>
                <OIcon name="close" size={22} />
              </button>
            </div>
            {TOP.map((t) => {
              const here = isHere(pathname, t.href);
              return (
                <Link key={t.id} href={t.href} className={`o-m-r${here ? ' on' : ''}`} aria-current={here ? 'page' : undefined}>
                  <OIcon name={t.icon} size={22} />
                  <span className="o-m-l">{t.label}</span>
                  <Count n={menuCounts[t.id]} plain={t.id !== 'today'} />
                </Link>
              );
            })}
            {GROUPS.map((g) => (
              <Group key={g.id} group={g} pathname={pathname} open={sheet.isOpen(g)} onToggle={() => sheet.toggle(g)} phone counts={menuCounts} />
            ))}
            <div className="o-m-sep" />
            <Link href={PEOPLE.href} className="o-m-r">
              <OIcon name="people" size={22} />
              <span className="o-m-l">{PEOPLE.label}</span>
            </Link>
            <UserCard user={user} phone />
          </nav>
        </div>
      ) : null}
    </div>
  );
}
