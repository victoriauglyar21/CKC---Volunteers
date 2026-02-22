alter table public.recurring_assignments
add column if not exists repeat_interval_weeks integer;

update public.recurring_assignments
set repeat_interval_weeks = 1
where repeat_interval_weeks is null;

alter table public.recurring_assignments
alter column repeat_interval_weeks set default 1;

alter table public.recurring_assignments
alter column repeat_interval_weeks set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recurring_assignments_repeat_interval_weeks_check'
  ) then
    alter table public.recurring_assignments
    add constraint recurring_assignments_repeat_interval_weeks_check
    check (repeat_interval_weeks in (1, 2));
  end if;
end $$;
