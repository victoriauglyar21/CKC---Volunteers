alter table public.profiles
  add column if not exists notification_settings jsonb not null default jsonb_build_object(
    'shift_added', true,
    'shift_removed', true,
    'shift_dropped', true,
    'shift_approved', true,
    'recurring_added', true,
    'recurring_removed', true,
    'shift_reminder', true
  );
