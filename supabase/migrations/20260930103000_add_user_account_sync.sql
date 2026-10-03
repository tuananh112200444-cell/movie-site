-- User-owned account data for cross-device sync. Public comments remain a
-- separate feature; private_comment only mirrors the current browser feature.
create table if not exists public.user_sync_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  data_type text not null check (data_type in ('favorite', 'watch_history', 'private_comment', 'followed_movie', 'notification')),
  item_key text not null,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, data_type, item_key)
);

alter table public.user_sync_items enable row level security;
alter table public.user_sync_items replica identity full;

drop policy if exists "Users read their own sync data" on public.user_sync_items;
create policy "Users read their own sync data"
  on public.user_sync_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert their own sync data" on public.user_sync_items;
create policy "Users insert their own sync data"
  on public.user_sync_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own sync data" on public.user_sync_items;
create policy "Users update their own sync data"
  on public.user_sync_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their own sync data" on public.user_sync_items;
create policy "Users delete their own sync data"
  on public.user_sync_items for delete
  using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_sync_items'
  ) then
    alter publication supabase_realtime add table public.user_sync_items;
  end if;
end $$;

create index if not exists user_sync_items_updated_idx
  on public.user_sync_items (user_id, updated_at desc);

grant select, insert, update, delete on public.user_sync_items to authenticated;
