-- Some environments still have a legacy capacity trigger that raises
-- "Shift is full". Disable it so admins can add volunteers/"Other"
-- entries from any assignment flow.

do $$
declare
  trigger_fn record;
begin
  for trigger_fn in
    select distinct
      pn.nspname as function_schema,
      p.proname as function_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace cn on cn.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where cn.nspname = 'public'
      and c.relname = 'shift_assignments'
      and not t.tgisinternal
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and (
        pg_get_functiondef(p.oid) ilike '%shift is full%'
        or pg_get_functiondef(p.oid) ilike '%base_capacity%'
        or pg_get_functiondef(p.oid) ilike '%max_capacity%'
      )
  loop
    execute format(
      $sql$
      create or replace function %I.%I()
      returns trigger
      language plpgsql
      as $body$
      begin
        return new;
      end;
      $body$;
      $sql$,
      trigger_fn.function_schema,
      trigger_fn.function_name
    );
  end loop;
end;
$$;

create or replace function public.enforce_shift_assignment_capacity()
returns trigger
language plpgsql
as $$
begin
  return new;
end;
$$;

drop trigger if exists enforce_shift_assignment_capacity on public.shift_assignments;

create trigger enforce_shift_assignment_capacity
before insert or update on public.shift_assignments
for each row
execute function public.enforce_shift_assignment_capacity();
