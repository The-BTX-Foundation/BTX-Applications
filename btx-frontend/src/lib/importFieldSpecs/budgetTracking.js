// Field spec for the budget_tracking import (plain upsert -- every mapped
// column is always written, full-row replace on conflict).
import { required, parseIntegerCell, parseNumericCell } from '../importValidators.js'

// reporting_month needs a 1-12 range on top of being a whole number --
// mirrors sync-budget-tracking's explicit range check (same pattern as
// fundraising_health's period_month; kept local to each file rather than
// promoted to a shared validator since only these two tables need it).
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
    { column: 'reporting_year', label: 'Reporting Year', validate: required(parseIntegerCell) }, // upsert key
    { column: 'reporting_month', label: 'Reporting Month', validate: required(parseMonthCell) }, // upsert key
    { column: 'program_expenses', label: 'Program Expenses', validate: parseNumericCell },
    { column: 'overhead_expenses', label: 'Overhead Expenses', validate: parseNumericCell },
    { column: 'fundraising_expenses', label: 'Fundraising Expenses', validate: parseNumericCell },
    { column: 'current_funds_on_hand', label: 'Current Funds on Hand', validate: parseNumericCell },
    { column: 'monthly_operating_expense', label: 'Monthly Operating Expense', validate: parseNumericCell },
    { column: 'programs_budgeted', label: 'Programs Budgeted', validate: parseNumericCell },
    { column: 'programs_actual', label: 'Programs Actual', validate: parseNumericCell },
    { column: 'overhead_admin_budgeted', label: 'Overhead/Admin Budgeted', validate: parseNumericCell },
    { column: 'overhead_admin_actual', label: 'Overhead/Admin Actual', validate: parseNumericCell },
    { column: 'fundraising_budgeted', label: 'Fundraising Budgeted', validate: parseNumericCell },
    { column: 'fundraising_actual', label: 'Fundraising Actual', validate: parseNumericCell },
    { column: 'marketing_budgeted', label: 'Marketing Budgeted', validate: parseNumericCell },
    { column: 'marketing_actual', label: 'Marketing Actual', validate: parseNumericCell },
  ],
}
