create extension if not exists pgcrypto;

create table if not exists public.shift_appointments (
  id uuid primary key default gen_random_uuid(),
  shift_instance_id bigint not null references public.shift_instances(id) on delete cascade,
  title text not null,
  description text,
  color text not null default '#f97316',
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shift_appointments_shift_instance_id_idx
  on public.shift_appointments (shift_instance_id);

create index if not exists shift_appointments_starts_at_idx
  on public.shift_appointments (starts_at);

alter table public.shift_appointments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_appointments'
      and policyname = 'shift_appointments_select_authenticated'
  ) then
    create policy shift_appointments_select_authenticated
      on public.shift_appointments
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_appointments'
      and policyname = 'shift_appointments_insert_authenticated'
  ) then
    create policy shift_appointments_insert_authenticated
      on public.shift_appointments
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_appointments'
      and policyname = 'shift_appointments_update_authenticated'
  ) then
    create policy shift_appointments_update_authenticated
      on public.shift_appointments
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_appointments'
      and policyname = 'shift_appointments_delete_authenticated'
  ) then
    create policy shift_appointments_delete_authenticated
      on public.shift_appointments
      for delete
      to authenticated
      using (true);
  end if;
end
$$;
