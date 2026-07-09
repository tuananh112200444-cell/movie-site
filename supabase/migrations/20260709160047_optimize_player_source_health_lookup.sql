create index if not exists player_error_events_recent_source_health_idx
  on public.player_error_events (created_at desc, event_type, source_host)
  where source_host is not null;

create index if not exists player_error_events_recent_critical_idx
  on public.player_error_events (created_at desc, source_host, server_name, player_mode)
  where source_host is not null
    and event_type in (
      'stall_fatal',
      'hls_fatal',
      'direct_video_error',
      'native_hls_error',
      'iframe_blocked',
      'stall_recovery',
      'hls_retry',
      'hls_fatal_retry',
      'hls_media_retry'
    );
