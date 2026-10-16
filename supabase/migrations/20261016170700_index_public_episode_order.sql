-- Match the complete ordering used by public series/episode listing requests.
create index concurrently if not exists movies_public_episode_order_idx
  on public.movies (last_episode_change_at desc nulls last, created_at desc nulls last, id desc)
  where is_published = true;
