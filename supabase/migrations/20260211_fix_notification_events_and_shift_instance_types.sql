-- Align shift_instance_id types with public.shift_instances(id bigint)
alter table if exists public.notification_events
  drop constraint if exists notification_events_shift_instance_id_fkey;

alter table if exists public.shift_notification_sends
  drop constraint if exists shift_notification_sends_shift_instance_id_fkey;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_events'
      and column_name = 'shift_instance_id'
      and data_type <> 'bigint'
  ) then
    begin
      alter table public.notification_events
        alter column shift_instance_id type bigint
        using shift_instance_id::text::bigint;
    exception when others then
      alter table public.notification_events drop column if exists shift_instance_id;
      alter table public.notification_events add column shift_instance_id bigint;
    end;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shift_notification_sends'
      and column_name = 'shift_instance_id'
      and data_type <> 'bigint'
  ) then
    begin
      alter table public.shift_notification_sends
        alter column shift_instance_id type bigint
        using shift_instance_id::text::bigint;
    exception when others then
      alter table public.shift_notification_sends drop column if exists shift_instance_id;
      alter table public.shift_notification_sends add column shift_instance_id bigint;
    end;
  end if;
end
$$;

alter table if exists public.notification_events
  add constraint notification_events_shift_instance_id_fkey
  foreign key (shift_instance_id) references public.shift_instances(id) on delete cascade;

alter table if exists public.shift_notification_sends
  add constraint shift_notification_sends_shift_instance_id_fkey
  foreign key (shift_instance_id) references public.shift_instances(id) on delete cascade;

-- Ensure enqueue-trigger inserts into notification_events are permitted under RLS
alter table if exists public.notification_events enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_events'
  loop
    execute format('drop policy if exists %I on public.notification_events', p.policyname);
  end loop;
end
$$;

create policy notification_events_insert_any
on public.notification_events
for insert
to public
with check (true);

create policy notification_events_select_authenticated
on public.notification_events
for select
to authenticated
using (true);

-- Patch trigger functions that referenced NEW.created_at where not available
do $$
declare fn_oid oid;
declare fn_sql text;
begin
  for fn_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and pg_get_functiondef(p.oid) ~* '\mnew\.created_at\M'
  loop
    fn_sql := pg_get_functiondef(fn_oid);
    fn_sql := regexp_replace(fn_sql, '\mnew\.created_at\M', 'now()', 'gi');
    execute fn_sql;
  end loop;
end
$$;
