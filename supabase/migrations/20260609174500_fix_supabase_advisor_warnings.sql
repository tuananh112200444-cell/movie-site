-- Address Supabase advisor warnings after sync/dedup hardening.

alter function public.get_server_now()
  set search_path = public;

revoke execute on function public.invoke_kisskh_latest_sync() from anon, authenticated;
revoke execute on function public.invoke_kisskh_library_backfill() from anon, authenticated;

drop policy if exists home_cache_select_all on public.home_page_cache;
drop policy if exists "Allow anon reads on cache" on public.movie_api_cache;

drop index if exists public.idx_home_cache_expires;
drop index if exists public.idx_movie_api_cache_expires;
drop index if exists public.idx_sync_logs_function;
