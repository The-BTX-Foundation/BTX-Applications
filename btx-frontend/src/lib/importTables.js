// Registry of every table the Import feature can write to. Each entry
// carries only the structural metadata the wizard needs to behave
// generically -- which write call to make and how rows are keyed -- not
// field lists or validation, which live in the per-table modules under
// importFieldSpecs/ that fieldSpec lazily points to (kept separate so
// adding/editing one table's fields never touches this file).
//
// writeMode meanings (see the Phase 1 sync-function audit for where each
// comes from):
//   'insert'         -- create-only, no natural key (the 4 task tables)
//   'upsert'         -- every column always written, full-row replace
//   'upsert-partial' -- only columns mapped in a given import are written;
//                       an unmapped column leaves existing rows untouched
//                       (donor_impact only -- mirrors sync-donor-impact's
//                       presence-based setIfPresent behavior)
//   'replace-set'    -- rows are grouped by `groupBy`, upserted, then any
//                       existing row in that group not present in the
//                       import is deleted (program_plan_milestones only --
//                       mirrors sync-program-plan-milestones)

export const IMPORT_TABLES = [
  {
    id: 'donor_impact',
    label: 'Donor Impact',
    table: 'donor_impact',
    naturalKey: ['cycle_year'],
    writeMode: 'upsert-partial',
    fieldSpec: () => import('./importFieldSpecs/donorImpact.js'),
  },
  {
    id: 'fundraising_health',
    label: 'Fundraising Health',
    table: 'fundraising_health',
    naturalKey: ['period_year', 'period_month'],
    writeMode: 'upsert',
    fieldSpec: () => import('./importFieldSpecs/fundraisingHealth.js'),
  },
  {
    id: 'budget_tracking',
    label: 'Budget Tracking',
    table: 'budget_tracking',
    naturalKey: ['reporting_year', 'reporting_month'],
    writeMode: 'upsert',
    fieldSpec: () => import('./importFieldSpecs/budgetTracking.js'),
  },
  {
    id: 'grant_pipeline',
    label: 'Grant Pipeline',
    table: 'grant_pipeline',
    naturalKey: ['grant_name', 'funder'],
    writeMode: 'upsert',
    fieldSpec: () => import('./importFieldSpecs/grantPipeline.js'),
  },
  {
    id: 'program_plan_progress',
    label: 'Program Plan Progress',
    table: 'program_plan_progress',
    naturalKey: ['plan_year'],
    writeMode: 'upsert',
    fieldSpec: () => import('./importFieldSpecs/programPlanProgress.js'),
  },
  {
    id: 'program_plan_milestones',
    label: 'Program Plan Milestones',
    table: 'program_plan_milestones',
    naturalKey: ['plan_year', 'milestone_name'],
    writeMode: 'replace-set',
    groupBy: 'plan_year',
    fieldSpec: () => import('./importFieldSpecs/programPlanMilestones.js'),
  },
  {
    id: 'event_tracker_events',
    label: 'Event Tracker Events',
    table: 'event_tracker_events',
    naturalKey: ['event_date', 'category', 'event_name'],
    writeMode: 'upsert',
    fieldSpec: () => import('./importFieldSpecs/eventTrackerEvents.js'),
  },
  {
    id: 'tasks_alerts',
    label: 'Tasks & Approvals',
    table: 'tasks_alerts',
    naturalKey: null,
    createOnly: true,
    writeMode: 'insert',
    fieldSpec: () => import('./importFieldSpecs/tasksAlerts.js'),
  },
  {
    id: 'marketing_tasks',
    label: 'Marketing Tasks',
    table: 'marketing_tasks',
    naturalKey: null,
    createOnly: true,
    writeMode: 'insert',
    fieldSpec: () => import('./importFieldSpecs/marketingTasks.js'),
  },
  {
    id: 'budgeting_tasks',
    label: 'Budgeting Tasks',
    table: 'budgeting_tasks',
    naturalKey: null,
    createOnly: true,
    writeMode: 'insert',
    fieldSpec: () => import('./importFieldSpecs/budgetingTasks.js'),
  },
  {
    id: 'fundraising_tasks',
    label: 'Fundraising Tasks',
    table: 'fundraising_tasks',
    naturalKey: null,
    createOnly: true,
    writeMode: 'insert',
    fieldSpec: () => import('./importFieldSpecs/fundraisingTasks.js'),
  },
]
