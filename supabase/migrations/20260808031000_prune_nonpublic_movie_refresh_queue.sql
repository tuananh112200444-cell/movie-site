-- Queue entries for unpublished or deleted movies can never improve a public
-- page, yet they consume the same off-peak capacity as current releases.
-- Prune them once and reject future non-public enqueue attempts. Publishing a
-- movie later changes is_published and enqueues it again through the trigger.

create or replace function public.enqueue_movie_refresh(
  p_movie_id uuid,
  p_reason text default 'data_changed'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_movie_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.movies m
    where m.id = p_movie_id
      and m.is_published is true
  ) then
    delete from public.movie_refresh_queue where movie_id = p_movie_id;
    return;
  end if;

  insert into public.movie_refresh_queue as q (
    movie_id, requested_at, next_attempt_at, reasons, attempts, last_error
  ) values (
    p_movie_id, now(), now(), array[coalesce(nullif(p_reason, ''), 'data_changed')], 0, null
  )
  on conflict (movie_id) do update set
    requested_at = excluded.requested_at,
    next_attempt_at = least(q.next_attempt_at, now()),
    reasons = (
      select coalesce(array_agg(distinct reason), '{}'::text[])
      from unnest(q.reasons || excluded.reasons) as reason
    ),
    attempts = 0,
    last_error = null;
end;
$$;

delete from public.movie_refresh_queue q
where not exists (
  select 1
  from public.movies m
  where m.id = q.movie_id
    and m.is_published is true
);

comment on function public.enqueue_movie_refresh(uuid, text) is
  'Queues only public movies; unpublished/deleted movie work is discarded because publishing later enqueues a fresh authoritative update.';
