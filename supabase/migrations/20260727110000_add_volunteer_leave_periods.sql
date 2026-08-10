create table if not exists public.volunteer_leave_periods (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_leave_periods_valid_range check (starts_on <= ends_on),
  constraint volunteer_leave_periods_reason_required check (length(trim(reason)) > 0)
);

alter table public.volunteer_leave_periods enable row level security;

create index if not exists volunteer_leave_periods_volunteer_range_idx
  on public.volunteer_leave_periods (volunteer_id, starts_on, ends_on);

create policy "users read own leave periods"
on public.volunteer_leave_periods
for select
to authenticated
using (
  auth.uid() = volunteer_id
  or public.is_admin_user(auth.uid())
);

create policy "users create own leave periods"
on public.volunteer_leave_periods
for insert
to authenticated
with check (
  auth.uid() = volunteer_id
  or public.is_admin_user(auth.uid())
);

create policy "users update own leave periods"
on public.volunteer_leave_periods
for update
to authenticated
using (
  auth.uid() = volunteer_id
  or public.is_admin_user(auth.uid())
)
with check (
  auth.uid() = volunteer_id
  or public.is_admin_user(auth.uid())
);

create policy "users delete own leave periods"
on public.volunteer_leave_periods
for delete
to authenticated
using (
  auth.uid() = volunteer_id
  or public.is_admin_user(auth.uid())
);
