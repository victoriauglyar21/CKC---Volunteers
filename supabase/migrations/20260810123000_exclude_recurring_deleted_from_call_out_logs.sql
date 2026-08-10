delete from public.shift_call_out_logs
where reason = 'Recurring shift deleted';

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
    and coalesce(new.dropped_reason, '') <> 'Recurring shift deleted'
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
