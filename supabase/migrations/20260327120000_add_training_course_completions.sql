create table if not exists public.training_course_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  score integer not null default 0,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create index if not exists training_course_completions_user_id_idx
  on public.training_course_completions(user_id);

create index if not exists training_course_completions_course_id_idx
  on public.training_course_completions(course_id);

alter table public.training_course_completions enable row level security;

drop policy if exists "users read own training completions" on public.training_course_completions;
create policy "users read own training completions"
on public.training_course_completions
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin_user(auth.uid())
);

drop policy if exists "users save own training completions" on public.training_course_completions;
create policy "users save own training completions"
on public.training_course_completions
for insert
to authenticated
with check (
  auth.uid() = user_id
  or public.is_admin_user(auth.uid())
);

drop policy if exists "users update own training completions" on public.training_course_completions;
create policy "users update own training completions"
on public.training_course_completions
for update
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin_user(auth.uid())
)
with check (
  auth.uid() = user_id
  or public.is_admin_user(auth.uid())
);
