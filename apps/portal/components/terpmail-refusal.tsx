'use client';

// Shown when the database refuses a non-Terpmail applicant (on submit: terpmail_required; on starting a draft: a
// row-level-security refusal). Reuses the drawn error box (.es) and the sign-in copy; the link signs her out so she
// can sign in again with her Terpmail address.
import { forwardRef } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorIcon } from '@btx/ui';
import { signOut } from '@btx/data';
import { TERPMAIL_REFUSAL } from '@/lib/terpmail';

export const TerpmailRefusal = forwardRef<HTMLDivElement, { className?: string }>(function TerpmailRefusal({ className }, ref) {
  const router = useRouter();
  async function again(e: React.MouseEvent) {
    e.preventDefault();
    await signOut();
    router.push('/sign-in');
    router.refresh();
  }
  return (
    <div className={`es ${className ?? ''}`} role="alert" tabIndex={-1} ref={ref}>
      <p>
        <ErrorIcon />
        <span>{TERPMAIL_REFUSAL}</span>
      </p>
      <div style={{ fontSize: 16, lineHeight: 1.5, marginTop: 6, fontWeight: 400 }}>
        <a href="/sign-in" className="lk" onClick={again}>
          Sign out and sign in again
        </a>
      </div>
    </div>
  );
});
