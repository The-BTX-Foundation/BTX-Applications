// Rebalance (admins): moves future interviews from board members over an even share to those under it. Pure
// functions, no database. Who may take a given interview comes in as data (the database's interview_candidates()
// for that slot: free then, under their limit, not busy, not someone who knows the student), so the private
// "students I know" lists never reach this code.

export type RebalancePerson = {
  userId: string;
  name: string;
  /** "Most N interviews"; null = no limit. */
  maxInterviews: number | null;
};

export type RebalanceInterview = {
  slotId: string;
  startsAt: string;
  endsAt: string;
  /** The two interviewers now. */
  a: string;
  b: string;
  /** Who may take this interview (interview_candidates for the slot). People already on it are ignored. */
  candidates: string[];
};

export type Move = { slotId: string; from: string; to: string };

export type RebalanceResult = {
  /** The even target per person who sent availability. */
  targets: Record<string, number>;
  moves: Move[];
  /** Interviews per person before and after the moves (everyone holding an interview, plus everyone in `people`). */
  before: Record<string, number>;
  after: Record<string, number>;
};

/** Interviews that start within this many hours never move. */
export const PROTECT_HOURS = 48;

// The even target for each person. `seats` is the number of interviewer places to share (2 per paired interview).
// Someone whose limit is below an even share gets their limit, and the rest is shared by the others: each gets the
// floor or the ceiling of the share. The ceilings go first to people who already hold more (so fewer interviews
// move), then by name A to Z. When the limits leave seats over, the targets add up to less than `seats`.
export function rebalanceTargets(people: RebalancePerson[], seats: number, current: Record<string, number> = {}): Record<string, number> {
  const targets: Record<string, number> = {};
  const pool = [...people].sort((x, y) => (x.maxInterviews ?? Infinity) - (y.maxInterviews ?? Infinity) || x.name.localeCompare(y.name) || x.userId.localeCompare(y.userId));
  let remaining = Math.max(0, seats);
  let i = 0;
  // Capped people first: anyone whose limit is at or under the even share of what is left.
  while (i < pool.length) {
    const share = remaining / (pool.length - i);
    const max = pool[i].maxInterviews;
    if (max === null || max > Math.floor(share)) break;
    targets[pool[i].userId] = max;
    remaining -= max;
    i += 1;
  }
  const rest = pool.slice(i);
  if (rest.length === 0) return targets;
  const base = Math.floor(remaining / rest.length);
  let extra = remaining - base * rest.length;
  const order = [...rest].sort((x, y) => (current[y.userId] ?? 0) - (current[x.userId] ?? 0) || x.name.localeCompare(y.name) || x.userId.localeCompare(y.userId));
  for (const p of order) {
    const bump = extra > 0 && (p.maxInterviews === null || base + 1 <= p.maxInterviews) ? 1 : 0;
    targets[p.userId] = base + bump;
    extra -= bump;
  }
  return targets;
}

const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);

// Plans the moves. Only interviews starting more than 48 hours after `now` move, one interviewer at a time, from
// someone over their target to someone under theirs who may take that interview. Every interview keeps two different
// people. People who hold interviews but are not in `people` (they did not send availability) are left alone, and
// their places are not shared out.
export function planRebalance(opts: { people: RebalancePerson[]; interviews: RebalanceInterview[]; now: Date; protectHours?: number }): RebalanceResult {
  const ids = new Set(opts.people.map((p) => p.userId));
  const before: Record<string, number> = {};
  for (const p of opts.people) before[p.userId] = 0;
  for (const iv of opts.interviews) for (const u of [iv.a, iv.b]) before[u] = (before[u] ?? 0) + 1;
  const seats = opts.interviews.reduce((n, iv) => n + Number(ids.has(iv.a)) + Number(ids.has(iv.b)), 0);
  const targets = rebalanceTargets(opts.people, seats, before);
  const count: Record<string, number> = { ...before };
  const name = new Map(opts.people.map((p) => [p.userId, p.name]));
  const cutoff = opts.now.getTime() + (opts.protectHours ?? PROTECT_HOURS) * 3_600_000;
  const pairs = new Map(opts.interviews.map((iv) => [iv.slotId, { ...iv }]));
  // Interviews each person picks up in this plan, so nobody is moved into two at once.
  const added = new Map<string, RebalanceInterview[]>();
  const movable = opts.interviews.filter((iv) => Date.parse(iv.startsAt) > cutoff).sort((x, y) => y.startsAt.localeCompare(x.startsAt) || x.slotId.localeCompare(y.slotId));
  const over = (u: string) => ids.has(u) && (count[u] ?? 0) > (targets[u] ?? 0);
  const under = (u: string) => ids.has(u) && (count[u] ?? 0) < (targets[u] ?? 0);
  const moves: Move[] = [];

  // Repeat until nothing moves: the person furthest over gives one interview (latest first) to the eligible person
  // furthest under (then name A to Z).
  for (let guard = 0; guard < 10_000; guard += 1) {
    const givers = opts.people
      .map((p) => p.userId)
      .filter(over)
      .sort((x, y) => (count[y] - targets[y]) - (count[x] - targets[x]) || (name.get(x) ?? '').localeCompare(name.get(y) ?? '') || x.localeCompare(y));
    let moved = false;
    for (const from of givers) {
      for (const iv0 of movable) {
        const iv = pairs.get(iv0.slotId)!;
        if (iv.a !== from && iv.b !== from) continue;
        const takers = iv.candidates
          .filter((u) => u !== iv.a && u !== iv.b && under(u))
          .filter((u) => !(added.get(u) ?? []).some((x) => overlaps(x, iv)))
          .sort((x, y) => (count[x] - targets[x]) - (count[y] - targets[y]) || (name.get(x) ?? '').localeCompare(name.get(y) ?? '') || x.localeCompare(y));
        const to = takers[0];
        if (!to) continue;
        if (iv.a === from) iv.a = to;
        else iv.b = to;
        count[from] -= 1;
        count[to] = (count[to] ?? 0) + 1;
        added.set(to, [...(added.get(to) ?? []), iv]);
        moves.push({ slotId: iv.slotId, from, to });
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  return { targets, moves, before, after: count };
}
