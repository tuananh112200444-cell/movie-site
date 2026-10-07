begin;

do $$
begin
  if not exists (
    select 1 from public.movies
    where id = '11d3ec2c-1621-4a77-b786-78c6cf895bb1'::uuid
      and slug = 'quy-quyet-6-ranh-gioi-vo-dinh'
      and origin_name = 'Insidious: Out of the Further'
      and year = 2026
      and is_published = true
  ) then
    raise exception 'Verified Quỷ Quyệt canonical movie is unavailable';
  end if;
  if (
    select count(distinct provider)
    from public.provider_movie_identities
    where movie_id = '11d3ec2c-1621-4a77-b786-78c6cf895bb1'::uuid
      and provider_slug in ('quy-quyet-ranh-gioi-vo-dinh', 'quy-quyet-6-ranh-gioi-vo-dinh')
  ) < 2 then
    raise exception 'Provider identity evidence for Quỷ Quyệt is incomplete';
  end if;
  if exists (
    select 1 from public.movie_slug_aliases
    where alias_slug = 'quy-quyet-ranh-gioi-vo-dinh'
      and movie_id <> '11d3ec2c-1621-4a77-b786-78c6cf895bb1'::uuid
  ) then
    raise exception 'Quỷ Quyệt alias already belongs to another movie';
  end if;
end $$;

insert into public.movie_slug_aliases (alias_slug, movie_id, canonical_slug, reason)
values (
  'quy-quyet-ranh-gioi-vo-dinh',
  '11d3ec2c-1621-4a77-b786-78c6cf895bb1'::uuid,
  'quy-quyet-6-ranh-gioi-vo-dinh',
  'verified-provider-identity-playback'
)
on conflict (alias_slug) do nothing;

delete from public.movie_api_cache
where slug = 'quy-quyet-ranh-gioi-vo-dinh';

commit;
