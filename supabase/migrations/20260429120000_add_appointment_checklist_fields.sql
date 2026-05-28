alter table public.shift_appointments
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists completion_note text;

create index if not exists shift_appointments_completed_at_idx
  on public.shift_appointments (completed_at);
