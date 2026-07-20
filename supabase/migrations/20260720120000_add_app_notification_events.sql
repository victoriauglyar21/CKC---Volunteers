create table if not exists public.app_notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_kind text not null,
  event_type text not null,
  audience text not null default 'admins',
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete cascade,
  shift_instance_id bigint references public.shift_instances(id) on delete set null,
  appointment_id uuid,
  title text,
  body text,
  color text,
  starts_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  completion_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.app_notification_events enable row level security;

create policy app_notification_events_insert_authenticated
on public.app_notification_events
for insert
to authenticated
with check (auth.uid() = actor_id or actor_id is null);

create policy app_notification_events_select_authenticated
on public.app_notification_events
for select
to authenticated
using (
  audience in ('all', 'admins_and_leads', 'leads', 'admins')
  or target_user_id = auth.uid()
);

create index if not exists app_notification_events_created_at_idx
  on public.app_notification_events (created_at desc);

create index if not exists app_notification_events_shift_instance_id_idx
  on public.app_notification_events (shift_instance_id);
