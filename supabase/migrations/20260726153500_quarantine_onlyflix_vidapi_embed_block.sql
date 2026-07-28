update public.streams
set
  is_active = false,
  health_status = 'failed',
  failure_count = greatest(coalesce(failure_count, 0), 3),
  last_error = 'Provider blocks cross-origin embedding on KhoPhim'
where source = 'onlyflix'
  and (
    server_name ~* 'vidapi\.xyz'
    or embed_url ~* '^https://vidapi\.xyz/'
  );
