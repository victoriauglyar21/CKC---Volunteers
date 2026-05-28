create extension if not exists pgcrypto;

create or replace function public.is_admin_user(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user_id
      and role = 'Admin'
  );
$$;

create or replace function public.set_training_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  summary text,
  estimated_time text,
  is_required boolean not null default false,
  status_label text,
  note text,
  audience text not null default 'regular' check (audience in ('regular', 'lead', 'both')),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  title text not null,
  duration text,
  summary text,
  embed_url text,
  video_url text,
  takeaways jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.training_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  prompt text not null,
  explanation text,
  correct_option_id text,
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists training_courses_sort_order_idx on public.training_courses(sort_order, title);
create index if not exists training_lessons_course_id_idx on public.training_lessons(course_id, sort_order);
create index if not exists training_questions_course_id_idx on public.training_questions(course_id, sort_order);

drop trigger if exists set_training_courses_updated_at on public.training_courses;
create trigger set_training_courses_updated_at
before update on public.training_courses
for each row
execute function public.set_training_updated_at();

alter table public.training_courses enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_questions enable row level security;

drop policy if exists "published training courses are readable" on public.training_courses;
create policy "published training courses are readable"
on public.training_courses
for select
to authenticated
using (
  is_published = true
  or public.is_admin_user(auth.uid())
);

drop policy if exists "published training lessons are readable" on public.training_lessons;
create policy "published training lessons are readable"
on public.training_lessons
for select
to authenticated
using (
  exists (
    select 1
    from public.training_courses
    where training_courses.id = training_lessons.course_id
      and (training_courses.is_published = true or public.is_admin_user(auth.uid()))
  )
);

drop policy if exists "published training questions are readable" on public.training_questions;
create policy "published training questions are readable"
on public.training_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.training_courses
    where training_courses.id = training_questions.course_id
      and (training_courses.is_published = true or public.is_admin_user(auth.uid()))
  )
);

drop policy if exists "admins manage training courses" on public.training_courses;
create policy "admins manage training courses"
on public.training_courses
for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "admins manage training lessons" on public.training_lessons;
create policy "admins manage training lessons"
on public.training_lessons
for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "admins manage training questions" on public.training_questions;
create policy "admins manage training questions"
on public.training_questions
for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

insert into public.training_courses (
  slug,
  title,
  description,
  summary,
  estimated_time,
  is_required,
  status_label,
  note,
  audience,
  is_published,
  sort_order
)
values
  (
    'volunteer-orientation',
    'Volunteer Orientation',
    'The base course for every volunteer. Use this for your intro videos, role expectations, and the core quiz.',
    'Start here. Core onboarding for all volunteers.',
    '20-25 min',
    true,
    null,
    'Replace the lesson video URLs when your final videos are ready.',
    'both',
    true,
    0
  ),
  (
    'cleaning-and-closing',
    'Cleaning and Closing Duties',
    'A placeholder course for cleaning standards, end-of-shift reset, and opening/closing checklists.',
    'Placeholder structure for operational training.',
    '10-12 min',
    true,
    'Build next',
    null,
    'both',
    true,
    1
  ),
  (
    'lead-handoff-and-escalation',
    'Lead Handoff and Escalation',
    'A lead-only course for shift ownership, volunteer guidance, and escalation protocols.',
    'Lead-only dashboard course.',
    '15-18 min',
    true,
    'Lead only',
    null,
    'lead',
    true,
    2
  ),
  (
    'lead-safety-review',
    'Lead Safety Review',
    'A lead-only course for higher-stakes safety judgment calls and incident follow-up.',
    'Lead-only safety refresher placeholder.',
    '8-10 min',
    false,
    'Optional',
    null,
    'lead',
    true,
    3
  )
on conflict (slug) do nothing;

insert into public.training_lessons (course_id, title, duration, summary, embed_url, video_url, takeaways, sort_order)
select c.id, lesson.title, lesson.duration, lesson.summary, lesson.embed_url, lesson.video_url, lesson.takeaways, lesson.sort_order
from (
  values
    ('volunteer-orientation', '1. Mission and Safety Basics', '6 min', 'Introduce the organization, explain volunteer expectations, and cover the safety rules every volunteer should follow before interacting with animals or guests.', null, null, '["Start every shift by checking instructions from a lead or admin.","Do not improvise safety procedures when animals or visitors are involved.","Ask questions early instead of guessing."]'::jsonb, 0),
    ('volunteer-orientation', '2. Shift Flow and Communication', '8 min', 'Walk through what volunteers do when they arrive, how handoffs work, and how to communicate issues during a shift.', null, null, '["Arrive ready to help and review the plan for the shift.","Communicate concerns to a lead right away.","Leave clear notes when something needs follow-up."]'::jsonb, 1),
    ('volunteer-orientation', '3. Guest Interactions and Animal Care', '7 min', 'Cover the standards for speaking with guests, handling animals appropriately, and escalating anything outside your role.', null, null, '["Be calm, clear, and friendly with guests.","Stay inside your role and escalate uncertain situations.","Protect the animals first, then document issues clearly."]'::jsonb, 2),
    ('cleaning-and-closing', 'Closing checklist overview', '5 min', 'Add your cleaning and reset walkthrough here.', null, null, '["Show the exact close-out sequence.","Call out sanitation requirements.","Document what must be left for the next shift."]'::jsonb, 0),
    ('lead-handoff-and-escalation', 'Running the shift and escalating issues', '7 min', 'Add the lead workflow, escalation rules, and communication expectations here.', null, null, '["Define what leads own during a shift.","Show when to escalate to admin.","Set the standard for volunteer coaching."]'::jsonb, 0),
    ('lead-safety-review', 'Lead safety case review', '6 min', 'Add case-study based training here for leads.', null, null, '["Review real edge cases.","Clarify decision thresholds.","Document follow-up expectations."]'::jsonb, 0)
) as lesson(course_slug, title, duration, summary, embed_url, video_url, takeaways, sort_order)
join public.training_courses c on c.slug = lesson.course_slug
where not exists (
  select 1
  from public.training_lessons existing
  where existing.course_id = c.id
);

insert into public.training_questions (course_id, prompt, explanation, correct_option_id, options, sort_order)
select c.id, q.prompt, q.explanation, q.correct_option_id, q.options, q.sort_order
from (
  values
    ('volunteer-orientation', 'If you are unsure how to handle a situation during a shift, what should you do first?', 'Volunteers should escalate uncertainty quickly instead of improvising.', 'a', '[{"id":"a","label":"Ask a lead or admin for direction"},{"id":"b","label":"Try what seems most efficient"},{"id":"c","label":"Wait and hope another volunteer handles it"}]'::jsonb, 0),
    ('volunteer-orientation', 'Why are shift notes and handoff details important?', 'Good notes preserve context and reduce avoidable mistakes between shifts.', 'b', '[{"id":"a","label":"They are optional if the shift felt normal"},{"id":"b","label":"They help the next volunteer or lead know what happened"},{"id":"c","label":"They are mainly for tracking volunteer speed"}]'::jsonb, 1),
    ('volunteer-orientation', 'What is the best approach when speaking with guests?', 'Guest interactions should be friendly, clear, and professional.', 'a', '[{"id":"a","label":"Be calm, respectful, and clear"},{"id":"b","label":"Keep answers short even if they are incomplete"},{"id":"c","label":"Avoid interacting unless directly required"}]'::jsonb, 2),
    ('volunteer-orientation', 'When should a volunteer go beyond the normal process with an animal or guest issue?', 'Unusual situations should be escalated rather than handled ad hoc.', 'b', '[{"id":"a","label":"Whenever they think it will save time"},{"id":"b","label":"Only after checking with a lead or admin when needed"},{"id":"c","label":"Only if no one is watching"}]'::jsonb, 3),
    ('volunteer-orientation', 'What should take priority if a situation feels unsafe?', 'Safety overrides convenience and schedule pressure.', 'b', '[{"id":"a","label":"Finishing the task quickly"},{"id":"b","label":"Safety for animals, guests, and volunteers"},{"id":"c","label":"Avoiding interrupting the schedule"}]'::jsonb, 4)
) as q(course_slug, prompt, explanation, correct_option_id, options, sort_order)
join public.training_courses c on c.slug = q.course_slug
where not exists (
  select 1
  from public.training_questions existing
  where existing.course_id = c.id
);
