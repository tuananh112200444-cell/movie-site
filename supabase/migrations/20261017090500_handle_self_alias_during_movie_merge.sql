begin;
set local lock_timeout='3s';set local statement_timeout='25s';
CREATE OR REPLACE FUNCTION public.merge_canonicalization_candidate(p_candidate_key text, p_canonical_movie_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
declare
  candidate public.canonicalization_candidates%rowtype;
  target public.movies%rowtype;
  source public.movies%rowtype;
  source_ids uuid[];
  source_slugs text[];
  merge_id uuid;
  table_name text;
  archived jsonb := '{}'::jsonb;
  moved jsonb := '{}'::jsonb;
  affected integer;
  conflicting_server text;
begin
  select * into candidate
  from public.canonicalization_candidates
  where candidate_key = p_candidate_key
  for update;

  if not found then raise exception 'Canonicalization candidate not found: %', p_candidate_key; end if;
  if candidate.status not in ('ready','approved','failed') then
    raise exception 'Candidate % is not mergeable (status=%)', p_candidate_key, candidate.status;
  end if;
  if candidate.confidence_tier <> 'A' and candidate.status <> 'approved' then
    raise exception 'Tier B candidate requires explicit approval: %', p_candidate_key;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('canonical-merge:' || p_candidate_key, 0));
  perform 1 from public.movies where id = any(candidate.movie_ids) order by id for update;

  select movie.* into target
  from public.movies movie
  where movie.id = any(candidate.movie_ids)
    and movie.superseded_by_movie_id is null
    and (p_canonical_movie_id is null or movie.id = p_canonical_movie_id)
  order by
    case when p_canonical_movie_id is not null and movie.id = p_canonical_movie_id then 1 else 0 end desc,
    movie.is_published desc,
    public.movie_has_usable_persisted_playback(movie.id) desc,
    coalesce(movie.current_episode, 0) desc,
    coalesce(movie.total_episodes, 0) desc,
    case when lower(concat_ws(' ', movie.source_site, movie.source_name)) ~ '(admin|supabase|blvietsub)' then 1 else 0 end desc,
    movie.created_at asc,
    movie.id
  limit 1;

  if target.id is null then raise exception 'No active canonical movie for candidate %', p_candidate_key; end if;

  select coalesce(array_agg(id order by id), array[]::uuid[]),
         coalesce(array_agg(slug order by id), array[]::text[])
  into source_ids, source_slugs
  from public.movies
  where id = any(candidate.movie_ids)
    and id <> target.id
    and superseded_by_movie_id is null;

  if cardinality(source_ids) = 0 then
    update public.canonicalization_candidates
    set status='merged', canonical_movie_id=target.id, merged_at=now(), updated_at=now(), last_error=null
    where candidate_key=p_candidate_key;
    return jsonb_build_object('success', true, 'already_merged', true, 'canonical_movie_id', target.id, 'canonical_slug', target.slug);
  end if;

  -- Revalidate current rows, not only a historical candidate label.
  for source in select * from public.movies where id=any(source_ids) loop
    if not private.strict_playback_siblings(target,source) then
      raise exception 'Unsafe identity, season or editorial state for candidate %',p_candidate_key;
    end if;
  end loop;
  if not exists(select 1 from public.runtime_capacity_state where singleton and mode='normal') then
    raise exception 'Capacity protection active';
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'success', true, 'dry_run', true, 'candidate_key', p_candidate_key,
      'canonical_movie_id', target.id, 'canonical_slug', target.slug,
      'source_movie_ids', source_ids, 'source_slugs', source_slugs,
      'confidence_tier', candidate.confidence_tier, 'evidence', candidate.evidence
    );
  end if;

  update public.canonicalization_candidates
  set status='processing', attempts=attempts+1, updated_at=now(), last_error=null
  where candidate_key=p_candidate_key;

  insert into public.canonical_merge_ledger (
    candidate_key, canonical_movie_id, source_movie_ids, canonical_slug,
    source_slugs, status, reason
  ) values (
    p_candidate_key, target.id, source_ids, target.slug,
    source_slugs, 'processing', 'verified-preserving-merge-v2'
  ) returning id into merge_id;

  insert into public.canonical_merge_archive (merge_id, table_name, source_movie_id, row_key, row_data)
  select merge_id, 'movies', movie.id, movie.id::text, to_jsonb(movie)
  from public.movies movie where movie.id = any(array_append(source_ids,target.id));

  foreach table_name in array array[
    'episodes','movie_episodes','streams','movie_sources','stream_health_logs',
    'movie_enrichment','movie_provider_coverage','movie_refresh_queue',
    'movie_search_documents','movie_seo_quality_status','movie_tmdb_enrichment_status',
    'provider_movie_identities','schedule_email_notifications','seo_url_inspections',
    'catalog_integrity_issues','subtitle_tracks','thai_bl_episodes','thai_bl_streams','watch_progress',
    'movie_slug_aliases','canonical_movie_identities','movie_watch_sessions','movie_comments',
    'movie_reviews','playback_learning_queue','player_error_events'
  ] loop
    affected := public.archive_canonical_merge_table(merge_id, table_name, array_append(source_ids,target.id));
    archived := archived || jsonb_build_object(table_name, affected);
  end loop;

  for source in
    select movie.* from public.movies movie where movie.id = any(source_ids) order by movie.id
  loop
    -- Preserve distinct URLs sharing one provider/server/episode key.
    -- Rename the donor's server consistently across all playback tables.
    for conflicting_server in
      select distinct server_name from (
        select s.server_name from public.streams s join public.streams t
          on t.movie_id=target.id and lower(trim(t.source))=lower(trim(s.source))
          and lower(trim(t.server_name))=lower(trim(s.server_name))
          and lower(trim(t.episode_slug))=lower(trim(s.episode_slug))
        where s.movie_id=source.id and
          (coalesce(s.stream_url,'')<>coalesce(t.stream_url,'') or coalesce(s.embed_url,'')<>coalesce(t.embed_url,''))
        union
        select s.server_name from public.movie_episodes s join public.movie_episodes t
          on t.movie_id=target.id and lower(trim(t.server_name))=lower(trim(s.server_name))
          and t.episode_number=s.episode_number
        where s.movie_id=source.id and
          (coalesce(s.link_m3u8,'')<>coalesce(t.link_m3u8,'') or coalesce(s.link_embed,'')<>coalesce(t.link_embed,''))
        union
        select s.server_name from public.episodes s join public.episodes t
          on t.movie_id=target.id and lower(trim(t.server_name))=lower(trim(s.server_name))
          and coalesce(t.episode_slug,'')=coalesce(s.episode_slug,'')
        where s.movie_id=source.id and
          (coalesce(s.link_m3u8,'')<>coalesce(t.link_m3u8,'') or coalesce(s.link_embed,'')<>coalesce(t.link_embed,''))
      ) conflicts
    loop
      update public.streams set server_name=left(server_name,160)||' · '||left(source.id::text,8)
        where movie_id=source.id and server_name=conflicting_server;
      update public.movie_episodes set server_name=left(server_name,160)||' · '||left(source.id::text,8)
        where movie_id=source.id and server_name=conflicting_server;
      update public.episodes set server_name=left(server_name,160)||' · '||left(source.id::text,8)
        where movie_id=source.id and server_name=conflicting_server;
    end loop;

    -- Release globally unique external identities first. The archived source
    -- record still carries their original values, so the target can adopt
    -- them later in this same transaction without a transient unique clash.
    update public.movies
    set tmdb_id=null,imdb_id='',ophim_id='',ophim_slug=null,updated_at=now()
    where id=source.id;

    update public.movies canonical
    set view=coalesce(canonical.view,0)+coalesce(source.view,0),
        title_vi = coalesce(nullif(canonical.title_vi,''), nullif(source.title_vi,''), canonical.title_vi),
        title_en = coalesce(nullif(canonical.title_en,''), nullif(source.title_en,''), canonical.title_en),
        title_original = coalesce(nullif(canonical.title_original,''), nullif(source.title_original,''), canonical.title_original),
        origin_name = coalesce(nullif(canonical.origin_name,''), nullif(source.origin_name,''), canonical.origin_name),
        content = case when length(coalesce(source.content,'')) > length(coalesce(canonical.content,'')) then source.content else canonical.content end,
        thumb_url = coalesce(nullif(canonical.thumb_url,''), nullif(source.thumb_url,''), canonical.thumb_url),
        poster_url = coalesce(nullif(canonical.poster_url,''), nullif(source.poster_url,''), canonical.poster_url),
        backdrop_url = coalesce(nullif(canonical.backdrop_url,''), nullif(source.backdrop_url,''), canonical.backdrop_url),
        trailer_url = coalesce(nullif(canonical.trailer_url,''), nullif(source.trailer_url,''), canonical.trailer_url),
        tmdb_id = coalesce(canonical.tmdb_id, source.tmdb_id),
        imdb_id = coalesce(nullif(canonical.imdb_id,''), nullif(source.imdb_id,''), canonical.imdb_id),
        ophim_id = coalesce(nullif(canonical.ophim_id,''), nullif(source.ophim_id,''), canonical.ophim_id),
        ophim_slug = coalesce(nullif(canonical.ophim_slug,''), nullif(source.ophim_slug,''), canonical.ophim_slug),
        current_episode = greatest(coalesce(canonical.current_episode,0), coalesce(source.current_episode,0)),
        total_episodes = greatest(coalesce(canonical.total_episodes,0), coalesce(source.total_episodes,0)),
        episode_current = case when coalesce(source.current_episode,0) > coalesce(canonical.current_episode,0) then source.episode_current else canonical.episode_current end,
        episode_total = case when coalesce(source.total_episodes,0) > coalesce(canonical.total_episodes,0) then source.episode_total else canonical.episode_total end,
        category = case when coalesce(jsonb_array_length(canonical.category),0)=0 then source.category else canonical.category end,
        country = case when coalesce(jsonb_array_length(canonical.country),0)=0 then source.country else canonical.country end,
        season_number = coalesce(canonical.season_number, source.season_number, candidate.season_number),
        canonical_identity_key = coalesce(canonical.canonical_identity_key,
          public.canonical_identity_fingerprint(coalesce(canonical.tmdb_id,source.tmdb_id),
            coalesce(canonical.imdb_id,source.imdb_id), candidate.identity_value,
            candidate.release_year, candidate.movie_type, candidate.season_number)),
        canonicalized_at = now(), updated_at = now()
    where canonical.id = target.id;

    update public.streams target_stream
    set is_active=coalesce(target_stream.is_active,false) or coalesce(source_stream.is_active,false),
        stream_url = case when coalesce(source_stream.playback_score,0) > coalesce(target_stream.playback_score,0) then source_stream.stream_url else target_stream.stream_url end,
        embed_url = case when coalesce(source_stream.playback_score,0) > coalesce(target_stream.playback_score,0) then source_stream.embed_url else target_stream.embed_url end,
        subtitle_url = coalesce(nullif(target_stream.subtitle_url,''), nullif(source_stream.subtitle_url,''), target_stream.subtitle_url),
        health_status = case when coalesce(source_stream.playback_score,0) > coalesce(target_stream.playback_score,0) then source_stream.health_status else target_stream.health_status end,
        playback_score = greatest(coalesce(target_stream.playback_score,0), coalesce(source_stream.playback_score,0)),
        failure_count = least(coalesce(target_stream.failure_count,0), coalesce(source_stream.failure_count,0)),
        last_checked_at = greatest(target_stream.last_checked_at, source_stream.last_checked_at),
        updated_at = now()
    from public.streams source_stream
    where source_stream.movie_id = source.id and target_stream.movie_id = target.id
      and lower(trim(target_stream.source)) = lower(trim(source_stream.source))
      and lower(trim(target_stream.server_name)) = lower(trim(source_stream.server_name))
      and lower(trim(target_stream.episode_slug)) = lower(trim(source_stream.episode_slug));

    delete from public.streams source_stream
    using public.streams target_stream
    where source_stream.movie_id=source.id and target_stream.movie_id=target.id
      and lower(trim(source_stream.source))=lower(trim(target_stream.source))
      and lower(trim(source_stream.server_name))=lower(trim(target_stream.server_name))
      and lower(trim(source_stream.episode_slug))=lower(trim(target_stream.episode_slug));
    update public.streams set movie_id=target.id, updated_at=now() where movie_id=source.id;

    delete from public.movie_episodes source_row using public.movie_episodes target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and lower(trim(source_row.server_name))=lower(trim(target_row.server_name))
      and source_row.episode_number=target_row.episode_number;
    update public.movie_episodes set movie_id=target.id, updated_at=now() where movie_id=source.id;

    delete from public.episodes source_row using public.episodes target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and lower(trim(source_row.server_name))=lower(trim(target_row.server_name))
      and lower(trim(coalesce(source_row.episode_slug,'')))=lower(trim(coalesce(target_row.episode_slug,'')));
    update public.episodes set movie_id=target.id where movie_id=source.id;

    delete from public.movie_sources source_row using public.movie_sources target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and lower(trim(source_row.source_name))=lower(trim(target_row.source_name))
      and lower(trim(source_row.source_movie_id))=lower(trim(target_row.source_movie_id));
    update public.movie_sources set movie_id=target.id, updated_at=now() where movie_id=source.id;

    update public.stream_health_logs set movie_id=target.id where movie_id=source.id;
    update public.subtitle_tracks set movie_id=target.id where movie_id=source.id;

    update public.watch_progress t set progress_seconds=greatest(t.progress_seconds,s.progress_seconds),
      duration_seconds=greatest(t.duration_seconds,s.duration_seconds)
    from public.watch_progress s where s.movie_id=source.id and t.movie_id=target.id and s.episode_slug=t.episode_slug;
    update public.movie_watch_sessions set movie_id=target.id where movie_id=source.id;
    update public.movie_comments set movie_slug=target.slug where movie_slug=source.slug;
    delete from public.movie_slug_aliases where movie_id=source.id and alias_slug=target.slug;
    update public.movie_slug_aliases set movie_id=target.id,canonical_slug=target.slug,updated_at=now() where movie_id=source.id;

    delete from public.watch_progress source_row using public.watch_progress target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and source_row.episode_slug=target_row.episode_slug;
    update public.watch_progress set movie_id=target.id where movie_id=source.id;

    delete from public.schedule_email_notifications source_row using public.schedule_email_notifications target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and source_row.target_episode_number=target_row.target_episode_number
      and source_row.target_at=target_row.target_at
      and lower(source_row.recipient_email)=lower(target_row.recipient_email);
    update public.schedule_email_notifications set movie_id=target.id, movie_slug=target.slug where movie_id=source.id;

    update public.provider_movie_identities set movie_id=target.id where movie_id=source.id;
    update public.canonical_movie_identities set movie_id=target.id, updated_at=now() where movie_id=source.id;
    update public.catalog_integrity_issues set movie_id=target.id where movie_id=source.id;
    update public.catalog_integrity_issues set related_movie_id=target.id where related_movie_id=source.id;
    update public.seo_url_inspections set movie_id=target.id where movie_id=source.id;

    delete from public.movie_enrichment where movie_id=source.id;
    delete from public.movie_provider_coverage where movie_id=source.id;
    delete from public.movie_refresh_queue where movie_id=source.id;
    delete from public.movie_search_documents where movie_id=source.id;
    delete from public.movie_seo_quality_status where movie_id=source.id;
    delete from public.movie_tmdb_enrichment_status where movie_id=source.id;

    delete from public.playback_learning_queue source_row using public.playback_learning_queue target_row
    where source_row.movie_slug=source.slug and target_row.movie_slug=target.slug
      and source_row.episode_slug=target_row.episode_slug and source_row.source_host=target_row.source_host;
    update public.playback_learning_queue set movie_slug=target.slug where movie_slug=source.slug;
    update public.player_error_events set movie_slug=target.slug where movie_slug=source.slug;

    if exists (select 1 from public.movie_reviews where slug=source.slug) then
      if exists (select 1 from public.movie_reviews where slug=target.slug) then
        null; -- retain the second editorial article on its original alias
      else
        update public.movie_reviews set slug=target.slug where slug=source.slug;
      end if;
    end if;

    insert into public.movie_slug_aliases(alias_slug,movie_id,canonical_slug,reason,updated_at)
    values(source.slug,target.id,target.slug,'canonical-identity-v1',now())
    on conflict(alias_slug) do update set movie_id=excluded.movie_id,
      canonical_slug=excluded.canonical_slug, reason=excluded.reason, updated_at=now();

    update public.movies
    set is_published=false, seo_catalog_status='superseded', superseded_by_movie_id=target.id,
        source_site='merged', source_name='Merged into '||target.slug,
        tmdb_id=null, imdb_id='', ophim_id='', ophim_slug=null,
        canonicalized_at=now(), updated_at=now()
    where id=source.id;
  end loop;

  update public.canonical_movie_identities set movie_id=target.id, updated_at=now()
  where identity_key = public.canonical_identity_fingerprint(
    target.tmdb_id,target.imdb_id,candidate.identity_value,candidate.release_year,
    candidate.movie_type,candidate.season_number
  );

  perform public.refresh_movie_provider_coverage(array[target.id]);
  perform public.enqueue_movie_refresh(target.id, 'canonical_movies_merged');
  delete from public.movie_api_cache where slug=target.slug or slug=any(source_slugs);
  delete from public.home_page_cache where id <> '__never__';

  update public.catalog_integrity_issues
  set status='resolved', resolved_at=now(), last_error=null
  where issue_type='split_provider_coverage'
    and (movie_id=target.id or related_movie_id=target.id)
    and evidence->>'candidate_key'=p_candidate_key;

  update public.canonicalization_candidates
  set status='merged', canonical_movie_id=target.id, merged_at=now(), updated_at=now(), last_error=null
  where candidate_key=p_candidate_key;

  update public.canonical_merge_ledger
  set status='completed', completed_at=now(), summary=jsonb_build_object(
    'archived_rows',archived,'source_count',cardinality(source_ids),
    'canonical_movie_id',target.id,'canonical_slug',target.slug
  ) where id=merge_id;

  return jsonb_build_object(
    'success',true,'merge_id',merge_id,'candidate_key',p_candidate_key,
    'canonical_movie_id',target.id,'canonical_slug',target.slug,
    'source_movie_ids',source_ids,'source_slugs',source_slugs,'archived_rows',archived
  );
exception when others then
  if merge_id is not null then
    update public.canonical_merge_ledger set status='failed',error_message=sqlerrm,completed_at=now() where id=merge_id;
  end if;
  update public.canonicalization_candidates set status='failed',last_error=sqlerrm,updated_at=now()
  where candidate_key=p_candidate_key;
  raise;
end;
$function$
;

commit;
