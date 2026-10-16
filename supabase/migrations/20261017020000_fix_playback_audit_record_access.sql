-- Correct PL/pgSQL composite-record access in the changed-movie audit queue.
begin;set local lock_timeout='3s';set local statement_timeout='20s';
CREATE OR REPLACE FUNCTION public.process_movie_playback_audit_queue(p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  item record;
  batch_limit integer := greatest(1, least(coalesce(p_limit, 8), 20));
  processed integer := 0;
  quarantined integer := 0;
  usable boolean;
  preview boolean;
begin
  for item in
    select queue.movie_id, queue.attempts, movie as movie_row
    from public.movie_playback_audit_queue queue
    join public.movies movie on movie.id = queue.movie_id
    where queue.next_attempt_at <= now()
    order by queue.requested_at
    for update of queue skip locked
    limit batch_limit
  loop
    begin
      preview := public.movie_is_preview_only(item.movie_row);
      usable := public.movie_has_usable_persisted_playback(item.movie_id);

      if (item.movie_row).is_published is true and not preview and not usable then
        insert into public.catalog_integrity_issues as issue (
          issue_key, issue_type, movie_id, severity, confidence, status,
          evidence, first_detected_at, last_detected_at, resolved_at, attempts, last_error
        ) values (
          'published_without_playback:' || item.movie_id,
          'published_without_playback', item.movie_id, 5, 0.9990, 'open',
          jsonb_build_object('slug', (item.movie_row).slug, 'detector', 'changed_movie_queue_v1'),
          now(), now(), null, 0, 'No usable persisted playback candidate; provider verification required'
        )
        on conflict (issue_key) do update set
          status = 'open', severity = 5, confidence = 0.9990,
          evidence = issue.evidence || excluded.evidence,
          last_detected_at = now(), resolved_at = null, last_error = excluded.last_error;

        -- A database candidate check is not a browser playback proof. Record
        -- the issue for provider verification, but never hide a whole movie
        -- or erase its advertised episode count from one server-side verdict.
        quarantined := quarantined + 1;
      elsif usable then
        update public.catalog_integrity_issues
        set status = 'resolved', resolved_at = now(), last_detected_at = now(), last_error = null
        where issue_key = 'published_without_playback:' || item.movie_id
          and status in ('open', 'repairing');
      end if;

      delete from public.movie_playback_audit_queue where movie_id = item.movie_id;
      processed := processed + 1;
    exception when others then
      update public.movie_playback_audit_queue
      set attempts = attempts + 1,
          next_attempt_at = now() + make_interval(mins => least(240, 5 * (attempts + 1))),
          last_error = left(sqlerrm, 500)
      where movie_id = item.movie_id;
    end;
  end loop;

  if quarantined > 0 then
    update public.home_page_cache set expires_at = now();
  end if;
  return jsonb_build_object('processed', processed, 'quarantined', 0, 'needs_verification', quarantined);
end;
$function$
;
commit;
