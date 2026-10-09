-- =============================================================================
-- Ops Hub schema (2026-10-10)
--
-- DRAFT. NOT APPLIED. Apply only after Dominick approves it by naming the
-- production project (awiaebtqalcmfafvktwh, "BTX Student/Operations Hub").
-- Plain-English guide: supabase/migrations/README-ops-hub.md
--
-- Runs after 20261009130000_portal_fresh_start.sql (applied 2026-10-09). It
-- only ADDS: no Portal table, policy or function is changed or dropped.
--
-- What this does, in one transaction:
--   a. Staff profiles (name, title, initials). The role itself stays in
--      app_metadata, written only by the service role.
--   b. Areas, task types, checklists, plan milestones, tasks, assignees,
--      comments.
--   c. Calendar events, goals, year-over-year figures.
--   d. Board chat: channels (one per area + direct), members, messages,
--      read markers, pins.
--   e. Money: budget years, categories, quarterly plans (with approval),
--      spending, funds on hand, donors, gifts, grants.
--   f. Programs: programs, certification ideas, sponsorships.
--   g. Outreach: channels, posts, newsletter issues and sections.
--   h. Scholarships, staff side: board availability per slot, interviewer
--      pairs per slot (+ video link), interview summaries, rubric, scores,
--      private notes, awards (decisions) and the awardee checklist.
--   i. Security-invoker views and the few functions the screens need.
--   j. Grants and RLS policies on every new table.
--   k. Import of the legacy program plan (2021 + 2026) into plan_milestones
--      and tasks, keeping each row's year.
--   l. A final check that raises (and rolls everything back) if a rule below
--      is broken.
--
-- Who can do what (decided from the Figma "People and roles" screen: "Admins
-- and board members can do everything here, from tasks and chat to scoring
-- and budget approvals. Only admins can change roles, and no one can change
-- their own."):
--   admin    everything below, plus admin-only setup (areas, task types,
--            rubric, interviewer pairing, chat channels, staff profiles of
--            others).
--   board    everything an admin can, except that admin-only setup.
--   reviewer scoring only: own profile, the staff list, the rubric, the
--            applications they interview (pairing), their own scores and
--            notes, and tasks assigned to them. No chat, money, programs,
--            outreach, calendar or goals.
--   applicant / signed out: nothing in this file.
-- Every policy reads the role only through public.app_role() / is_staff().
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- a. Staff profiles
-- -----------------------------------------------------------------------------

-- One row per staff member (admin, board, reviewer). The role is NOT here: it
-- lives in auth.users.raw_app_meta_data and is read with public.app_role().
-- Created by the person on first sign-in to the Ops Hub, or by an admin.
create table public.staff_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  title        text check (char_length(title) <= 120),              -- 'President', 'Program lead'
  initials     text not null check (initials ~ '^[A-Z]{1,3}$'),     -- 'DM'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger staff_profiles_touch before update on public.staff_profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- b. Areas, task types, checklists, milestones, tasks
-- -----------------------------------------------------------------------------

-- The four areas in the sidebar. Fixed list; admins may rename.
create table public.areas (
  slug     text primary key check (slug ~ '^[a-z_]{2,40}$'),
  name     text not null check (char_length(name) between 1 and 60),
  position smallint not null default 0
);

insert into public.areas (slug, name, position) values
  ('scholarships', 'Scholarships', 1),
  ('money',        'Money',        2),
  ('programs',     'Programs',     3),
  ('outreach',     'Outreach',     4);

-- The kinds of task the screens show under a task's title ("Task",
-- "Request", "Approval", ...). The type picks the icon and the action.
create table public.task_types (
  code     text primary key check (code ~ '^[a-z_]{2,40}$'),
  label    text not null check (char_length(label) between 1 and 60),
  position smallint not null default 0
);

insert into public.task_types (code, label, position) values
  ('task',      'Task',      1),
  ('request',   'Request',   2),   -- "Give interview availability"
  ('approval',  'Approval',  3),   -- "Approve Q4 budget"
  ('post',      'Post',      4),   -- "Instagram post: Meet the board"
  ('scoring',   'Scoring',   5),   -- "Score 3 applicants"
  ('meeting',   'Meeting',   6),   -- "Selection meeting"
  ('decision',  'Decision',  7),   -- "Decide grants are worth trying"
  ('document',  'Document',  8),   -- "Write a one-page BTX summary"
  ('goal',      'Goal',      9),   -- "Set the year-end goal: $5,200"
  ('follow_up', 'Follow-up', 10);  -- "Send thank-you notes"

-- Programs: the three fixed pages under Programs.
create table public.programs (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique check (slug ~ '^[a-z_]{2,40}$'),
  name                    text not null check (char_length(name) between 1 and 120),
  kind                    text not null check (kind in ('certification', 'mentorship', 'sponsorship')),
  status                  text not null default 'planned'
                            check (status in ('planned', 'setting_up', 'active', 'paused', 'ended')),
  summary                 text check (char_length(summary) <= 500),     -- "BTX pays exam fees so ..."
  pilot_budget_cents      bigint check (pilot_budget_cents >= 0),       -- "Pilot budget $1,500"
  budget_period           text check (char_length(budget_period) <= 40),-- "Q4 2026"
  students_target         integer check (students_target >= 0),        -- "up to 5"
  cost_per_student_cents  bigint check (cost_per_student_cents >= 0),   -- "About $300 each"
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger programs_touch before update on public.programs
  for each row execute function public.touch_updated_at();

insert into public.programs (slug, name, kind, status) values
  ('certification', 'Certification program', 'certification', 'setting_up'),
  ('mentorship',    'Mentorship program',    'mentorship',    'planned'),
  ('sponsorships',  'Sponsorships',          'sponsorship',   'active');

-- Money: one row per budget year.
create table public.budget_years (
  year       smallint primary key check (year between 2020 and 2100),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

-- Budget categories for a year ("Scholarships", "Sponsorships (NSBE
-- convention)", ...). `kind` lets the app find the category that automatic
-- spending (sponsorships, award payments, exam fees) is logged against.
create table public.budget_categories (
  id           uuid primary key default gen_random_uuid(),
  year         smallint not null references public.budget_years (year) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  kind         text not null default 'other'
                 check (kind in ('scholarships', 'sponsorships', 'certifications',
                                 'operations', 'outreach', 'other')),
  budget_cents bigint not null default 0 check (budget_cents >= 0),
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint budget_categories_unique_name unique (year, name)
);

-- At most one category of each automatic kind per year ('other' may repeat).
create unique index budget_categories_one_kind_per_year
  on public.budget_categories (year, kind) where kind <> 'other';

create trigger budget_categories_touch before update on public.budget_categories
  for each row execute function public.touch_updated_at();

-- A quarter's spending plan ("Q4 plan $4,830 for October to December") and
-- its approval. decided_by / decided_at are stamped by a trigger (section i).
create table public.budget_quarter_plans (
  id           uuid primary key default gen_random_uuid(),
  year         smallint not null references public.budget_years (year) on delete cascade,
  quarter      smallint not null check (quarter between 1 and 4),
  status       text not null default 'draft'
                 check (status in ('draft', 'awaiting_approval', 'approved', 'declined')),
  note         text check (char_length(note) <= 1000),          -- "The certification program line is new."
  decline_note text check (char_length(decline_note) <= 2000),  -- "What should change?"
  submitted_by uuid references public.staff_profiles (user_id) on delete set null,
  submitted_at timestamptz,
  decided_by   uuid references public.staff_profiles (user_id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint budget_quarter_plans_one_per_quarter unique (year, quarter),
  constraint budget_quarter_plans_decided check (
    (status in ('approved', 'declined')) = (decided_at is not null))
);

create trigger budget_quarter_plans_touch before update on public.budget_quarter_plans
  for each row execute function public.touch_updated_at();

-- One line per category in a quarter plan.
create table public.budget_quarter_plan_lines (
  plan_id      uuid not null references public.budget_quarter_plans (id) on delete cascade,
  category_id  uuid not null references public.budget_categories (id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (plan_id, category_id)
);

create index budget_quarter_plan_lines_category on public.budget_quarter_plan_lines (category_id);

-- Outreach channels (Instagram, Newsletter, LinkedIn, Campus events).
create table public.outreach_channels (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique check (char_length(name) between 1 and 60),
  kind           text not null check (kind in ('instagram', 'newsletter', 'linkedin', 'campus_events', 'other')),
  target         text check (char_length(target) <= 120),   -- "4 posts a month", null = [Not set]
  status         text not null default 'not_started'
                   check (status in ('not_started', 'active', 'paused')),
  status_note    text check (char_length(status_note) <= 200),  -- "Back on Fri Oct 30"
  owner_id       uuid references public.staff_profiles (user_id) on delete set null,
  audience_count integer check (audience_count >= 0),       -- newsletter subscribers, when known
  position       smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger outreach_channels_touch before update on public.outreach_channels
  for each row execute function public.touch_updated_at();

insert into public.outreach_channels (name, kind, status, position) values
  ('Instagram',     'instagram',     'active',      1),
  ('Newsletter',    'newsletter',    'active',      2),
  ('LinkedIn',      'linkedin',      'not_started', 3),
  ('Campus events', 'campus_events', 'not_started', 4);

-- A social post on a channel. Its steps (draft caption, pick photo, board
-- approval, schedule, mark posted) are a checklist (checklists.post_id).
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.outreach_channels (id) on delete restrict,
  title       text not null check (char_length(title) between 1 and 200),
  post_on     date,
  owner_id    uuid references public.staff_profiles (user_id) on delete set null,
  caption     text check (char_length(caption) <= 5000),
  image_path  text check (char_length(image_path) <= 512),   -- storage path, bucket to be added
  status      text not null default 'not_started'
                check (status in ('not_started', 'drafting', 'awaiting_approval', 'approved',
                                  'scheduled', 'posted')),
  status_note text check (char_length(status_note) <= 200),  -- "Starts once the winner is announced"
  posted_at   timestamptz,
  created_by  uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint posts_posted_at check ((status = 'posted') = (posted_at is not null))
);

create index posts_channel_date on public.posts (channel_id, post_on);

create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- A newsletter issue ("October issue", sends Fri Oct 30).
create table public.newsletter_issues (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 200),   -- "BTX news, October 2026"
  send_on    date,
  intro      text check (char_length(intro) <= 2000),
  owner_id   uuid references public.staff_profiles (user_id) on delete set null,
  status     text not null default 'drafting' check (status in ('drafting', 'scheduled', 'sent')),
  sent_at    timestamptz,
  created_by uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_issues_sent_at check ((status = 'sent') = (sent_at is not null))
);

create trigger newsletter_issues_touch before update on public.newsletter_issues
  for each row execute function public.touch_updated_at();

-- The sections of an issue. They are the issue's checklist ("1 of 5 done").
create table public.newsletter_sections (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references public.newsletter_issues (id) on delete cascade,
  position    smallint not null default 0,
  title       text not null check (char_length(title) between 1 and 200),
  blurb       text check (char_length(blurb) <= 500),        -- one line shown in the email preview
  body        text check (char_length(body) <= 20000),
  owner_id    uuid references public.staff_profiles (user_id) on delete set null,
  status      text not null default 'not_started' check (status in ('not_started', 'writing', 'done')),
  waits_until date,                                         -- "Waits for Fri Oct 23"
  waits_note  text check (char_length(waits_note) <= 200),  -- "Can be written once the winner is announced"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index newsletter_sections_issue on public.newsletter_sections (issue_id, position);

create trigger newsletter_sections_touch before update on public.newsletter_sections
  for each row execute function public.touch_updated_at();

-- Grants pipeline: Researching -> Writing -> Submitted -> Decided (won/declined).
create table public.grants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 200),
  funder          text check (char_length(funder) <= 200),     -- null = [Funder]
  amount_cents    bigint check (amount_cents >= 0),
  amount_is_up_to boolean not null default false,               -- "up to $10,000"
  stage           text not null default 'researching'
                    check (stage in ('researching', 'writing', 'submitted', 'decided')),
  outcome         text check (outcome in ('won', 'declined')),
  deadline_on     date,
  date_note       text check (char_length(date_note) <= 120),  -- "Opens in January"
  next_step       text check (char_length(next_step) <= 300),  -- "Next: follow up Mon Oct 12"
  owner_id        uuid references public.staff_profiles (user_id) on delete set null,
  submitted_on    date,
  decided_on      date,
  created_by      uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint grants_outcome_when_decided check ((stage = 'decided') = (outcome is not null))
);

create index grants_stage on public.grants (stage);

create trigger grants_touch before update on public.grants
  for each row execute function public.touch_updated_at();

-- Calendar events entered in the app ("Add event"): meetings, planning calls,
-- the selection meeting, deadlines. Interviews, task due dates, posts and
-- cycle dates come from their own tables; the Calendar screen merges them.
create table public.calendar_events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 200),
  kind       text not null default 'event'
               check (kind in ('event', 'meeting', 'selection_meeting', 'planning_call', 'deadline')),
  area       text references public.areas (slug) on delete set null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  all_day    boolean not null default false,
  location   text check (char_length(location) <= 200),
  video_url  text check (char_length(video_url) <= 500 and video_url ~ '^https://'),
  cycle_id   uuid references public.cycles (id) on delete cascade,     -- selection meeting
  program_id uuid references public.programs (id) on delete set null,  -- "Cert call 7:00"
  owner_id   uuid references public.staff_profiles (user_id) on delete set null,
  created_by uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_in_order check (ends_at is null or ends_at >= starts_at),
  constraint calendar_events_selection_has_cycle check (kind <> 'selection_meeting' or cycle_id is not null)
);

create index calendar_events_starts on public.calendar_events (starts_at);
create index calendar_events_cycle on public.calendar_events (cycle_id);

create trigger calendar_events_touch before update on public.calendar_events
  for each row execute function public.touch_updated_at();

-- A checklist ("Cycle checklist", "Q4 budget", "Setup checklist", "Year-end
-- giving", "Getting started with grants", "Where it stands", "Post
-- checklist", the selection meeting agenda). Its steps are tasks
-- (tasks.checklist_id), so every step also shows on Tasks. At most one
-- owning record is set; none means a free-standing checklist on its area page.
create table public.checklists (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 1 and 200),
  area           text not null references public.areas (slug) on delete restrict,
  cycle_id       uuid references public.cycles (id) on delete cascade,
  program_id     uuid references public.programs (id) on delete cascade,
  budget_plan_id uuid references public.budget_quarter_plans (id) on delete cascade,
  post_id        uuid references public.posts (id) on delete cascade,
  event_id       uuid references public.calendar_events (id) on delete cascade,  -- meeting agenda
  position       smallint not null default 0,
  created_by     uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint checklists_one_owner check (
    num_nonnulls(cycle_id, program_id, budget_plan_id, post_id, event_id) <= 1)
);

create index checklists_cycle on public.checklists (cycle_id);
create index checklists_program on public.checklists (program_id);
create index checklists_budget_plan on public.checklists (budget_plan_id);
create index checklists_post on public.checklists (post_id);
create index checklists_event on public.checklists (event_id);

create trigger checklists_touch before update on public.checklists
  for each row execute function public.touch_updated_at();

-- Plan milestones by year (the old "Program planning" sheet). The legacy
-- 2021 and 2026 plan is imported here in section k. `archived` hides a
-- milestone (and its tasks) from the screens without deleting it.
create table public.plan_milestones (
  id         uuid primary key default gen_random_uuid(),
  plan_year  smallint not null check (plan_year between 2000 and 2100),
  code       text check (code ~ '^MS-[0-9]{3}$'),           -- 'MS-001' (2026 plan only)
  name       text not null check (char_length(name) between 1 and 200),
  area       text not null references public.areas (slug) on delete restrict,
  program_id uuid references public.programs (id) on delete set null,
  due_on     date,
  done       boolean not null default false,
  archived   boolean not null default false,
  position   integer not null default 0,
  legacy_id  uuid unique,                                   -- legacy.program_plan_milestones.id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_milestones_unique_code unique (plan_year, code)
);

create index plan_milestones_year on public.plan_milestones (plan_year, position);
create index plan_milestones_program on public.plan_milestones (program_id);

create trigger plan_milestones_touch before update on public.plan_milestones
  for each row execute function public.touch_updated_at();

-- Tasks: everything on the Tasks tab and every checklist step. Owners are in
-- task_assignees; a step owned by a group ("BTX" bot, "Board", "All board
-- members", "4 pairs") sets assignee_group instead.
create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 1 and 300),
  type           text not null default 'task' references public.task_types (code) on delete restrict,
  area           text not null references public.areas (slug) on delete restrict,
  status         text not null default 'open'
                   check (status in ('open', 'in_progress', 'done', 'declined')),
  note           text check (char_length(note) <= 500),     -- second line: "Planning call 7:00 PM"
  details        text check (char_length(details) <= 5000), -- the expanded text on an approval
  due_on         date,
  assignee_group text check (assignee_group in ('bot', 'board', 'all_board', 'interview_pairs')),
  -- What the task belongs to (the "· Fall 2026 cycle" / "· Q4 budget" line).
  checklist_id   uuid references public.checklists (id) on delete cascade,
  position       integer not null default 0,              -- order inside its checklist
  cycle_id       uuid references public.cycles (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  milestone_id   uuid references public.plan_milestones (id) on delete cascade,
  grant_id       uuid references public.grants (id) on delete set null,
  deliverable    text check (char_length(deliverable) <= 300), -- legacy plan's deliverable column
  archived       boolean not null default false,
  completed_at   timestamptz,
  completed_by   uuid references public.staff_profiles (user_id) on delete set null,
  created_by     uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  legacy_id      uuid unique,                                -- legacy.program_plan_tasks.id
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tasks_done_has_time check ((status = 'done') = (completed_at is not null))
);

create index tasks_open_due on public.tasks (due_on) where status in ('open', 'in_progress') and not archived;
create index tasks_area on public.tasks (area);
create index tasks_checklist on public.tasks (checklist_id, position);
create index tasks_cycle on public.tasks (cycle_id);
create index tasks_application on public.tasks (application_id);
create index tasks_milestone on public.tasks (milestone_id);
create index tasks_grant on public.tasks (grant_id);

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Who owns a task (one or more people).
create table public.task_assignees (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references public.staff_profiles (user_id) on delete cascade,
  assigned_by uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignees_user on public.task_assignees (user_id);

-- Comments on a task ("Comments 1": Kelsey Davis, 8:02 AM).
create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create index task_comments_task on public.task_comments (task_id, created_at);

-- -----------------------------------------------------------------------------
-- h. Scholarships, staff side (before money: spending links to awards)
-- -----------------------------------------------------------------------------

-- The rubric for a cycle: six criteria with weights (20, 20, 20, 20, 10, 10).
-- Picks are 1 Not evident .. 5 Exceptional.
create table public.rubric_criteria (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references public.cycles (id) on delete cascade,
  key        text not null check (key ~ '^[a-z_]{2,40}$'),     -- 'community', used in scores.criteria
  name       text not null check (char_length(name) between 1 and 120),
  weight     smallint not null check (weight between 1 and 100),
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint rubric_criteria_unique_key unique (cycle_id, key)
);

-- Board availability: which interview slots a board member can take
-- ("Your availability, Oct 5-9"). One row = "I'm free for this slot".
create table public.board_availability (
  slot_id    uuid not null references public.interview_slots (id) on delete cascade,
  user_id    uuid not null references public.staff_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, user_id)
);

create index board_availability_user on public.board_availability (user_id);

-- The two board members who interview in a slot, and the video link.
-- Written by an admin (pairing / "Re-run pairing" / "Add the video links").
create table public.interview_pairings (
  slot_id       uuid primary key references public.interview_slots (id) on delete cascade,
  interviewer_a uuid not null references public.staff_profiles (user_id) on delete restrict,
  interviewer_b uuid not null references public.staff_profiles (user_id) on delete restrict,
  video_url     text check (char_length(video_url) <= 500 and video_url ~ '^https://'),
  paired_by     uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  paired_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint interview_pairings_two_people check (interviewer_a <> interviewer_b)
);

create index interview_pairings_a on public.interview_pairings (interviewer_a);
create index interview_pairings_b on public.interview_pairings (interviewer_b);

create trigger interview_pairings_touch before update on public.interview_pairings
  for each row execute function public.touch_updated_at();

-- The shared interview summary and quotes for an application ("Interview
-- notes"). quotes: [{"criterion": "community", "at": "8:12", "text": "..."}].
create table public.interview_summaries (
  application_id   uuid primary key references public.applications (id) on delete cascade,
  summary          text check (char_length(summary) <= 4000),
  quotes           jsonb not null default '[]'::jsonb check (jsonb_typeof(quotes) = 'array'),
  duration_minutes smallint check (duration_minutes between 1 and 300),   -- "24 min"
  written_by       uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger interview_summaries_touch before update on public.interview_summaries
  for each row execute function public.touch_updated_at();

-- One score per interviewer per application. criteria = {"<rubric key>": 1..5}.
-- weighted_score and published_at are filled by a trigger (section i).
-- Scores stay private until both interviewers publish (see the policies).
create table public.scores (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  scorer_id      uuid not null default auth.uid() references public.staff_profiles (user_id) on delete restrict,
  criteria       jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  criteria_count smallint not null default 0,          -- how many criteria are picked (trigger)
  weighted_score numeric(4, 2),                         -- 1.00 .. 5.00 over picked criteria (trigger)
  published      boolean not null default false,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint scores_one_per_scorer unique (application_id, scorer_id),
  constraint scores_published_at check (published = (published_at is not null))
);

create index scores_scorer on public.scores (scorer_id);

create trigger scores_touch before update on public.scores
  for each row execute function public.touch_updated_at();

-- "Your private notes": only the writer ever sees them.
create table public.score_private_notes (
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.staff_profiles (user_id) on delete cascade,
  note           text not null check (char_length(note) <= 10000),
  updated_at     timestamptz not null default now(),
  primary key (application_id, user_id)
);

create trigger score_private_notes_touch before update on public.score_private_notes
  for each row execute function public.touch_updated_at();

-- An award: the selection decision for this cycle (main award, or an extra
-- award opened at the selection meeting), or a past award entered by hand
-- for history ("All past 14", Goals' "Scholars funded, by award cycle").
create table public.scholarship_awards (
  id                uuid primary key default gen_random_uuid(),
  cycle_id          uuid references public.cycles (id) on delete restrict,
  application_id    uuid unique references public.applications (id) on delete restrict,
  award_name        text not null check (char_length(award_name) between 1 and 120),  -- 'Legacy', 'Empowerment'
  amount_cents      bigint check (amount_cents >= 0),
  kind              text not null default 'main' check (kind in ('main', 'extra', 'past')),
  decided_at        timestamptz not null default now(),
  decided_by        uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  decision_note     text check (char_length(decision_note) <= 2000),   -- "Top score, no tie" / tie vote
  -- Past awards only: which term, and a label instead of an application.
  past_term         text check (char_length(past_term) <= 40),          -- 'Spring 2025'
  past_term_starts  date,                                                -- for ordering the chart
  awardee_label     text check (char_length(awardee_label) <= 120),
  -- Awardee follow-up (the table on Awardees).
  letter_sent_at    timestamptz,
  accepted_at       timestamptz,
  payment_due_on    date,                                                -- "Scheduled Nov 6"
  paid_on           date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A current award has a cycle and an application; a past one has neither, but a term.
  constraint scholarship_awards_current_or_past check (
    (kind in ('main', 'extra') and cycle_id is not null and application_id is not null and past_term is null)
    or (kind = 'past' and application_id is null and past_term is not null))
);

create index scholarship_awards_cycle on public.scholarship_awards (cycle_id);

create trigger scholarship_awards_touch before update on public.scholarship_awards
  for each row execute function public.touch_updated_at();

-- The awardee checklist: five fixed steps per current award, created by a
-- trigger when the award is recorded (section i).
create table public.award_steps (
  award_id         uuid not null references public.scholarship_awards (id) on delete cascade,
  step             smallint not null check (step between 1 and 5),
  kind             text not null check (kind in ('letter_sent', 'acceptance_back', 'payment_details',
                                                 'funds_sent', 'thank_you_and_photo')),
  due_on           date,
  done_at          timestamptz,
  done_by          uuid references public.staff_profiles (user_id) on delete set null,
  note             text check (char_length(note) <= 500),
  reminder_sent_at timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (award_id, step),
  constraint award_steps_kind_matches_step check (
    (step, kind) in ((1, 'letter_sent'), (2, 'acceptance_back'), (3, 'payment_details'),
                     (4, 'funds_sent'), (5, 'thank_you_and_photo')))
);

create trigger award_steps_touch before update on public.award_steps
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- f. Programs (detail tables)
-- -----------------------------------------------------------------------------

-- "Certification ideas" (FE exam, AWS Cloud Practitioner, ...).
create table public.certification_ideas (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references public.programs (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 200),
  suggested_by uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  decision     text not null default 'not_decided' check (decision in ('not_decided', 'chosen', 'dropped')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger certification_ideas_touch before update on public.certification_ideas
  for each row execute function public.touch_updated_at();

-- One-off sponsorships ("NSBE convention, 5 students, $2,750, Spring 2026").
-- Logged with public.log_sponsorship(), which also records the spending.
create table public.sponsorships (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid references public.programs (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 200),
  kind         text not null default 'conference' check (kind in ('conference', 'travel', 'fee', 'other')),
  students     integer check (students >= 0),
  amount_cents bigint not null check (amount_cents >= 0),
  when_label   text check (char_length(when_label) <= 60),     -- "Spring 2026"
  occurred_on  date,
  status       text not null default 'done' check (status in ('planned', 'done', 'cancelled')),
  created_by   uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger sponsorships_touch before update on public.sponsorships
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- e. Money (detail tables)
-- -----------------------------------------------------------------------------

-- Donors (personal data: admin and board only).
create table public.donors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 200),
  email      text check (char_length(email) <= 254),
  kind       text not null default 'individual' check (kind in ('individual', 'company', 'foundation', 'other')),
  notes      text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger donors_touch before update on public.donors
  for each row execute function public.touch_updated_at();

-- Gifts ("Log a gift"). Totals, sources, average gift, donor counts, new and
-- monthly donors are all counted from these rows.
create table public.gifts (
  id           uuid primary key default gen_random_uuid(),
  donor_id     uuid references public.donors (id) on delete set null,   -- null = anonymous
  gift_on      date not null,
  amount_cents bigint not null check (amount_cents > 0),
  source       text not null check (source in ('individual', 'corporate', 'event', 'grant')),
  monthly      boolean not null default false,                          -- "Give monthly"
  grant_id     uuid references public.grants (id) on delete set null,
  note         text check (char_length(note) <= 500),
  logged_by    uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint gifts_grant_source check (grant_id is null or source = 'grant')
);

create index gifts_date on public.gifts (gift_on);
create index gifts_donor on public.gifts (donor_id);
create index gifts_grant on public.gifts (grant_id);

create trigger gifts_touch before update on public.gifts
  for each row execute function public.touch_updated_at();

-- Spending ("Log spending"; also written by log_sponsorship and
-- mark_award_funds_sent, so money is logged once).
create table public.spending_entries (
  id             uuid primary key default gen_random_uuid(),
  spent_on       date not null,
  description    text not null check (char_length(description) between 1 and 300),
  category_id    uuid not null references public.budget_categories (id) on delete restrict,
  amount_cents   bigint not null check (amount_cents > 0),
  sponsorship_id uuid unique references public.sponsorships (id) on delete cascade,
  award_id       uuid unique references public.scholarship_awards (id) on delete restrict,
  program_id     uuid references public.programs (id) on delete set null,   -- e.g. an exam fee
  logged_by      uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index spending_entries_date on public.spending_entries (spent_on);
create index spending_entries_category on public.spending_entries (category_id);
create index spending_entries_program on public.spending_entries (program_id);

create trigger spending_entries_touch before update on public.spending_entries
  for each row execute function public.touch_updated_at();

-- "Funds on hand $18,600, updated Fri Oct 2 by Dania Morris". Each update is
-- a new row; the screen shows the latest.
create table public.funds_snapshots (
  id           uuid primary key default gen_random_uuid(),
  amount_cents bigint not null check (amount_cents >= 0),
  as_of        date not null,
  recorded_by  uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at   timestamptz not null default now()
);

create index funds_snapshots_as_of on public.funds_snapshots (as_of desc, created_at desc);

-- -----------------------------------------------------------------------------
-- c. Goals and year-over-year figures
-- -----------------------------------------------------------------------------

-- A year's goals (the four cards on Goals). The value is counted by the app
-- from records, per `metric`; `manual_value` is for a goal with no records.
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  year          smallint not null check (year between 2020 and 2100),
  title         text not null check (char_length(title) between 1 and 200),   -- "Raise $15,000"
  metric        text not null check (metric in ('money_raised', 'budget_spent', 'checklist',
                                                'applicants_scored', 'manual')),
  target_cents  bigint check (target_cents >= 0),
  target_count  integer check (target_count >= 0),
  checklist_id  uuid references public.checklists (id) on delete set null,   -- metric 'checklist'
  cycle_id      uuid references public.cycles (id) on delete set null,       -- metric 'applicants_scored'
  manual_value  numeric check (manual_value >= 0),
  status        text not null default 'in_progress'
                  check (status in ('in_planning', 'in_progress', 'on_track', 'at_risk', 'met', 'missed')),
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index goals_year on public.goals (year, position);

create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();

-- "Year over year: past years are entered once, by hand" (money raised,
-- applicants). One value per year per metric.
create table public.year_figures (
  year       smallint not null check (year between 2000 and 2100),
  metric     text not null check (metric in ('money_raised_cents', 'applicants', 'scholars_funded',
                                             'graduation_rate_pct', 'internships', 'students_reached')),
  value      numeric not null check (value >= 0),
  entered_by uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (year, metric)
);

create trigger year_figures_touch before update on public.year_figures
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- d. Board chat
-- -----------------------------------------------------------------------------

-- A channel: one per area (the "All areas" view is all area channels
-- together), or a direct conversation between two people.
create table public.chat_channels (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('area', 'direct')),
  area       text unique references public.areas (slug) on delete cascade,
  direct_key text unique,                     -- '<smaller uuid>:<larger uuid>' for direct channels
  created_at timestamptz not null default now(),
  constraint chat_channels_shape check (
    (kind = 'area' and area is not null and direct_key is null)
    or (kind = 'direct' and area is null and direct_key is not null))
);

insert into public.chat_channels (kind, area)
select 'area', a.slug from public.areas a;

-- Members of direct channels (area channels are open to admin + board).
create table public.chat_channel_members (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id    uuid not null references public.staff_profiles (user_id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index chat_channel_members_user on public.chat_channel_members (user_id);

-- Messages. Bot posts ("BTX") have is_bot = true and no author; only the
-- service role writes them. A bot post may point at a task ("Open task").
create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  author_id  uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  is_bot     boolean not null default false,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  task_id    uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  constraint chat_messages_bot_has_no_author check (not is_bot or author_id is null)
);

create index chat_messages_channel_time on public.chat_messages (channel_id, created_at);

-- Read markers: the last time each person read each channel (unread counts).
create table public.chat_read_markers (
  channel_id   uuid not null references public.chat_channels (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.staff_profiles (user_id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- Pinned items ("Interview schedule, Oct 5-9", "Q4 budget"). channel_id null
-- = pinned on "All areas".
create table public.chat_pins (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid references public.chat_channels (id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 120),
  task_id      uuid references public.tasks (id) on delete cascade,
  checklist_id uuid references public.checklists (id) on delete cascade,
  event_id     uuid references public.calendar_events (id) on delete cascade,
  url          text check (char_length(url) <= 500 and url ~ '^https://'),
  pinned_by    uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  constraint chat_pins_points_somewhere check (num_nonnulls(task_id, checklist_id, event_id, url) = 1)
);

-- -----------------------------------------------------------------------------
-- i. Functions, triggers and views
-- -----------------------------------------------------------------------------

-- Before a score is written: checks every pick is a known rubric criterion
-- for the application's cycle with a value 1..5, counts the picks, works out
-- the weighted score over the picked criteria, requires all criteria before
-- publishing, and stamps published_at the moment it is published.
-- Runs as the caller (no security definer): reads applications and
-- rubric_criteria through the caller's own access rules.
create function public.scores_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cycle   uuid;
  v_bad     text;
  v_needed  integer;
  v_picked  integer;
  v_wsum    numeric;
  v_weights numeric;
begin
  select a.cycle_id into v_cycle from public.applications a where a.id = new.application_id;
  if v_cycle is null then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  -- Keys that are not a criterion of this cycle's rubric.
  select string_agg(k.key, ',') into v_bad
  from jsonb_object_keys(new.criteria) as k(key)
  where not exists (select 1 from public.rubric_criteria r
                    where r.cycle_id = v_cycle and r.key = k.key);
  if v_bad is not null then
    raise exception 'unknown_criteria:%', v_bad using errcode = '22023';
  end if;

  -- Every pick must be a whole number 1 to 5.
  if exists (select 1 from jsonb_each(new.criteria) e
             where jsonb_typeof(e.value) <> 'number' or e.value::text !~ '^[1-5]$') then
    raise exception 'invalid_pick' using errcode = '22023';
  end if;

  select count(*),
         count(*) filter (where new.criteria ? r.key),
         sum(r.weight * (new.criteria ->> r.key)::numeric) filter (where new.criteria ? r.key),
         sum(r.weight) filter (where new.criteria ? r.key)
    into v_needed, v_picked, v_wsum, v_weights
  from public.rubric_criteria r
  where r.cycle_id = v_cycle;

  new.criteria_count := v_picked;
  new.weighted_score := case when v_weights > 0 then round(v_wsum / v_weights, 2) end;

  -- "Publishing needs all six": every criterion picked, and the rubric exists.
  if new.published and (v_needed = 0 or v_picked < v_needed) then
    raise exception 'publish_needs_all_criteria' using errcode = 'P0001';
  end if;

  -- Stamp the publish time once; un-publishing (service role only) clears it.
  if new.published and (tg_op = 'INSERT' or not old.published) then
    new.published_at := now();
  elsif not new.published then
    new.published_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.scores_check() from public, anon, authenticated;

create trigger scores_check before insert or update on public.scores
  for each row execute function public.scores_check();

-- True once at least two scores for the application are published (both
-- interviewers). Security definer because the scores policy needs to count
-- scores the caller can't see yet; it returns only true/false, no values.
create function public.application_scores_released(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 2
  from public.scores s
  where s.application_id = p_application_id and s.published;
$$;

revoke all on function public.application_scores_released(uuid) from public, anon;
grant execute on function public.application_scores_released(uuid) to authenticated, service_role;

-- Scoring progress for a cycle, without any score values: who has a score
-- on which application, how many criteria are picked, and whether it is
-- published. Powers "Not started, Chariah published" and "Waiting on Marcus
-- Davis". Admin and board only (raises for anyone else).
create function public.score_progress(p_cycle_id uuid)
returns table (application_id uuid, scorer_id uuid, criteria_count smallint,
               published boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Role check: only admin and board see everyone's progress.
  if coalesce(public.app_role() in ('admin', 'board'), false) is not true then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select s.application_id, s.scorer_id, s.criteria_count, s.published, s.updated_at
    from public.scores s
    join public.applications a on a.id = s.application_id
    where a.cycle_id = p_cycle_id;
end;
$$;

revoke all on function public.score_progress(uuid) from public, anon;
grant execute on function public.score_progress(uuid) to authenticated, service_role;

-- The People and roles list: each staff member's role (from app_metadata)
-- and last sign-in. Security definer because auth.users is not readable by
-- signed-in users. Staff only (raises for anyone else). Read-only: roles are
-- changed with the service key (Admin API), never through SQL from the app.
create function public.staff_directory()
returns table (user_id uuid, role text, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Role check: applicants and signed-out callers get nothing.
  if not public.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select u.id, u.raw_app_meta_data ->> 'role', u.last_sign_in_at
    from auth.users u
    join public.staff_profiles p on p.user_id = u.id
    where u.raw_app_meta_data ->> 'role' in ('admin', 'board', 'reviewer');
end;
$$;

revoke all on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated, service_role;

-- True when the caller is a member of the given direct chat channel.
-- Security definer so the members table's own policy can call it without
-- looping back into itself.
create function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_channel_members m
    where m.channel_id = p_channel_id and m.user_id = auth.uid());
$$;

revoke all on function public.is_channel_member(uuid) from public, anon;
grant execute on function public.is_channel_member(uuid) to authenticated, service_role;

-- Opens (or returns) the direct conversation between the caller and another
-- admin or board member. Both must be admin or board and have a profile.
-- Security definer: it reads the other person's role from auth.users and
-- writes the channel and its two members, which nobody can insert directly.
create function public.open_direct_channel(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := auth.uid();
  v_key     text;
  v_channel uuid;
begin
  -- Role check on the caller.
  if coalesce(public.app_role() in ('admin', 'board'), false) is not true then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'invalid_person' using errcode = '22023';
  end if;
  -- Role check on the other person (server-written app_metadata only).
  if not exists (
    select 1 from auth.users u
    join public.staff_profiles p on p.user_id = u.id
    where u.id = p_other and u.raw_app_meta_data ->> 'role' in ('admin', 'board')) then
    raise exception 'invalid_person' using errcode = '22023';
  end if;
  if not exists (select 1 from public.staff_profiles p where p.user_id = v_me) then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;

  -- One channel per pair, whatever order they are named in.
  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);

  insert into public.chat_channels (kind, direct_key) values ('direct', v_key)
  on conflict (direct_key) do nothing
  returning id into v_channel;

  if v_channel is null then
    select c.id into v_channel from public.chat_channels c where c.direct_key = v_key;
  else
    insert into public.chat_channel_members (channel_id, user_id)
    values (v_channel, v_me), (v_channel, p_other);
  end if;

  return v_channel;
end;
$$;

revoke all on function public.open_direct_channel(uuid) from public, anon;
grant execute on function public.open_direct_channel(uuid) to authenticated, service_role;

-- When a quarter plan is approved or declined, records who decided and when;
-- moving it back to draft / awaiting approval clears that. Submitting stamps
-- who sent it for approval.
create function public.budget_plan_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('approved', 'declined') then
      new.decided_by := auth.uid();
      new.decided_at := now();
    else
      new.decided_by := null;
      new.decided_at := null;
    end if;
    if new.status = 'awaiting_approval' then
      new.submitted_by := auth.uid();
      new.submitted_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.budget_plan_stamp() from public, anon, authenticated;

create trigger budget_quarter_plans_stamp before update on public.budget_quarter_plans
  for each row execute function public.budget_plan_stamp();

-- Keeps completed_at / completed_by in step with a task's status, so ticking
-- the circle is a plain status update.
create function public.tasks_stamp_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid());
  elsif new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.tasks_stamp_done() from public, anon, authenticated;

create trigger tasks_stamp_done before insert or update on public.tasks
  for each row execute function public.tasks_stamp_done();

-- After a current award is recorded, creates its five awardee steps.
-- Runs as the caller, so the caller's access rules on award_steps apply.
create function public.award_steps_create()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind in ('main', 'extra') then
    insert into public.award_steps (award_id, step, kind) values
      (new.id, 1, 'letter_sent'),
      (new.id, 2, 'acceptance_back'),
      (new.id, 3, 'payment_details'),
      (new.id, 4, 'funds_sent'),
      (new.id, 5, 'thank_you_and_photo');
  end if;
  return null;
end;
$$;

revoke all on function public.award_steps_create() from public, anon, authenticated;

create trigger scholarship_awards_steps after insert on public.scholarship_awards
  for each row execute function public.award_steps_create();

-- "Log a sponsorship": saves the sponsorship and records the same amount as
-- spending under that year's Sponsorships category, in one step. Runs as the
-- caller (admin or board, by the tables' rules). Returns the sponsorship id.
-- Errors: no_sponsorship_category:<year>.
create function public.log_sponsorship(
  p_title text, p_kind text, p_students integer, p_amount_cents bigint,
  p_when_label text, p_spent_on date)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_category uuid;
  v_program  uuid;
  v_id       uuid;
begin
  select c.id into v_category
  from public.budget_categories c
  where c.year = extract(year from p_spent_on)::smallint and c.kind = 'sponsorships';
  if v_category is null then
    raise exception 'no_sponsorship_category:%', extract(year from p_spent_on) using errcode = 'P0002';
  end if;

  select p.id into v_program from public.programs p where p.slug = 'sponsorships';

  insert into public.sponsorships (program_id, title, kind, students, amount_cents, when_label, occurred_on)
  values (v_program, p_title, coalesce(p_kind, 'conference'), p_students, p_amount_cents, p_when_label, p_spent_on)
  returning id into v_id;

  insert into public.spending_entries (spent_on, description, category_id, amount_cents, sponsorship_id, program_id)
  values (p_spent_on, p_title, v_category, p_amount_cents, v_id, v_program);

  return v_id;
end;
$$;

revoke all on function public.log_sponsorship(text, text, integer, bigint, text, date) from public, anon;
grant execute on function public.log_sponsorship(text, text, integer, bigint, text, date)
  to authenticated, service_role;

-- "Funds sent": ticks the award's step 4, sets paid_on, and records the
-- award amount as spending under that year's Scholarships category, in one
-- step (so it is logged once). Runs as the caller.
-- Errors: award_not_found, already_paid, no_amount, no_scholarship_category:<year>.
create function public.mark_award_funds_sent(p_award_id uuid, p_paid_on date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_award    public.scholarship_awards%rowtype;
  v_category uuid;
  v_code     text;
begin
  -- RLS decides whether the caller can see (and so pay) this award.
  select * into v_award from public.scholarship_awards where id = p_award_id for update;
  if not found or v_award.kind = 'past' then
    raise exception 'award_not_found' using errcode = 'P0002';
  end if;
  if v_award.paid_on is not null
     or exists (select 1 from public.spending_entries e where e.award_id = p_award_id) then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  if v_award.amount_cents is null or v_award.amount_cents = 0 then
    raise exception 'no_amount' using errcode = 'P0001';
  end if;

  select c.id into v_category
  from public.budget_categories c
  where c.year = extract(year from p_paid_on)::smallint and c.kind = 'scholarships';
  if v_category is null then
    raise exception 'no_scholarship_category:%', extract(year from p_paid_on) using errcode = 'P0002';
  end if;

  select a.applicant_code into v_code from public.applications a where a.id = v_award.application_id;

  insert into public.spending_entries (spent_on, description, category_id, amount_cents, award_id)
  values (p_paid_on, v_award.award_name || ' award, ' || coalesce(v_code, 'awardee'),
          v_category, v_award.amount_cents, p_award_id);

  update public.scholarship_awards set paid_on = p_paid_on where id = p_award_id;

  update public.award_steps
     set done_at = now(), done_by = auth.uid()
   where award_id = p_award_id and step = 4 and done_at is null;
end;
$$;

revoke all on function public.mark_award_funds_sent(uuid, date) from public, anon;
grant execute on function public.mark_award_funds_sent(uuid, date) to authenticated, service_role;

-- Views (all security_invoker: they show only what the caller's own access
-- rules let them see).

-- Each application's published-score count and combined score (the average
-- of the published weighted scores the caller can see). Before both
-- interviewers publish, other people see nothing here for that application.
create view public.application_score_summary
with (security_invoker = true) as
select s.application_id,
       count(*) filter (where s.published)                         as published_count,
       round(avg(s.weighted_score) filter (where s.published), 2)  as combined_score
from public.scores s
group by s.application_id;

-- Budget by category: budget, spent so far, and the plan for each quarter.
create view public.budget_category_totals
with (security_invoker = true) as
select c.id as category_id,
       c.year,
       c.name,
       c.kind,
       c.position,
       c.budget_cents,
       coalesce((select sum(e.amount_cents) from public.spending_entries e
                 where e.category_id = c.id), 0) as spent_cents,
       (select l.amount_cents from public.budget_quarter_plan_lines l
          join public.budget_quarter_plans p on p.id = l.plan_id
         where l.category_id = c.id and p.quarter = 1) as q1_plan_cents,
       (select l.amount_cents from public.budget_quarter_plan_lines l
          join public.budget_quarter_plans p on p.id = l.plan_id
         where l.category_id = c.id and p.quarter = 2) as q2_plan_cents,
       (select l.amount_cents from public.budget_quarter_plan_lines l
          join public.budget_quarter_plans p on p.id = l.plan_id
         where l.category_id = c.id and p.quarter = 3) as q3_plan_cents,
       (select l.amount_cents from public.budget_quarter_plan_lines l
          join public.budget_quarter_plans p on p.id = l.plan_id
         where l.category_id = c.id and p.quarter = 4) as q4_plan_cents
from public.budget_categories c;

-- Unread messages per channel for the caller (messages by others after the
-- caller's read marker; no marker = everything is unread).
create view public.chat_unread_counts
with (security_invoker = true) as
select c.id as channel_id,
       c.kind,
       c.area,
       (select count(*) from public.chat_messages m
        where m.channel_id = c.id
          and m.author_id is distinct from auth.uid()
          and m.created_at > coalesce(
                (select r.last_read_at from public.chat_read_markers r
                 where r.channel_id = c.id and r.user_id = auth.uid()),
                '-infinity'::timestamptz)) as unread
from public.chat_channels c;

-- -----------------------------------------------------------------------------
-- j. Access: grants, RLS, policies
-- -----------------------------------------------------------------------------

-- Grants: nothing for anon or public; signed-in users get table privileges
-- and RLS decides the rows; the service role gets everything.
do $$
declare
  t text;
begin
  foreach t in array array[
    'staff_profiles', 'areas', 'task_types', 'programs', 'budget_years', 'budget_categories',
    'budget_quarter_plans', 'budget_quarter_plan_lines', 'outreach_channels', 'posts',
    'newsletter_issues', 'newsletter_sections', 'grants', 'calendar_events', 'checklists',
    'plan_milestones', 'tasks', 'task_assignees', 'task_comments', 'rubric_criteria',
    'board_availability', 'interview_pairings', 'interview_summaries', 'scores',
    'score_private_notes', 'scholarship_awards', 'award_steps', 'certification_ideas',
    'sponsorships', 'donors', 'gifts', 'spending_entries', 'funds_snapshots', 'goals',
    'year_figures', 'chat_channels', 'chat_channel_members', 'chat_messages',
    'chat_read_markers', 'chat_pins'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- Nobody but the service role writes these directly: channels and members
-- are made by open_direct_channel(); scores' computed columns by the trigger.
revoke insert, update, delete on public.chat_channel_members from authenticated;

-- Views: signed-in users only.
revoke all on public.application_score_summary, public.budget_category_totals,
  public.chat_unread_counts from public, anon, authenticated;
grant select on public.application_score_summary, public.budget_category_totals,
  public.chat_unread_counts to authenticated, service_role;

-- "Team" tables: admin and board read and write everything; reviewers and
-- applicants nothing. One FOR ALL policy each, reading the role only through
-- public.app_role().
do $$
declare
  t text;
begin
  foreach t in array array[
    'programs', 'budget_years', 'budget_categories', 'budget_quarter_plans',
    'budget_quarter_plan_lines', 'outreach_channels', 'posts', 'newsletter_issues',
    'newsletter_sections', 'grants', 'calendar_events', 'checklists', 'plan_milestones',
    'tasks', 'task_assignees', 'scholarship_awards', 'award_steps', 'certification_ideas',
    'sponsorships', 'donors', 'gifts', 'spending_entries', 'funds_snapshots', 'goals',
    'year_figures', 'chat_pins'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using ((select public.app_role()) in (''admin'', ''board'')) '
      'with check ((select public.app_role()) in (''admin'', ''board''))',
      t || '_team_all', t);
  end loop;
end;
$$;

-- ---- staff_profiles --------------------------------------------------------
-- Every staff member sees the staff list (names, titles, initials).
create policy staff_profiles_select_staff on public.staff_profiles
  for select to authenticated
  using ((select public.is_staff()));

-- A staff member creates their own profile on first sign-in; admins create anyone's.
create policy staff_profiles_insert_self_or_admin on public.staff_profiles
  for insert to authenticated
  with check (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

-- A staff member edits their own profile; admins edit anyone's.
create policy staff_profiles_update_self_or_admin on public.staff_profiles
  for update to authenticated
  using ((select public.is_staff()) and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'))
  with check ((select public.is_staff()) and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

-- Only admins remove a profile.
create policy staff_profiles_delete_admin on public.staff_profiles
  for delete to authenticated
  using ((select public.app_role()) = 'admin');

-- ---- areas, task_types, rubric_criteria: staff read, admins write -----------
create policy areas_select_staff on public.areas
  for select to authenticated using ((select public.is_staff()));
create policy areas_write_admin on public.areas
  for all to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

create policy task_types_select_staff on public.task_types
  for select to authenticated using ((select public.is_staff()));
create policy task_types_write_admin on public.task_types
  for all to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

-- Reviewers read the rubric too (they score with it).
create policy rubric_criteria_select_staff on public.rubric_criteria
  for select to authenticated using ((select public.is_staff()));
create policy rubric_criteria_write_admin on public.rubric_criteria
  for all to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

-- ---- tasks: reviewers see and update only tasks assigned to them -----------
-- (Admin and board have tasks_team_all above; policies are OR-ed.)
create policy tasks_select_reviewer_assigned on public.tasks
  for select to authenticated
  using (
    (select public.app_role()) = 'reviewer'
    and exists (select 1 from public.task_assignees ta
                where ta.task_id = tasks.id and ta.user_id = (select auth.uid())));

create policy tasks_update_reviewer_assigned on public.tasks
  for update to authenticated
  using (
    (select public.app_role()) = 'reviewer'
    and exists (select 1 from public.task_assignees ta
                where ta.task_id = tasks.id and ta.user_id = (select auth.uid())))
  with check (
    (select public.app_role()) = 'reviewer'
    and exists (select 1 from public.task_assignees ta
                where ta.task_id = tasks.id and ta.user_id = (select auth.uid())));

-- A reviewer sees their own assignment rows (so the policy above can find them).
create policy task_assignees_select_own on public.task_assignees
  for select to authenticated
  using ((select public.is_staff()) and user_id = (select auth.uid()));

-- ---- task_comments ---------------------------------------------------------
-- Admin and board read all comments and add their own; authors edit or
-- delete their own.
create policy task_comments_select_team on public.task_comments
  for select to authenticated
  using ((select public.app_role()) in ('admin', 'board'));

create policy task_comments_insert_own on public.task_comments
  for insert to authenticated
  with check ((select public.app_role()) in ('admin', 'board') and author_id = (select auth.uid()));

create policy task_comments_update_own on public.task_comments
  for update to authenticated
  using ((select public.app_role()) in ('admin', 'board') and author_id = (select auth.uid()))
  with check ((select public.app_role()) in ('admin', 'board') and author_id = (select auth.uid()));

create policy task_comments_delete_own on public.task_comments
  for delete to authenticated
  using ((select public.app_role()) in ('admin', 'board') and author_id = (select auth.uid()));

-- ---- board_availability ----------------------------------------------------
-- Admin and board see everyone's availability (pairing needs it).
create policy board_availability_select_team on public.board_availability
  for select to authenticated
  using ((select public.app_role()) in ('admin', 'board'));

-- A board member (or admin) adds or removes their own times; admins anyone's.
create policy board_availability_insert_own on public.board_availability
  for insert to authenticated
  with check (
    (select public.app_role()) in ('admin', 'board')
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

create policy board_availability_delete_own on public.board_availability
  for delete to authenticated
  using (
    (select public.app_role()) in ('admin', 'board')
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

-- ---- interview_pairings ----------------------------------------------------
-- Admin and board see all pairs; anyone (e.g. a reviewer) sees the pairs they are in.
create policy interview_pairings_select on public.interview_pairings
  for select to authenticated
  using (
    (select public.app_role()) in ('admin', 'board')
    or ((select public.is_staff())
        and (select auth.uid()) in (interviewer_a, interviewer_b)));

-- "Admins only: Re-run pairing" and adding video links.
create policy interview_pairings_write_admin on public.interview_pairings
  for all to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

-- ---- interview_summaries ---------------------------------------------------
-- Admin and board read every summary; a reviewer reads summaries of
-- applications they interview (their pairing on the application's active booking).
create policy interview_summaries_select on public.interview_summaries
  for select to authenticated
  using (
    (select public.app_role()) in ('admin', 'board')
    or ((select public.is_staff()) and exists (
          select 1 from public.bookings b
          join public.interview_pairings p on p.slot_id = b.slot_id
          where b.application_id = interview_summaries.application_id
            and b.status = 'active'
            and (select auth.uid()) in (p.interviewer_a, p.interviewer_b))));

-- Admins, or the application's two interviewers, write the summary.
create policy interview_summaries_write on public.interview_summaries
  for all to authenticated
  using (
    (select public.app_role()) = 'admin'
    or ((select public.is_staff()) and exists (
          select 1 from public.bookings b
          join public.interview_pairings p on p.slot_id = b.slot_id
          where b.application_id = interview_summaries.application_id
            and b.status = 'active'
            and (select auth.uid()) in (p.interviewer_a, p.interviewer_b))))
  with check (
    (select public.app_role()) = 'admin'
    or ((select public.is_staff()) and exists (
          select 1 from public.bookings b
          join public.interview_pairings p on p.slot_id = b.slot_id
          where b.application_id = interview_summaries.application_id
            and b.status = 'active'
            and (select auth.uid()) in (p.interviewer_a, p.interviewer_b))));

-- ---- scores ----------------------------------------------------------------
-- A scorer always sees their own score. Admin and board see other people's
-- published scores only once both interviewers have published
-- ("scores stay private until both interviewers publish").
create policy scores_select_own on public.scores
  for select to authenticated
  using ((select public.is_staff()) and scorer_id = (select auth.uid()));

create policy scores_select_released on public.scores
  for select to authenticated
  using (
    (select public.app_role()) in ('admin', 'board')
    and published
    and public.application_scores_released(application_id));

-- A staff member creates their own score, only for an application they
-- interview (they are one of the pair on its active booking).
create policy scores_insert_own_interviewee on public.scores
  for insert to authenticated
  with check (
    (select public.is_staff())
    and scorer_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      join public.interview_pairings p on p.slot_id = b.slot_id
      where b.application_id = scores.application_id
        and b.status = 'active'
        and (select auth.uid()) in (p.interviewer_a, p.interviewer_b)));

-- They edit it while it is a draft; publishing is the last edit (only the
-- service role can un-publish).
create policy scores_update_own_draft on public.scores
  for update to authenticated
  using ((select public.is_staff()) and scorer_id = (select auth.uid()) and not published)
  with check ((select public.is_staff()) and scorer_id = (select auth.uid()));

-- They delete their own draft.
create policy scores_delete_own_draft on public.scores
  for delete to authenticated
  using ((select public.is_staff()) and scorer_id = (select auth.uid()) and not published);

-- ---- score_private_notes: the writer only ----------------------------------
create policy score_private_notes_own on public.score_private_notes
  for all to authenticated
  using ((select public.is_staff()) and user_id = (select auth.uid()))
  with check ((select public.is_staff()) and user_id = (select auth.uid()));

-- ---- chat ------------------------------------------------------------------
-- Admin and board see area channels, and direct channels they are in.
create policy chat_channels_select on public.chat_channels
  for select to authenticated
  using (
    (select public.app_role()) in ('admin', 'board')
    and (kind = 'area' or public.is_channel_member(id)));

-- Only admins add or remove area channels (direct ones come from open_direct_channel()).
create policy chat_channels_write_admin on public.chat_channels
  for all to authenticated
  using ((select public.app_role()) = 'admin' and kind = 'area')
  with check ((select public.app_role()) = 'admin' and kind = 'area');

-- Members of a direct channel see who is in it.
create policy chat_channel_members_select on public.chat_channel_members
  for select to authenticated
  using ((select public.app_role()) in ('admin', 'board') and public.is_channel_member(channel_id));

-- Messages: visible when the channel is visible (the subquery runs under the
-- caller's chat_channels policy).
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    (select public.app_role()) in ('admin', 'board')
    and exists (select 1 from public.chat_channels c where c.id = channel_id));

-- Post as yourself (never as the bot) into a channel you can see.
create policy chat_messages_insert_own on public.chat_messages
  for insert to authenticated
  with check (
    (select public.app_role()) in ('admin', 'board')
    and author_id = (select auth.uid())
    and not is_bot
    and exists (select 1 from public.chat_channels c where c.id = channel_id));

-- Edit or delete your own messages.
create policy chat_messages_update_own on public.chat_messages
  for update to authenticated
  using ((select public.app_role()) in ('admin', 'board') and author_id = (select auth.uid()) and not is_bot)
  with check ((select public.app_role()) in ('admin', 'board') and author_id = (select auth.uid()) and not is_bot);

create policy chat_messages_delete_own on public.chat_messages
  for delete to authenticated
  using ((select public.app_role()) in ('admin', 'board') and author_id = (select auth.uid()) and not is_bot);

-- Read markers: your own only, for channels you can see.
create policy chat_read_markers_own on public.chat_read_markers
  for all to authenticated
  using ((select public.app_role()) in ('admin', 'board') and user_id = (select auth.uid()))
  with check (
    (select public.app_role()) in ('admin', 'board')
    and user_id = (select auth.uid())
    and exists (select 1 from public.chat_channels c where c.id = channel_id));

-- -----------------------------------------------------------------------------
-- k. Import the legacy program plan (both years, years kept)
-- -----------------------------------------------------------------------------
-- Source: legacy.program_plan_milestones (24 rows) and legacy.program_plan_tasks
-- (81 rows), copied by the fresh-start migration. legacy.* is left untouched.
--
-- Decided 2026-10-07 (apps/SHEETS-SYNC.md): only the 2026 plan (MS-001 to
-- MS-010) moves into the app; the 2021 plan stays in the archived sheet; the
-- fellowship partner onboarding (MS-006) and the CBC symposium (MS-010) are
-- left out unless they are real programs. So every row is imported, with its
-- year, but those are marked archived = true: hidden on every screen, kept in
-- the database, and restorable by flipping one flag.
--
-- Clean-ups: "(MS-001)" moves from the name into `code`; line breaks and runs
-- of spaces in names become single spaces. Status: Complete -> done,
-- In progress -> in_progress, Not started -> open.

insert into public.plan_milestones
  (legacy_id, plan_year, code, name, area, program_id, due_on, done, archived, position)
select
  m.id,
  m.plan_year::smallint,
  substring(m.milestone_name from '\((MS-[0-9]{3})\)'),
  btrim(regexp_replace(regexp_replace(m.milestone_name, '\s*\(MS-[0-9]{3}\)', '', 'g'), '\s+', ' ', 'g')),
  -- Area: by the 2026 code; the 2021 plan is programs work except the fundraisers.
  case
    when m.milestone_name ~ 'MS-00[23]' then 'outreach'
    when m.milestone_name ~ 'MS-0(04|07|09|10)' then 'scholarships'
    when m.milestone_name ~* 'fundrais' then 'money'
    else 'programs'
  end,
  -- Program: NSBE travel -> Sponsorships; certification launch -> Certification;
  -- 2021 mentorship milestones -> Mentorship; 2021 "Sponsorships" -> Sponsorships.
  (select p.id from public.programs p where p.slug = case
     when m.milestone_name ~ 'MS-001' then 'sponsorships'
     when m.milestone_name ~ 'MS-005' then 'certification'
     when m.plan_year = 2021 and m.milestone_name ~* 'mentorship' then 'mentorship'
     when m.plan_year = 2021 and btrim(m.milestone_name) = 'Sponsorships' then 'sponsorships'
   end),
  m.due_date,
  coalesce(m.is_complete, false),
  (m.plan_year <> 2026 or m.milestone_name ~ 'MS-0(06|10)'),
  (row_number() over (partition by m.plan_year
                      order by m.due_date nulls last, m.milestone_name))::integer
from legacy.program_plan_milestones m;

insert into public.tasks
  (legacy_id, title, type, area, status, due_on, milestone_id, deliverable, position,
   archived, completed_at)
select
  t.id,
  btrim(regexp_replace(t.task_name, '\s+', ' ', 'g')),
  'task',
  pm.area,
  case t.status
    when 'Complete' then 'done'
    when 'In progress' then 'in_progress'
    else 'open'
  end,
  t.due_date,
  pm.id,
  nullif(btrim(t.deliverable), ''),
  coalesce(t.sort_order, 0),
  pm.archived,
  case when t.status = 'Complete' then coalesce(t.updated_at, now()) end
from legacy.program_plan_tasks t
join legacy.program_plan_milestones m
  on m.plan_year = t.plan_year and m.milestone_name = t.milestone_name
join public.plan_milestones pm on pm.legacy_id = m.id;

-- -----------------------------------------------------------------------------
-- l. Final checks: any failure raises and rolls back the whole migration
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad   text;
  v_ms    bigint;
  v_ms_in bigint;
  v_tk    bigint;
  v_tk_in bigint;
begin
  -- The whole legacy plan arrived (live counts on 2026-10-09: 24 and 81).
  select count(*) into v_ms    from legacy.program_plan_milestones;
  select count(*) into v_ms_in from public.plan_milestones where legacy_id is not null;
  select count(*) into v_tk    from legacy.program_plan_tasks;
  select count(*) into v_tk_in from public.tasks where legacy_id is not null;
  if v_ms <> v_ms_in or v_tk <> v_tk_in or v_ms = 0 or v_tk = 0 then
    raise exception 'legacy import incomplete: milestones %/%, tasks %/%', v_ms_in, v_ms, v_tk_in, v_tk;
  end if;

  -- Only the 2026 plan without MS-006 and MS-010 is visible (expect 7 milestones).
  select string_agg(plan_year || ' ' || name, '; ') into v_bad
  from public.plan_milestones
  where legacy_id is not null and not archived
    and (plan_year <> 2026 or code in ('MS-006', 'MS-010') or code is null);
  if v_bad is not null then
    raise exception 'legacy rows visible that should be archived: %', v_bad;
  end if;

  -- No policy (public or storage) may read user_metadata.
  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ') into v_bad
  from pg_policies
  where schemaname in ('public', 'storage')
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%user_meta%';
  if v_bad is not null then
    raise exception 'policies read user_metadata: %', v_bad;
  end if;

  -- No view in public may read user_metadata.
  select string_agg(viewname, ', ') into v_bad
  from pg_views
  where schemaname = 'public' and definition ilike '%user_meta%';
  if v_bad is not null then
    raise exception 'views read user_metadata: %', v_bad;
  end if;

  -- Every view in public is security_invoker.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('v', 'm')
    and not coalesce(c.reloptions @> array['security_invoker=true'], false);
  if v_bad is not null then
    raise exception 'views without security_invoker: %', v_bad;
  end if;

  -- Every table in public has RLS on.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'tables without RLS: %', v_bad;
  end if;

  -- Every table in public has at least one policy, except the private
  -- counter (only submit_application() touches it).
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')
    and c.relname <> 'application_code_counters'
    and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = c.relname);
  if v_bad is not null then
    raise exception 'tables without any policy: %', v_bad;
  end if;

  -- anon has no privilege on any new table or view.
  select string_agg(table_name, ', ') into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
    and table_name not in ('cycles');
  if v_bad is not null then
    raise exception 'anon has privileges on: %', v_bad;
  end if;

  -- Every function in public pins search_path to '' (rls_auto_enable is
  -- Supabase's own and pins it to pg_catalog).
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname <> 'rls_auto_enable'
    and not coalesce(p.proconfig @> array['search_path=""'], false);
  if v_bad is not null then
    raise exception 'functions without search_path = '''': %', v_bad;
  end if;

  -- Nothing unexpected in public: the Portal's 7 tables plus this file's.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm')
    and c.relname not in (
      -- Portal (20261009130000)
      'cycles', 'applications', 'application_files', 'notify_signups',
      'interview_slots', 'bookings', 'application_code_counters',
      -- Ops Hub tables (this file)
      'staff_profiles', 'areas', 'task_types', 'programs', 'budget_years', 'budget_categories',
      'budget_quarter_plans', 'budget_quarter_plan_lines', 'outreach_channels', 'posts',
      'newsletter_issues', 'newsletter_sections', 'grants', 'calendar_events', 'checklists',
      'plan_milestones', 'tasks', 'task_assignees', 'task_comments', 'rubric_criteria',
      'board_availability', 'interview_pairings', 'interview_summaries', 'scores',
      'score_private_notes', 'scholarship_awards', 'award_steps', 'certification_ideas',
      'sponsorships', 'donors', 'gifts', 'spending_entries', 'funds_snapshots', 'goals',
      'year_figures', 'chat_channels', 'chat_channel_members', 'chat_messages',
      'chat_read_markers', 'chat_pins',
      -- Ops Hub views (this file)
      'application_score_summary', 'budget_category_totals', 'chat_unread_counts');
  if v_bad is not null then
    raise exception 'unexpected objects in public: %', v_bad;
  end if;
end;
$$;

commit;
