alter table public.profiles
  add column if not exists lead_started_at date;
