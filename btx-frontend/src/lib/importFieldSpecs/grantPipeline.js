// Field spec for the grant_pipeline import (plain upsert -- every mapped
// column is always written, full-row replace on conflict).
import { required, parseOptionalStringCell, parseNumericCell, parseEnumCell } from '../importValidators.js'

// Mirrors sync-grant-pipeline's exact, case-sensitive allowed list --
// "submitted" (lowercase) is rejected, not normalized, same as the Edge
// Function.
const STATUS_OPTIONS = ['Submitted', 'Pending', 'Awarded', 'Declined']

export default {
  fields: [
    { column: 'grant_name', label: 'Grant Name', validate: required(parseOptionalStringCell) }, // upsert key
    { column: 'funder', label: 'Funder', validate: required(parseOptionalStringCell) }, // upsert key
    { column: 'amount', label: 'Amount', validate: parseNumericCell },
    { column: 'status', label: 'Status', validate: (raw) => parseEnumCell(raw, STATUS_OPTIONS) },
  ],
}
