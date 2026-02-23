do $$
declare
  trigger_fn record;
  patched_count integer := 0;
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
        or pg_get_functiondef(p.oid) ilike '%capacity%'
      )
  loop
    execute format(
      $sql$
      create or replace function %I.%I()
      returns trigger
      language plpgsql
      as $body$
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

        -- Dropped rows should not consume capacity.
        if new.dropped_at is not null then
          return new;
        end if;

        select st.capacity
          into base_capacity
        from public.shift_instances si
        join public.shift_templates st on st.id = si.template_id
        where si.id = new.shift_instance_id;

        -- If a template capacity is not configured, skip enforcement.
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
      $body$;
      $sql$,
      trigger_fn.function_schema,
      trigger_fn.function_name
    );

    patched_count := patched_count + 1;
  end loop;

  if patched_count = 0 then
    raise exception
      'No shift_assignments capacity trigger function found to patch. Inspect database trigger/function names and update this migration.';
  end if;
end;
$$;
