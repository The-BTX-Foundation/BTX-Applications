// Field spec for the donor_impact import (upsert-partial write mode). Only
// columns present in this list AND mapped to a header column in a given
// import are written -- an unmapped field leaves existing rows' values
// untouched entirely, mirroring sync-donor-impact's setIfPresent behavior.
// See importTables.js's writeMode comment for the full mechanism.
import { required, parseIntegerCell, parseNumericCell, parseBooleanCell } from '../importValidators.js'

export default {
  fields: [
    { column: 'cycle_year', label: 'Cycle Year', validate: required(parseIntegerCell) }, // upsert key
    { column: 'funds_granted', label: 'Funds Granted', validate: parseNumericCell },
    { column: 'students_reached', label: 'Students Reached', validate: parseIntegerCell },
    { column: 'scholarships_awarded', label: 'Scholarships Awarded', validate: parseIntegerCell },
    { column: 'applicants_count', label: 'Applicants Count', validate: parseIntegerCell },
    { column: 'geographic_spread_count', label: 'Geographic Spread', validate: parseIntegerCell },
    { column: 'scholarship_funds_awarded', label: 'Scholarship Funds Awarded', validate: parseNumericCell },
    { column: 'other_program_funds_awarded', label: 'Other Program Funds Awarded', validate: parseNumericCell },
    { column: 'published', label: 'Published', validate: parseBooleanCell },
    { column: 'workshops_held', label: 'Workshops Held', validate: parseIntegerCell },
    { column: 'attendance_per_workshop', label: 'Attendance Per Workshop', validate: parseNumericCell },
    { column: 'mentor_volunteer_hours', label: 'Mentor Volunteer Hours', validate: parseNumericCell },
    { column: 'repeat_engagement', label: 'Repeat Engagement', validate: parseIntegerCell },
    { column: 'students_sponsored_travel', label: 'Students Sponsored (Travel)', validate: parseIntegerCell },
    {
      column: 'students_sponsored_certifications',
      label: 'Students Sponsored (Certifications)',
      validate: parseIntegerCell,
    },
    { column: 'retention_graduation_rate', label: 'Retention/Graduation Rate', validate: parseNumericCell },
    { column: 'gpa_improvement', label: 'GPA Improvement', validate: parseNumericCell },
    { column: 'internships_received', label: 'Internships Received', validate: parseIntegerCell },
    { column: 'post_graduation_outcomes', label: 'Post-Graduation Outcomes', validate: parseNumericCell },
    { column: 'pct_first_generation', label: '% First-Generation', validate: parseNumericCell },
    { column: 'pct_underrepresented_low_income', label: '% Underrepresented/Low-Income', validate: parseNumericCell },
    { column: 'pct_donations_to_programs', label: '% Donations to Programs', validate: parseNumericCell },
  ],
  partialUpdate: true, // signals to the writer: only send columns mapped in this import
}
