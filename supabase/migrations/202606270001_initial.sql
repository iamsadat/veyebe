create extension if not exists pgcrypto;

create type public.feature_state as enum ('proposed','planned','active','needs_verification','verified','blocked','parked');
create type public.recommendation_status as enum ('open','accepted','dismissed','snoozed','completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id text primary key,
  name text not null,
  kind text not null default 'personal' check (kind in ('personal','team')),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.projects (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  goal text not null default '',
  sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_sources (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('local','github')),
  github_owner text,
  github_repository text,
  source_fingerprint text,
  created_at timestamptz not null default now(),
  unique(project_id, kind)
);

create table public.scan_snapshots (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  schema_version integer not null default 1,
  analyzer_version text not null,
  captured_at timestamptz not null,
  project_name text not null,
  goal text not null default '',
  capabilities jsonb not null default '[]',
  metrics jsonb not null default '{}',
  features jsonb not null default '[]',
  evidence jsonb not null default '[]',
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index scan_snapshots_project_captured_idx on public.scan_snapshots(project_id, captured_at desc);

create table public.features (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  title text not null,
  intent text not null,
  state public.feature_state not null default 'proposed',
  confidence real not null check (confidence between 0 and 1),
  approved boolean not null default false,
  acceptance_criteria jsonb not null default '[]',
  dependency_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index features_workspace_project_idx on public.features(workspace_id, project_id);

create table public.evidence (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  kind text not null,
  title text not null,
  summary text not null,
  locator jsonb,
  observed_at timestamptz not null,
  confidence real not null check (confidence between 0 and 1),
  tags text[] not null default '{}'
);
create index evidence_workspace_project_idx on public.evidence(workspace_id, project_id);

create table public.recommendations (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  fingerprint text not null,
  title text not null,
  rationale text not null,
  severity text not null,
  confidence real not null check (confidence between 0 and 1),
  status public.recommendation_status not null default 'open',
  suggested_action jsonb not null default '{}',
  snoozed_until timestamptz,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id, fingerprint)
);
create index recommendations_workspace_project_status_idx on public.recommendations(workspace_id, project_id, status);

create table public.recommendation_evidence (
  recommendation_id text not null references public.recommendations(id) on delete cascade,
  evidence_id text not null references public.evidence(id) on delete cascade,
  primary key (recommendation_id, evidence_id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  title text not null,
  target_at timestamptz,
  state public.feature_state not null default 'planned',
  feature_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index milestones_workspace_project_idx on public.milestones(workspace_id, project_id);

create table public.github_events (
  delivery_id text primary key,
  workspace_id text references public.workspaces(id) on delete cascade,
  event_name text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index github_events_workspace_idx on public.github_events(workspace_id) where workspace_id is not null;

create table public.privacy_audit_log (
  id bigint generated always as identity primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  scan_id text,
  categories text[] not null,
  schema_version integer not null default 1,
  byte_count integer not null,
  created_at timestamptz not null default now()
);

create table public.background_jobs (
  id bigint generated always as identity primary key,
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index background_jobs_claim_idx on public.background_jobs(status, available_at);

create or replace function public.enqueue_github_event()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.background_jobs(kind, payload) values('github_event', jsonb_build_object('deliveryId', new.delivery_id));
  return new;
end $$;
create trigger github_event_enqueued after insert on public.github_events for each row execute procedure public.enqueue_github_event();

create or replace function public.claim_veyebe_jobs(batch_size integer default 10)
returns setof public.background_jobs language plpgsql security definer set search_path = public
as $$ begin
  return query
  update public.background_jobs
  set status = 'running', locked_at = now(), attempts = attempts + 1
  where id in (
    select id from public.background_jobs
    where status = 'queued' and available_at <= now()
    order by created_at
    for update skip locked limit batch_size
  )
  returning *;
end $$;
revoke all on function public.claim_veyebe_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_veyebe_jobs(integer) to service_role;

create or replace function public.is_workspace_member(target_workspace text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.workspace_members where workspace_id = target_workspace and user_id = auth.uid()) $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare workspace_key text := 'workspace_' || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.profiles(id, display_name, avatar_url) values(new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.raw_user_meta_data->>'avatar_url');
  insert into public.workspaces(id, name) values(workspace_key, 'Personal workspace');
  insert into public.workspace_members(workspace_id, user_id, role) values(workspace_key, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_sources enable row level security;
alter table public.scan_snapshots enable row level security;
alter table public.features enable row level security;
alter table public.evidence enable row level security;
alter table public.recommendations enable row level security;
alter table public.recommendation_evidence enable row level security;
alter table public.milestones enable row level security;
alter table public.github_events enable row level security;
alter table public.privacy_audit_log enable row level security;
alter table public.background_jobs enable row level security;

create policy "profile self" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "workspace members read" on public.workspaces for select using (public.is_workspace_member(id));
create policy "members read membership" on public.workspace_members for select using (public.is_workspace_member(workspace_id));

create policy "members manage projects" on public.projects for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage sources" on public.project_sources for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage scans" on public.scan_snapshots for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage features" on public.features for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage evidence" on public.evidence for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage recommendations" on public.recommendations for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage milestones" on public.milestones for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members read github events" on public.github_events for select using (workspace_id is not null and public.is_workspace_member(workspace_id));
create policy "members read privacy audit" on public.privacy_audit_log for select using (public.is_workspace_member(workspace_id));

create policy "members manage recommendation evidence" on public.recommendation_evidence for all
using (exists(select 1 from public.recommendations r where r.id = recommendation_id and public.is_workspace_member(r.workspace_id)))
with check (exists(select 1 from public.recommendations r where r.id = recommendation_id and public.is_workspace_member(r.workspace_id)));
