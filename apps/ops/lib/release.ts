// "Release decisions": the rule behind the server action releaseDecisions() (lib/actions/selection.ts), kept apart from
// the database so the unit tests (tests/release.test.ts) can check it with stand-in reads and writes.
//
// The rule: only an admin may release; the cycle's main award must be recorded first; releasing stamps
// cycles.decisions_released_at = now() once, and asking again changes nothing and still answers yes (idempotent).
// After the stamp, the Portal's my_decision() starts telling applicants whether they won.

export type ReleaseDeps = {
  /** The signed-in person's role (app_metadata.role), or null when nobody is signed in. */
  role: () => Promise<string | null>;
  /** The cycle's current release time, or undefined when there is no such cycle (or it can't be read). */
  releasedAt: (cycleId: string) => Promise<string | null | undefined>;
  /** True when the cycle has a recorded main award. */
  hasMainAward: (cycleId: string) => Promise<boolean>;
  /**
   * Sets decisions_released_at = at only where it is still empty. Returns the time now stored when this call set it,
   * null when nothing changed (someone released first), or throws on a database error.
   */
  stamp: (cycleId: string, at: string) => Promise<string | null>;
};

export type ReleaseResult = { ok: true; releasedAt: string; already: boolean } | { ok: false; message: string };

export async function releaseDecisionsWith(deps: ReleaseDeps, cycleId: string, now: Date = new Date()): Promise<ReleaseResult> {
  if (!cycleId) return { ok: false, message: 'No cycle to release.' };
  if ((await deps.role()) !== 'admin') return { ok: false, message: 'Only a board member with admin rights can send decisions.' };
  const current = await deps.releasedAt(cycleId);
  if (current === undefined) return { ok: false, message: 'That cycle was not found.' };
  if (current) return { ok: true, releasedAt: current, already: true };
  if (!(await deps.hasMainAward(cycleId))) return { ok: false, message: 'Record the main award before releasing decisions.' };
  const set = await deps.stamp(cycleId, now.toISOString());
  if (set) return { ok: true, releasedAt: set, already: false };
  // Someone released between the read and the write: answer with their time.
  const after = await deps.releasedAt(cycleId);
  return after ? { ok: true, releasedAt: after, already: true } : { ok: false, message: "Decisions weren't released. Try again." };
}
