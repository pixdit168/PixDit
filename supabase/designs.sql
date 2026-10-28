-- Run once in the Supabase SQL editor before enabling editable generation.
begin;
create table if not exists public.pixgin_design_assets (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique, width integer not null check(width between 1 and 8192), height integer not null check(height between 1 and 8192),
  original_asset_id uuid references public.pixgin_design_assets(id), created_at timestamptz not null default now()
);
create table if not exists public.pixgin_designs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, document jsonb not null check(octet_length(document::text) <= 524288), revision bigint not null default 1 check(revision > 0), updated_at timestamptz not null default now()
);
create table if not exists public.pixgin_design_versions (
  id uuid primary key default gen_random_uuid(), design_id uuid not null references public.pixgin_designs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, number integer not null, revision bigint not null,
  document jsonb not null, preview_asset_id uuid references public.pixgin_design_assets(id), original boolean not null default false, created_at timestamptz not null default now(),
  unique(design_id, number), unique(design_id, revision)
);
create index if not exists pixgin_designs_owner on public.pixgin_designs(user_id);
create index if not exists pixgin_design_assets_owner on public.pixgin_design_assets(user_id);
alter table public.pixgin_designs enable row level security;
alter table public.pixgin_design_assets enable row level security;
alter table public.pixgin_design_versions enable row level security;
revoke all on public.pixgin_designs, public.pixgin_design_assets, public.pixgin_design_versions from anon, authenticated;
grant all on public.pixgin_designs, public.pixgin_design_assets, public.pixgin_design_versions to service_role;

create or replace function public.pixgin_create_design(p_id uuid, p_owner uuid, p_title text, p_document jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.pixgin_designs(id,user_id,title,document) values(p_id,p_owner,p_title,p_document);
  insert into public.pixgin_design_versions(design_id,user_id,number,revision,document,original) values(p_id,p_owner,1,1,p_document,true);
end $$;
create or replace function public.pixgin_save_design_version(p_id uuid,p_owner uuid,p_revision bigint,p_preview uuid,p_initial boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
declare d public.pixgin_designs; v public.pixgin_design_versions;
begin
  select * into d from public.pixgin_designs where id=p_id and user_id=p_owner for update;
  if not found or d.revision <> p_revision or (p_initial and p_revision <> 1) then raise exception 'Revision conflict' using errcode='40001'; end if;
  if not exists(select 1 from public.pixgin_design_assets where id=p_preview and user_id=p_owner) then raise exception 'Preview not owned'; end if;
  select * into v from public.pixgin_design_versions where design_id=p_id and revision=p_revision;
  if found then
    if v.preview_asset_id is null then update public.pixgin_design_versions set preview_asset_id=p_preview where id=v.id; end if;
  else
    insert into public.pixgin_design_versions(design_id,user_id,number,revision,document,preview_asset_id)
    values(p_id,p_owner,(select coalesce(max(number),0)+1 from public.pixgin_design_versions where design_id=p_id),p_revision,d.document,p_preview);
  end if;
end $$;
create or replace function public.pixgin_protect_design_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.document is distinct from old.document or new.design_id is distinct from old.design_id or new.user_id is distinct from old.user_id or new.revision is distinct from old.revision or new.number is distinct from old.number or new.original is distinct from old.original or new.created_at is distinct from old.created_at or (old.preview_asset_id is not null and new.preview_asset_id is distinct from old.preview_asset_id)
  then raise exception 'Saved design versions are immutable'; end if;
  return new;
end $$;
drop trigger if exists pixgin_design_version_immutable on public.pixgin_design_versions;
create trigger pixgin_design_version_immutable before update on public.pixgin_design_versions for each row execute function public.pixgin_protect_design_version();
create or replace function public.pixgin_design_schema_version() returns integer language sql stable as $$ select 1 $$;
revoke all on function public.pixgin_create_design(uuid,uuid,text,jsonb), public.pixgin_save_design_version(uuid,uuid,bigint,uuid,boolean), public.pixgin_design_schema_version() from public,anon,authenticated;
grant execute on function public.pixgin_create_design(uuid,uuid,text,jsonb), public.pixgin_save_design_version(uuid,uuid,bigint,uuid,boolean), public.pixgin_design_schema_version() to service_role;
commit;
