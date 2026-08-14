-- Display names for tasks_alerts.assigned_to, resolved via auth.users(id).
create table public.profiles (
  id uuid primary key references auth.users (id),
  name text
);

alter table public.profiles enable row level security;

create policy "Board/Admin can view profiles"
  on public.profiles
  for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin'));
