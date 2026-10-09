// Date and time formatting for the Ops Hub. Everything is shown in Eastern time (the BTX cycle's timezone).
const NY = 'America/New_York';

// "2026-09-02T14:00:00Z" -> "Wed Sep 2".
export function dayLabel(ts: string | Date | null | undefined): string {
  if (!ts) return '';
  // en-US writes "Wed, Sep 2"; the design writes "Wed Sep 2".
  return new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ts)).replace(',', '');
}

// "2026-09-02T14:00:00Z" -> "10:00 AM".
export function timeLabel(ts: string | Date | null | undefined): string {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

// "2026-09-14" (a calendar date with no time) -> "Mon Sep 14".
export function dateOnlyLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');
}

// "2026-09-14" -> "Sep 14" (no weekday), for ranges like "Aug 17 - Sep 14".
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

// "Alice Ortiz" -> "A.O." (blind review shows a code and initials, never the name).
export function dottedInitials(name: string | null | undefined): string {
  const parts = (name ?? '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.map((p) => `${p[0].toUpperCase()}.`).join('');
}

// "A.O." -> "AO" (the two-letter avatars use no dots).
export function plainInitials(dotted: string): string {
  return dotted.replace(/\./g, '');
}
