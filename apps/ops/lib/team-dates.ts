// Pure date helpers shared by the Today, Tasks, Goals and Calendar loaders (no server imports, so tests can use them).

// Today's date in Eastern time ("2026-10-12").
export function easternToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

// A timestamp's Eastern calendar date.
export function easternDate(ts: string): string {
  return easternToday(new Date(ts));
}

const DAY = 86_400_000;
const parse = (s: string) => Date.parse(`${s}T00:00:00Z`);

// "2026-10-12" plus n days.
export function plusDays(s: string, n: number): string {
  return new Date(parse(s) + n * DAY).toISOString().slice(0, 10);
}

// The Sunday that starts the week holding `s`.
export function sundayOf(s: string): string {
  return plusDays(s, -new Date(parse(s)).getUTCDay());
}

// "$4,830" from cents (whole dollars, cents dropped when zero).
export function dollars(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
