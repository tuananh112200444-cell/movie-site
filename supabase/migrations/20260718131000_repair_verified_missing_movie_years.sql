-- Years below were verified from explicit titles or TMDB search results.
-- Retire two unpublished TMDB catalog placeholders before assigning their IDs
-- to the playable canonical records. Preserve their old slugs as aliases.
update public.movies set tmdb_id=null, source_site='merged', source_name='Merged into the-first-jasmine-mo-li', updated_at=now()
where id='28875a00-bfcf-4f3f-87e0-b7da6762e131' and is_published=false;
insert into public.movie_slug_aliases(alias_slug,movie_id,canonical_slug,reason)
values('the-first-jasmine-2026','3e11b7d1-da2a-4328-ac98-834cf01f2341','the-first-jasmine-mo-li','tmdb-catalog-canonicalization')
on conflict(alias_slug) do update set movie_id=excluded.movie_id,canonical_slug=excluded.canonical_slug,reason=excluded.reason,updated_at=now();
update public.movies set tmdb_id=null, source_site='merged', source_name='Merged into ashes-to-crown', updated_at=now()
where id='7acffa75-7449-431d-ba2f-19387255e0b8' and is_published=false;
insert into public.movie_slug_aliases(alias_slug,movie_id,canonical_slug,reason)
values('ashes-to-crown-2026','7968c913-5e87-45bb-940a-ee88720f550c','ashes-to-crown','tmdb-catalog-canonicalization')
on conflict(alias_slug) do update set movie_id=excluded.movie_id,canonical_slug=excluded.canonical_slug,reason=excluded.reason,updated_at=now();

update public.movies set year=2026, updated_at=now()
where id='2ea27914-f489-4fb4-99c6-0e6b6450a8ee' and (year is null or year<1900);
update public.movies set year=2023, tmdb_id=coalesce(tmdb_id,226476), updated_at=now()
where id='dfaff15d-7660-4979-946f-27d2ec67564d' and (year is null or year<1900);
update public.movies set year=2026, tmdb_id=coalesce(tmdb_id,1461254), updated_at=now()
where id='037d5b12-1c2e-41c8-8f5d-80df75ddd511' and (year is null or year<1900);
update public.movies set year=2026, updated_at=now()
where id='6fc76d41-73f0-4931-acc9-f6b744cebf97' and (year is null or year<1900);
update public.movies set year=2026, tmdb_id=coalesce(tmdb_id,292696), updated_at=now()
where id='3e11b7d1-da2a-4328-ac98-834cf01f2341' and (year is null or year<1900);
update public.movies set year=2026, tmdb_id=coalesce(tmdb_id,289271), updated_at=now()
where id='7968c913-5e87-45bb-940a-ee88720f550c' and (year is null or year<1900);

delete from public.movie_api_cache where slug in (
  'teach-you-a-lesson-2026','lai-gap-hai-anh-ay','salmokji-whispering-water',
  'dazzling-2026','the-first-jasmine-mo-li','ashes-to-crown'
);
delete from public.home_page_cache where id <> '__never__';
