// Interviewer pairing (owner's rule O9), as pure functions with no database in them.
// Each interview gets the two available board members with the fewest interviews so far; ties go to the first name
// in A to Z order. "Available" means the person said they are free in that slot's day and part of day (D4:
// Morning 9 to 12, Afternoon 12 to 5, Evening 5 to 9, Eastern time).

export type Block = 'morning' | 'afternoon' | 'evening';
export const BLOCKS: readonly Block[] = ['morning', 'afternoon', 'evening'];
export const BLOCK_LABEL: Record<Block, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
export const BLOCK_HOURS: Record<Block, string> = { morning: '9-12', afternoon: '12-5', evening: '5-9' };
export const TIME_ZONE = 'America/New_York';

export type PairingPerson = { userId: string; name: string };
export type PairingSlot = { id: string; startsAt: string; endsAt?: string };
export type AvailabilityRow = { userId: string; day: string; block: Block };
export type BusyRange = { userId: string; startsAt: string; endsAt: string };

export type PairingInput = {
  /** The interviews to pair (booked, not yet paired). Handled in time order. */
  slots: PairingSlot[];
  /** Everyone who may interview (board accounts). */
  people: PairingPerson[];
  availability: AvailabilityRow[];
  /** Interviews each person already has (done or already paired), so the count is "so far". */
  counts: Record<string, number>;
  /** Interviews people already hold, so nobody is put in two at once. Optional. */
  busy?: BusyRange[];
};

export type Assignment = { slotId: string; interviewerA: string; interviewerB: string };
export type Unpaired = { slotId: string; reason: 'not_enough_available' };
export type PairingResult = { assignments: Assignment[]; unpaired: Unpaired[] };

const dateParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
};

/** Which part of the day an instant falls in, in Eastern time. Before 9 AM counts as morning, 9 PM and later as evening. */
export function blockOf(startsAt: string): Block {
  const { hour } = dateParts(new Date(startsAt));
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

/** The Eastern calendar day of an instant, "2026-10-15". */
export function dayOf(startsAt: string): string {
  return dateParts(new Date(startsAt)).day;
}

const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

// Picks the two people for every slot. Slots nobody can cover come back in `unpaired`.
export function pairInterviews(input: PairingInput): PairingResult {
  const counts = new Map<string, number>(Object.entries(input.counts));
  const free = new Set(input.availability.map((a) => `${a.userId}|${a.day}|${a.block}`));
  const busy: BusyRange[] = [...(input.busy ?? [])];
  const slots = [...input.slots].sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.id.localeCompare(y.id));
  const assignments: Assignment[] = [];
  const unpaired: Unpaired[] = [];
  const seen = new Set<string>();

  for (const slot of slots) {
    const range = { startsAt: slot.startsAt, endsAt: slot.endsAt ?? new Date(Date.parse(slot.startsAt) + 30 * 60_000).toISOString() };
    const day = dayOf(slot.startsAt);
    const block = blockOf(slot.startsAt);
    const candidates = input.people
      .filter((p, i, all) => all.findIndex((q) => q.userId === p.userId) === i)
      .filter((p) => free.has(`${p.userId}|${day}|${block}`))
      .filter((p) => !busy.some((b) => b.userId === p.userId && overlaps(b, range)))
      .sort((x, y) => (counts.get(x.userId) ?? 0) - (counts.get(y.userId) ?? 0) || x.name.localeCompare(y.name) || x.userId.localeCompare(y.userId));
    if (candidates.length < 2 || seen.has(slot.id)) {
      if (!seen.has(slot.id)) unpaired.push({ slotId: slot.id, reason: 'not_enough_available' });
      continue;
    }
    seen.add(slot.id);
    const [a, b] = candidates;
    assignments.push({ slotId: slot.id, interviewerA: a.userId, interviewerB: b.userId });
    for (const p of [a, b]) {
      counts.set(p.userId, (counts.get(p.userId) ?? 0) + 1);
      busy.push({ userId: p.userId, ...range });
    }
  }
  return { assignments, unpaired };
}
