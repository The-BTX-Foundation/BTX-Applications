// Buttons: primary (gold fill, ink text) and secondary (outlined). Sizes follow the drafts:
// 48px by default, 56px with size="xl". Continue and other actions are never disabled in the Portal,
// so there is no disabled style here on purpose.
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';

type Look = {
  /** p = gold primary (default), s = outlined secondary. */
  kind?: 'p' | 's';
  /** xl = the 56px landing and sign-in size. */
  size?: 'xl';
  /** Fill the width of the container. */
  full?: boolean;
  icon?: IconName;
  /** Put the icon after the label instead of before it. */
  iconAfter?: boolean;
  className?: string;
  children: ReactNode;
};

// Builds the class string shared by Button and ButtonLink.
function classes({ kind = 'p', size, full, className }: Look): string {
  return ['btn', kind, size, full ? 'w' : '', className].filter(Boolean).join(' ');
}

// The label with its optional icon.
function Inner({ icon, iconAfter, children }: Look) {
  const mark = icon ? <Icon name={icon} /> : null;
  return (
    <>
      {iconAfter ? null : mark}
      {children}
      {iconAfter ? mark : null}
    </>
  );
}

// A real <button>. Defaults to type="button" so a button inside a form never submits by accident.
export function Button({
  kind,
  size,
  full,
  icon,
  iconAfter,
  className,
  children,
  type = 'button',
  ...rest
}: Look & ButtonHTMLAttributes<HTMLButtonElement>) {
  const look = { kind, size, full, icon, iconAfter, className, children };
  return (
    <button type={type} className={classes(look)} {...rest}>
      <Inner {...look} />
    </button>
  );
}

// A link drawn as a button (Back, Sign in, Start your application).
export function ButtonLink({
  kind,
  size,
  full,
  icon,
  iconAfter,
  className,
  children,
  href,
  ...rest
}: Look & { href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  const look = { kind, size, full, icon, iconAfter, className, children };
  return (
    <Link href={href} className={classes(look)} {...rest}>
      <Inner {...look} />
    </Link>
  );
}
