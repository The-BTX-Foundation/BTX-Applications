// Field spec for the program_plan_milestones import (replace-set write
// mode). Each CSV row is one milestone, not one full table row on its own
// -- toPayloadGroups groups validated rows by plan_year into the
// { plan_year, milestones: [...] } shape the replace-set write needs, one
// group per distinct plan_year found anywhere in the file. See
// importTables.js's writeMode comment for the upsert+delete-stale
// mechanism this feeds.
import {
  required,
  parseIntegerCell,
  parseOptionalStringCell,
  parseBooleanCell,
  parseDateCell,
} from '../importValidators.js'

export default {
  fields: [
    { column: 'plan_year', label: 'Plan Year', validate: required(parseIntegerCell) },
    { column: 'milestone_name', label: 'Milestone Name', validate: required(parseOptionalStringCell) },
    { column: 'is_complete', label: 'Is Complete', validate: required(parseBooleanCell) },
    { column: 'due_date', label: 'Due Date', validate: parseDateCell }, // nullable at the DB level
  ],

  // Runs after every row above has passed its own field validators. Groups
  // by plan_year into the payload shape the replace-set write expects.
  toPayloadGroups(rows) {
    const groups = new Map()
    for (const row of rows) {
      if (!groups.has(row.plan_year)) groups.set(row.plan_year, [])
      groups
        .get(row.plan_year)
        .push({ milestone_name: row.milestone_name, is_complete: row.is_complete, due_date: row.due_date })
    }
    return Array.from(groups, ([plan_year, milestones]) => ({ plan_year, milestones }))
  },

  // Cross-row check the grouping above makes necessary: two rows sharing a
  // plan_year + milestone_name would both survive per-field validation and
  // per-row grouping, then collide at the DB as the exact same upsert
  // conflict target within a single statement (Postgres rejects an
  // ON CONFLICT upsert that would affect the same row twice in one call).
  // Runs once per plan_year group before executing -- per Phase 2c, if this
  // fails the WHOLE group is excluded from the write, not just the
  // duplicate row, since a partially-applied replace-set could delete a
  // real milestone that simply didn't make it into the kept set.
  validateGroup(milestones) {
    const seen = new Set()
    for (const milestone of milestones) {
      if (seen.has(milestone.milestone_name)) {
        return { ok: false, error: `Duplicate milestone_name "${milestone.milestone_name}" in this plan_year's rows` }
      }
      seen.add(milestone.milestone_name)
    }
    return { ok: true }
  },
}
