create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

create or replace function public.invoke_shift_reminder_job()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  function_url text;
  function_key text;
  request_id bigint;
begin
  select ds.decrypted_secret
  into function_url
  from vault.decrypted_secrets ds
  where ds.name = 'shift_reminder_function_url'
  order by ds.created_at desc
  limit 1;

  select ds.decrypted_secret
  into function_key
  from vault.decrypted_secrets ds
  where ds.name = 'shift_reminder_function_key'
  order by ds.created_at desc
  limit 1;

  if coalesce(function_url, '') = '' then
    raise exception 'Missing vault secret: shift_reminder_function_url';
  end if;

  if coalesce(function_key, '') = '' then
    raise exception 'Missing vault secret: shift_reminder_function_key';
  end if;

  select net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || function_key,
      'apikey', function_key
    ),
    body := '{}'::jsonb
  )
  into request_id;
end;
$$;

revoke all on function public.invoke_shift_reminder_job() from public;
grant execute on function public.invoke_shift_reminder_job() to postgres;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'shift-reminders-every-5m'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'shift-reminders-every-5m',
    '*/5 * * * *',
    'select public.invoke_shift_reminder_job();'
  );
end;
$$;
