-- Stop repeatedly executing connectors that cannot currently produce useful
-- catalogue data. Existing movies remain untouched and the tasks can be
-- re-enabled after their source/configuration is repaired.

update public.system_brain_tasks
set enabled=false,
    status='idle',
    lease_until=null,
    next_run_at='infinity'::timestamptz,
    last_error=case task_key
      when 'catalog:cobephim-recent' then 'Paused: CobePhim discovery returns zero movie URLs'
      when 'catalog:onlyflix-recent' then 'Paused: OnlyFlix connector returns HTTP 500'
      when 'catalog:tmdb-enrichment' then 'Paused: TMDB API key/read token is not configured'
      else last_error
    end,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'paused_by_migration','20260928160000_pause_unavailable_catalog_connectors',
      'paused_at',now(),
      'data_preserved',true
    ),
    updated_at=now()
where task_key in (
  'catalog:cobephim-recent',
  'catalog:onlyflix-recent',
  'catalog:tmdb-enrichment'
);

comment on table public.system_brain_tasks is
  'Private durable queue. Unavailable connectors remain disabled without deleting their existing catalogue data.';
