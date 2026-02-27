create table if not exists public.shift_notification_sends (
  id bigserial primary key,
  shift_instance_id bigint references public.shift_instances(id) on delete cascade,
  volunteer_id uuid references auth.users(id) on delete cascade,
  notification_type text not null,
  send_key text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.shift_notification_sends
  add column if not exists shift_instance_id bigint references public.shift_instances(id) on delete cascade;

alter table public.shift_notification_sends
  add column if not exists volunteer_id uuid references auth.users(id) on delete cascade;

alter table public.shift_notification_sends
  add column if not exists notification_type text;

alter table public.shift_notification_sends
  add column if not exists send_key text;

alter table public.shift_notification_sends
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create unique index if not exists shift_notification_sends_send_key_idx
  on public.shift_notification_sends (send_key);

update public.shift_notification_sends
set notification_type = coalesce(notification_type, 'shift_reminder')
where notification_type is null;

update public.shift_notification_sends
set send_key = coalesce(send_key, concat('legacy:', id::text))
where send_key is null;

alter table public.shift_notification_sends
  alter column notification_type set not null;

alter table public.shift_notification_sends
  alter column send_key set not null;

alter table public.profiles
  alter column notification_settings set default jsonb_build_object(
    'shift_added', true,
    'shift_removed', true,
    'shift_dropped', true,
    'shift_approved', true,
    'recurring_added', true,
    'recurring_removed', true,
    'shift_reminder', true,
    'lead_needed', true
  );

update public.profiles
set notification_settings = coalesce(notification_settings, '{}'::jsonb) || jsonb_build_object('lead_needed', true)
where not (coalesce(notification_settings, '{}'::jsonb) ? 'lead_needed');
