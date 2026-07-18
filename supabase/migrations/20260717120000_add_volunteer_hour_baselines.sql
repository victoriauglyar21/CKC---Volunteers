create table if not exists public.volunteer_hour_baselines (
  volunteer_id uuid primary key references public.profiles(id) on delete cascade,
  baseline_hours numeric not null default 0,
  automatic_start_at timestamptz not null default '2026-07-17 00:00:00-06',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.volunteer_hour_baselines enable row level security;

drop policy if exists "users read own volunteer hour baselines" on public.volunteer_hour_baselines;
create policy "users read own volunteer hour baselines"
on public.volunteer_hour_baselines
for select
using (
  auth.uid() = volunteer_id
  or public.is_admin_user(auth.uid())
);

drop policy if exists "admins manage volunteer hour baselines" on public.volunteer_hour_baselines;
create policy "admins manage volunteer hour baselines"
on public.volunteer_hour_baselines
for all
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));
