// Field spec for the fundraising_health import (plain upsert -- every
// mapped column is always written, full-row replace on conflict).
import { required, parseIntegerCell, parseNumericCell } from '../importValidators.js'

// period_month needs a 1-12 range on top of being a whole number --
// mirrors sync-fundraising-health's explicit range check, which exists
// in the Edge Function because there's no DB CHECK constraint enforcing
// it either. Kept local to this file rather than added to the shared
// importValidators.js since only this table and budget_tracking need it.
function parseMonthCell(raw) {
  const result = parseIntegerCell(raw)
  if (!result.ok) return result
  if (result.value !== null && (result.value < 1 || result.value > 12)) {
    return { ok: false, error: `"${raw}" must be between 1 and 12` }
  }
  return result
}

export default {
  fields: [
    { column: 'period_year', label: 'Period Year', validate: required(parseIntegerCell) }, // upsert key
    { column: 'period_month', label: 'Period Month', validate: required(parseMonthCell) }, // upsert key
    { column: 'individual_donors', label: 'Individual Donors', validate: parseNumericCell },
    { column: 'corporate_partnerships', label: 'Corporate Partnerships', validate: parseNumericCell },
    { column: 'grants_revenue', label: 'Grants Revenue', validate: parseNumericCell },
    { column: 'events_revenue', label: 'Events Revenue', validate: parseNumericCell },
    { column: 'annual_goal', label: 'Annual Goal', validate: parseNumericCell },
    { column: 'donor_retention_rate', label: 'Donor Retention Rate', validate: parseNumericCell },
    { column: 'average_gift_size', label: 'Average Gift Size', validate: parseNumericCell },
    { column: 'median_gift_size', label: 'Median Gift Size', validate: parseNumericCell },
    { column: 'new_donors', label: 'New Donors', validate: parseIntegerCell },
    { column: 'recurring_donors', label: 'Recurring Donors', validate: parseIntegerCell },
  ],
}
