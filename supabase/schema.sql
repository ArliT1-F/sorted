-- Sorted: database schema. Run once in Supabase → SQL Editor.
-- All user content is encrypted in the browser before it reaches these tables.

-- Wrapped (encrypted) copies of each user's data key.
create table if not exists public.vault_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  salt text not null,
  iv text not null,
  wrapped_key text not null,
  iterations integer not null,
  recovery_salt text not null,
  recovery_iv text not null,
  recovery_wrapped_key text not null,
  recovery_iterations integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Encrypted JSON records for every tool (ledger, inventory, splitter, form filler).
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) <= 32),
  iv text not null,
  ciphertext text not null check (char_length(ciphertext) <= 2000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists records_user_kind on public.records (user_id, kind);

-- Encrypted file metadata. The file bytes live in the private "vault" storage bucket.
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null unique,
  meta_iv text not null,
  meta_ciphertext text not null,
  size bigint,
  created_at timestamptz not null default now()
);
create index if not exists files_user on public.files (user_id);

alter table public.vault_keys enable row level security;
alter table public.records enable row level security;
alter table public.files enable row level security;

drop policy if exists "own vault key" on public.vault_keys;
create policy "own vault key" on public.vault_keys for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own records" on public.records;
create policy "own records" on public.records for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own files" on public.files;
create policy "own files" on public.files for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and path like (select auth.uid())::text || '/%');

-- Private storage bucket; each user may only touch objects under "<their id>/".
insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "vault read own" on storage.objects;
drop policy if exists "vault insert own" on storage.objects;
drop policy if exists "vault update own" on storage.objects;
drop policy if exists "vault delete own" on storage.objects;
create policy "vault read own" on storage.objects for select to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vault insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vault update own" on storage.objects for update to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vault delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Lets a signed-in user delete their own account (rows cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
