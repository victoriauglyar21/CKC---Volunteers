-- Capacity is a display target, not a limit on assignment inserts/updates.
-- Apply this migration to the live database; a frontend deployment alone cannot
-- remove a legacy "Shift is full" trigger.
begin;

do $$
declare
  capacity_trigger record;
begin
  for capacity_trigger in
    select t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'shift_assignments'
      and not t.tgisinternal
      and (
        t.tgname ilike '%capacity%'
        or p.proname ilike '%capacity%'
        or pg_get_functiondef(p.oid) ilike '%shift is full%'
        or pg_get_functiondef(p.oid) ilike '%base_capacity%'
        or pg_get_functiondef(p.oid) ilike '%max_capacity%'
      )
  loop
    execute format('drop trigger %I on public.shift_assignments', capacity_trigger.tgname);
  end loop;
end;
$$;

-- Keep this legacy function harmless if an older setup recreates its trigger.
create or replace function public.enforce_shift_assignment_capacity()
returns trigger
language plpgsql
as $$
begin
  return new;
end;
$$;

commit;
