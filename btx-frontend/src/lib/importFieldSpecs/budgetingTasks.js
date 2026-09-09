// Field spec for the budgeting_tasks import (plain insert -- create-only,
// no natural key). Mirrors createTask() in src/stores/budgetingTasks.js.
// No `type` column exists on this table (Phase 1).
import { required, parseOptionalStringCell, parseDateCell } from '../importValidators.js'
import { resolveAssignee } from '../importAssigneeLookup.js'

export default {
  fields: [
    { column: 'title', label: 'Title', validate: required(parseOptionalStringCell) }, // NOT NULL at the DB level
    {
      column: 'assigned_to',
      label: 'Assigned To',
      needsContext: 'assigneeLookup', // prefetched name -> id map from buildAssigneeLookup()
      validate: (raw, context) => resolveAssignee(context.assigneeLookup, raw),
    },
    { column: 'date', label: 'Date', validate: required(parseDateCell) }, // NOT NULL at the DB level
    { column: 'description', label: 'Description', validate: parseOptionalStringCell },
  ],

  // status is deliberately not an importable field at all -- every existing
  // createTask() call across all four task stores hardcodes status: 'Open'
  // regardless of caller input (Phase 1), mirrored here exactly. A "status"
  // column present in an uploaded file is simply ignored, never mapped.
  fixedFields: { status: 'Open' },
}
