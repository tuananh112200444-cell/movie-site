begin;

alter table public.movie_seo_profiles
  add column if not exists quality_rules_version integer not null default 1,
  add column if not exists quality_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists intent_map jsonb not null default '{}'::jsonb,
  add column if not exists content_fingerprint text,
  add column if not exists quality_evaluated_at timestamptz;

alter table public.movie_seo_profile_drafts
  add column if not exists quality_rules_version integer not null default 1,
  add column if not exists quality_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists intent_map jsonb not null default '{}'::jsonb,
  add column if not exists content_fingerprint text,
  add column if not exists quality_evaluated_at timestamptz;

alter table public.movie_seo_profiles
  drop constraint if exists movie_seo_profiles_quality_rules_version_check;
alter table public.movie_seo_profiles
  add constraint movie_seo_profiles_quality_rules_version_check
  check (quality_rules_version >= 1);

alter table public.movie_seo_profile_drafts
  drop constraint if exists movie_seo_profile_drafts_quality_rules_version_check;
alter table public.movie_seo_profile_drafts
  add constraint movie_seo_profile_drafts_quality_rules_version_check
  check (quality_rules_version >= 1);

create index if not exists movie_seo_profiles_quality_version_idx
  on public.movie_seo_profiles(status, index_mode, quality_rules_version, validation_score desc);
create index if not exists movie_seo_profiles_content_fingerprint_idx
  on public.movie_seo_profiles(content_fingerprint)
  where content_fingerprint is not null;

comment on column public.movie_seo_profiles.quality_rules_version is
  'Version of the SEO quality contract used for the latest editorial evaluation. Stored scores must never be treated as current when this version is stale.';
comment on column public.movie_seo_profiles.quality_breakdown is
  'Separate technical, search-intent, originality, trust and discovery scores for auditability.';
comment on column public.movie_seo_profiles.intent_map is
  'Verified per-movie intent clusters: aliases, watch, entities, topics and observed Search Console demand.';
comment on column public.movie_seo_profiles.content_fingerprint is
  'Deterministic fingerprint used to detect repeated or stale editorial output.';

commit;
