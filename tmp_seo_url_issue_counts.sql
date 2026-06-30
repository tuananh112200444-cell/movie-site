with published as (
  select id, slug, name, poster_url, thumb_url, content, episode_current, current_episode, total_episodes, trailer_url, seo_catalog_status, updated_at
  from movies
  where is_published = true and slug is not null
), episode_counts as (
  select movie_id, count(*) as episodes
  from episodes
  where coalesce(link_m3u8, link_embed, '') <> ''
  group by movie_id
), classified as (
  select p.*, coalesce(e.episodes, 0) as playable_episodes,
         length(coalesce(regexp_replace(p.content, '<[^>]+>', '', 'g'), '')) as content_len,
         case
           when coalesce(e.episodes,0) = 0 and coalesce(p.current_episode,0) >= 1 then 'badge_has_episode_but_no_playable'
           when coalesce(e.episodes,0) = 0 and nullif(trim(coalesce(p.trailer_url,'')), '') is null and length(coalesce(regexp_replace(p.content, '<[^>]+>', '', 'g'), '')) < 80 then 'thin_no_episode_no_trailer'
           else 'ok'
         end as issue
  from published p left join episode_counts e on e.movie_id = p.id
)
select issue, count(*)::int as count
from classified
group by issue
order by count desc;
