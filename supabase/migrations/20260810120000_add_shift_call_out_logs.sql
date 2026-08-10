create table if not exists public.shift_call_out_logs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.shift_assignments(id) on delete set null,
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  shift_instance_id bigint references public.shift_instances(id) on delete set null,
  action text not null check (action in ('self_dropped', 'removed_by_admin')),
  reason text,
  dropped_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists shift_call_out_logs_volunteer_dropped_at_idx
  on public.shift_call_out_logs (volunteer_id, dropped_at desc);

create index if not exists shift_call_out_logs_shift_instance_id_idx
  on public.shift_call_out_logs (shift_instance_id);

alter table public.shift_call_out_logs enable row level security;

drop policy if exists "admins read shift call out logs" on public.shift_call_out_logs;
create policy "admins read shift call out logs"
on public.shift_call_out_logs
for select
using (public.is_admin_user(auth.uid()));

drop policy if exists "users read own shift call out logs" on public.shift_call_out_logs;
create policy "users read own shift call out logs"
on public.shift_call_out_logs
for select
using (volunteer_id = auth.uid());

create or replace function public.log_shift_call_out()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'dropped'
    and old.status is distinct from 'dropped'
    and new.volunteer_id is not null
  then
    insert into public.shift_call_out_logs (
      assignment_id,
      volunteer_id,
      actor_id,
      shift_instance_id,
      action,
      reason,
      dropped_at
    )
    values (
      new.id,
      new.volunteer_id,
      auth.uid(),
      new.shift_instance_id,
      case
        when new.dropped_reason = 'Removed by admin' then 'removed_by_admin'
        else 'self_dropped'
      end,
      new.dropped_reason,
      coalesce(new.dropped_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists log_shift_call_out on public.shift_assignments;
create trigger log_shift_call_out
after update on public.shift_assignments
for each row
execute function public.log_shift_call_out();

insert into public.shift_call_out_logs (
  assignment_id,
  volunteer_id,
  actor_id,
  shift_instance_id,
  action,
  reason,
  dropped_at,
  created_at
)
select
  sa.id,
  sa.volunteer_id,
  null,
  sa.shift_instance_id,
  case
    when sa.dropped_reason = 'Removed by admin' then 'removed_by_admin'
    else 'self_dropped'
  end,
  sa.dropped_reason,
  coalesce(sa.dropped_at, sa.created_at, now()),
  coalesce(sa.dropped_at, sa.created_at, now())
from public.shift_assignments sa
where sa.status = 'dropped'
  and sa.volunteer_id is not null
  and not exists (
    select 1
    from public.shift_call_out_logs existing
    where existing.assignment_id = sa.id
  );
