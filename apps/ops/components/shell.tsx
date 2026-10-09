'use client';

// The Ops Hub shell, drawn from the Figma "Sidebar", "Phone top bar", "Phone tabs" and menu-sheet frames:
//   laptop (900px and wider): the sidebar on the left, the page on the right;
//   phone: a top bar (menu button, logo, avatar), the page, and five bottom tabs. The menu button opens a sheet with
//   every route.
// The folding areas open on their own page and fold with a click. The user card at the bottom signs out.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@btx/data';
import { GROUPS, PEOPLE, TOP, type NavGroup } from '@/lib/nav';
import { NAV_COUNTS } from '@/mock/nav';
import { OIcon } from './icons';

type ShellUser = { name: string; initials: string; roleText: string };

// True when the path is this entry's page or a page under it.
function isHere(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

// The gold count pill (or the plain number on Board chat).
function Count({ n, plain }: { n?: number; plain?: boolean }) {
  if (!n) return null;
  return <span className={plain ? 'o-ct plain' : 'o-ct'}>{n}</span>;
}

// The user card: initials, name and role. A click signs out (the card has no visible button in the design).
function UserCard({ user, className }: { user: ShellUser; className: string }) {
  const router = useRouter();
  // Ends the session (cookies in live mode, the tab's remembered email in mock mode), then goes to sign-in.
  async function leave() {
    await signOut();
    try {
      sessionStorage.removeItem('btx-ops-alive');
    } catch {
      // storage blocked: nothing to clear
    }
    router.push('/sign-in');
  }
  return (
    <button type="button" className={className} onClick={leave} aria-label={`${user.name}, ${user.roleText}. Sign out`}>
      <span className="o-av">{user.initials}</span>
      <span className="o-me-t">
        <b>{user.name}</b>
        <span>{user.roleText}</span>
      </span>
    </button>
  );
}

// One folding area in the sidebar or the phone menu.
function Group({ group, pathname, open, onToggle, phone }: { group: NavGroup; pathname: string; open: boolean; onToggle: () => void; phone?: boolean }) {
  const prefix = phone ? 'o-m' : 'o-s';
  const count = NAV_COUNTS[group.id];
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
                <Count n={NAV_COUNTS[item.id]} />
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
export function Shell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // The phone menu is open for one page: it remembers the path it was opened on, so going to another page closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menu = menuPath === pathname;
  const setMenu = (open: boolean) => setMenuPath(open ? pathname : null);
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
      <aside className="o-sb" aria-label="Ops Hub">
        <img className="o-logo" src="/btx-logo-on-light.png" alt="The BTX Foundation" width={68} height={30} />
        <nav className="o-nav" aria-label="Main">
          {TOP.map((t) => {
            const here = isHere(pathname, t.href);
            const needs = t.id === 'today';
            return (
              <Link key={t.id} href={t.href} className={`o-tl${here ? ' on' : ''}`} aria-current={here ? 'page' : undefined}>
                <OIcon name={t.icon} size={19} />
                <span>{t.label}</span>
                <Count n={NAV_COUNTS[t.id]} plain={!needs} />
              </Link>
            );
          })}
          <div className="o-sep" />
          {GROUPS.map((g) => (
            <Group key={g.id} group={g} pathname={pathname} open={side.isOpen(g)} onToggle={() => side.toggle(g)} />
          ))}
          <div className="o-sep b" />
          <Link href={PEOPLE.href} className={`o-adm${isHere(pathname, PEOPLE.href) ? ' on' : ''}`}>
            <OIcon name="people" size={17} />
            <span>{PEOPLE.label}</span>
          </Link>
        </nav>
        <UserCard user={user} className="o-me" />
      </aside>

      <div className="o-col">
        <header className="o-pt">
          <button type="button" className="o-ib" aria-label="Menu: areas and admin" onClick={() => setMenu(true)}>
            <OIcon name="menu" size={22} />
          </button>
          <img className="o-pt-logo" src="/btx-logo-on-light.png" alt="The BTX Foundation" width={59} height={26} />
          <span className="o-av o-pt-av" aria-hidden="true">
            {user.initials}
          </span>
        </header>
        <div className="o-page">{children}</div>
        <nav className="o-tabs" aria-label="Main">
          {TOP.map((t) => {
            const here = isHere(pathname, t.href);
            return (
              <Link key={t.id} href={t.href} className={`o-tab${here ? ' on' : ''}`} aria-current={here ? 'page' : undefined}>
                <span className="o-tab-i">
                  <OIcon name={t.icon} size={22} />
                  {NAV_COUNTS[t.id] ? <span className={`o-bd${t.id === 'chat' ? ' k' : ''}`}>{NAV_COUNTS[t.id]}</span> : null}
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
          <nav className="o-mn" aria-label="Menu">
            <div className="o-mn-hd">
              <img src="/btx-logo-on-light.png" alt="The BTX Foundation" width={59} height={26} />
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
                  <Count n={NAV_COUNTS[t.id]} plain={t.id !== 'today'} />
                </Link>
              );
            })}
            {GROUPS.map((g) => (
              <Group key={g.id} group={g} pathname={pathname} open={sheet.isOpen(g)} onToggle={() => sheet.toggle(g)} phone />
            ))}
            <div className="o-m-sep" />
            <Link href={PEOPLE.href} className="o-m-r">
              <OIcon name="people" size={22} />
              <span className="o-m-l">{PEOPLE.label}</span>
            </Link>
            <UserCard user={user} className="o-m-me" />
          </nav>
        </div>
      ) : null}
    </div>
  );
}
