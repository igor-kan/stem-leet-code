-- Community/Auth schema for STEM Leet Code
-- Run in Supabase SQL Editor, then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  username text not null unique,
  display_name text not null default '',
  reputation numeric not null default 0,
  contribution_score numeric not null default 0,
  review_score numeric not null default 0,
  solved_count integer not null default 0,
  total_submissions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  problem_id text not null,
  problem_title text not null,
  topic text not null,
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  language text not null,
  status text not null check (status in ('Accepted', 'Wrong Answer', 'Runtime Error', 'Language Not Supported', 'Proof Incomplete')),
  passed integer not null default 0 check (passed >= 0),
  total integer not null default 0 check (total >= 0),
  runtime_ms integer not null default 0 check (runtime_ms >= 0),
  auto_score numeric not null default 0,
  source_code text not null default '',
  created_at timestamptz not null default now()
);

alter table public.community_submissions drop constraint if exists community_submissions_status_check;
alter table public.community_submissions
add constraint community_submissions_status_check
check (status in ('Accepted', 'Wrong Answer', 'Runtime Error', 'Language Not Supported', 'Proof Incomplete'));

create index if not exists idx_community_submissions_user on public.community_submissions(user_id);
create index if not exists idx_community_submissions_problem on public.community_submissions(problem_id);
create index if not exists idx_community_submissions_created on public.community_submissions(created_at desc);

create table if not exists public.solution_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.community_submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_name text not null,
  verdict text not null check (verdict in ('approve', 'request_changes')),
  correctness_score integer not null check (correctness_score between 1 and 10),
  explanation_score integer not null check (explanation_score between 1 and 10),
  rigor_score integer not null check (rigor_score between 1 and 10),
  weighted_score numeric not null default 0,
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (submission_id, reviewer_id)
);

create index if not exists idx_solution_reviews_submission on public.solution_reviews(submission_id);
create index if not exists idx_solution_reviews_reviewer on public.solution_reviews(reviewer_id);
create index if not exists idx_solution_reviews_created on public.solution_reviews(created_at desc);

create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_id text,
  delta numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

create or replace function public.compute_auto_score(
  p_status text,
  p_passed integer,
  p_total integer,
  p_runtime_ms integer,
  p_difficulty text
)
returns numeric
language plpgsql
as $$
declare
  pass_ratio numeric := 0;
  difficulty_mult numeric := 1;
  correctness_points numeric := 0;
  runtime_points numeric := 0;
  accepted_bonus numeric := 0;
begin
  if p_total > 0 then
    pass_ratio := p_passed::numeric / p_total::numeric;
  end if;

  difficulty_mult := case p_difficulty
    when 'Easy' then 1
    when 'Medium' then 1.35
    when 'Hard' then 1.75
    else 1
  end;

  correctness_points := pass_ratio * 72;
  runtime_points := greatest(0, 18 - (p_runtime_ms::numeric / 35));
  accepted_bonus := case when p_status = 'Accepted' then 12 else 2 * pass_ratio end;

  return round(greatest(0, (correctness_points + runtime_points + accepted_bonus) * difficulty_mult));
end;
$$;

create or replace function public.before_submission_insert()
returns trigger
language plpgsql
as $$
begin
  new.auto_score := public.compute_auto_score(new.status, new.passed, new.total, new.runtime_ms, new.difficulty);
  return new;
end;
$$;

drop trigger if exists trg_before_submission_insert on public.community_submissions;
create trigger trg_before_submission_insert
before insert on public.community_submissions
for each row execute function public.before_submission_insert();

create or replace function public.before_review_insert()
returns trigger
language plpgsql
as $$
declare
  avg_score numeric;
begin
  avg_score := (new.correctness_score + new.explanation_score + new.rigor_score)::numeric / 3;
  new.weighted_score := round(avg_score * (case when new.verdict = 'approve' then 1 else 0.85 end), 1);
  return new;
end;
$$;

drop trigger if exists trg_before_review_insert on public.solution_reviews;
create trigger trg_before_review_insert
before insert on public.solution_reviews
for each row execute function public.before_review_insert();

create or replace function public.recompute_profile_scores(target_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_solved_count integer := 0;
  v_total_submissions integer := 0;
  v_solution_points numeric := 0;
  v_review_points numeric := 0;
  v_peer_validation numeric := 0;
  v_reputation numeric := 0;
  v_contribution numeric := 0;
begin
  select
    count(*)::integer,
    count(distinct case when status = 'Accepted' then problem_id end)::integer,
    coalesce(sum(case when status = 'Accepted' then auto_score else 0 end), 0)
  into v_total_submissions, v_solved_count, v_solution_points
  from public.community_submissions
  where user_id = target_user_id;

  select coalesce(sum(weighted_score), 0)
  into v_review_points
  from public.solution_reviews
  where reviewer_id = target_user_id;

  select coalesce(avg(r.weighted_score), 0)
  into v_peer_validation
  from public.solution_reviews r
  join public.community_submissions s on s.id = r.submission_id
  where s.user_id = target_user_id;

  v_reputation := round(v_solution_points + (v_review_points * 0.9) + (v_peer_validation * 4) + (v_solved_count * 6));
  v_contribution := round((v_solution_points * 0.75) + (v_review_points * 1.25) + (v_peer_validation * 6));

  update public.profiles
  set
    solved_count = v_solved_count,
    total_submissions = v_total_submissions,
    reputation = v_reputation,
    contribution_score = v_contribution,
    review_score = round(v_review_points)
  where id = target_user_id;
end;
$$;

create or replace function public.after_submission_change()
returns trigger
language plpgsql
as $$
begin
  perform public.recompute_profile_scores(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_after_submission_insert on public.community_submissions;
create trigger trg_after_submission_insert
after insert on public.community_submissions
for each row execute function public.after_submission_change();

create or replace function public.after_review_change()
returns trigger
language plpgsql
as $$
declare
  v_submission_author uuid;
begin
  select user_id into v_submission_author
  from public.community_submissions
  where id = new.submission_id;

  perform public.recompute_profile_scores(new.reviewer_id);
  if v_submission_author is not null then
    perform public.recompute_profile_scores(v_submission_author);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_review_insert on public.solution_reviews;
create trigger trg_after_review_insert
after insert on public.solution_reviews
for each row execute function public.after_review_change();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1));
  insert into public.profiles (id, email, username, display_name)
  values (new.id, coalesce(new.email, ''), lower(regexp_replace(v_username, '\\s+', '-', 'g')), coalesce(v_username, 'User'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.community_submissions enable row level security;
alter table public.solution_reviews enable row level security;
alter table public.reputation_events enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
on public.profiles for select
using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "submissions_select_all" on public.community_submissions;
create policy "submissions_select_all"
on public.community_submissions for select
using (true);

drop policy if exists "submissions_insert_self" on public.community_submissions;
create policy "submissions_insert_self"
on public.community_submissions for insert
with check (auth.uid() = user_id);

drop policy if exists "reviews_select_all" on public.solution_reviews;
create policy "reviews_select_all"
on public.solution_reviews for select
using (true);

drop policy if exists "reviews_insert_self" on public.solution_reviews;
create policy "reviews_insert_self"
on public.solution_reviews for insert
with check (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.community_submissions s
    where s.id = submission_id and s.user_id <> auth.uid()
  )
);

drop policy if exists "events_select_self" on public.reputation_events;
create policy "events_select_self"
on public.reputation_events for select
using (auth.uid() = user_id);
