delete from public.shift_call_out_logs as log
using public.profiles as profile
where log.volunteer_id = profile.id
  and profile.role = 'Admin'
  and (
    profile.full_name ilike '%victoria%'
    or profile.preferred_name ilike '%victoria%'
    or exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = profile.id
        and auth_user.email ilike '%victoriauglyar%'
    )
  );
