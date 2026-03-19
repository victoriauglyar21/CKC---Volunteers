create or replace function public.enforce_shift_assignment_capacity()
returns trigger
language plpgsql
as $$
declare
  base_capacity integer;
  max_capacity integer;
  active_count integer;
begin
  if new.shift_instance_id is null then
    return new;
  end if;

  if coalesce(new.status, '') <> 'active' then
    return new;
  end if;

  if new.dropped_at is not null then
    return new;
  end if;

  select st.capacity
    into base_capacity
  from public.shift_instances si
  join public.shift_templates st on st.id = si.template_id
  where si.id = new.shift_instance_id;

  if base_capacity is null then
    return new;
  end if;

  max_capacity := greatest(0, base_capacity) + 2;

  select count(*)
    into active_count
  from public.shift_assignments sa
  where sa.shift_instance_id = new.shift_instance_id
    and sa.status = 'active'
    and sa.dropped_at is null
    and (tg_op <> 'UPDATE' or sa.id <> new.id);

  if active_count >= max_capacity then
    raise exception 'Shift is full';
  end if;

  return new;
end;
$$;

do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'shift_assignments'
      and not t.tgisinternal
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and (
        pg_get_functiondef(p.oid) ilike '%shift is full%'
        or pg_get_functiondef(p.oid) ilike '%capacity%'
      )
  loop
    execute format('drop trigger if exists %I on public.shift_assignments', trigger_record.tgname);
  end loop;
end;
$$;

drop trigger if exists enforce_shift_assignment_capacity on public.shift_assignments;

create trigger enforce_shift_assignment_capacity
before insert or update on public.shift_assignments
for each row
execute function public.enforce_shift_assignment_capacity();
