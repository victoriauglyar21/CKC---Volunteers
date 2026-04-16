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
