revoke execute on function public.refresh_search_index_cache(integer) from public;
revoke execute on function public.refresh_search_index_cache(integer) from anon;
revoke execute on function public.refresh_search_index_cache(integer) from authenticated;
grant execute on function public.refresh_search_index_cache(integer) to service_role;
