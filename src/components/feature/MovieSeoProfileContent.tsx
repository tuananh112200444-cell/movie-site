import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '@/components/base/SEO';
import {
  getIncomingSeoTopicLinks,
  getPublishedSeoProfile,
  type PublishedSeoProfile,
  type SeoIncomingTopicLink,
} from '@/services/seoStudioService';

interface Props {
  slug: string;
  movieName: string;
  defaultNoIndex: boolean;
  initialProfile?: PublishedSeoProfile | null;
}

export default function MovieSeoProfileContent({ slug, movieName, defaultNoIndex, initialProfile = null }: Props) {
  const [profile, setProfile] = useState<PublishedSeoProfile | null>(initialProfile);
  const [incomingLinks, setIncomingLinks] = useState<SeoIncomingTopicLink[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([getPublishedSeoProfile(slug), getIncomingSeoTopicLinks(slug)])
      .then(([result, incoming]) => {
        if (!active) return;
        setProfile(result ?? initialProfile);
        setIncomingLinks(incoming);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [initialProfile, slug]);

  // The public static document is the source of truth for indexability.
  // A pending audit means "verify this release", not "remove a previously
  // approved editorial page from Google". Never let hydration silently
  // replace an indexable server response with a noindex meta tag.
  const effectiveNoIndex = !profile
    ? defaultNoIndex
    : defaultNoIndex || profile.index_mode !== 'index' || profile.validation_score < 85;

  const faqSchema = useMemo(() => {
    if (!profile?.faq?.length) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: profile.faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    };
  }, [profile?.faq]);

  if (!profile && incomingLinks.length === 0) return null;

  return (
    <>
      {profile && <SEO
        title={profile.seo_title}
        description={profile.meta_description}
        canonical={profile.canonical_path || `/phim/${slug}`}
        ogImage={profile.og_image_url || undefined}
        ogType="video.movie"
        noIndex={effectiveNoIndex}
        updatedAt={profile.updated_at}
        preserveSchema
      />}
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />}

      {(Boolean(profile?.intro_content?.trim()) || Boolean(profile?.review_content?.trim()) || (profile?.topic_links?.length ?? 0) > 0 || (profile?.faq?.length ?? 0) > 0 || incomingLinks.length > 0) && (
        <section className="mt-6 space-y-6 rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-5 md:p-7" aria-label={`Khám phá thêm về ${movieName}`}>
          {profile?.intro_content?.trim() && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="h-5 w-1 rounded-full bg-red-500" />
                <h2 className="text-base font-bold text-white">Giới thiệu {movieName}</h2>
              </div>
              <p className="whitespace-pre-line text-sm leading-7 text-white/55">{profile.intro_content.trim()}</p>
            </div>
          )}

          {profile?.review_content?.trim() && (
            <div className={profile?.intro_content?.trim() ? 'border-t border-white/[0.06] pt-5' : ''}>
              <h2 className="mb-3 text-base font-bold text-white">Đánh giá {movieName}</h2>
              <p className="whitespace-pre-line text-sm leading-7 text-white/55">{profile.review_content.trim()}</p>
            </div>
          )}

          {(profile?.topic_links?.length ?? 0) > 0 && (
            <div className={(profile?.intro_content?.trim() || profile?.review_content?.trim()) ? 'border-t border-white/[0.06] pt-5' : ''}>
              <div className="mb-4 flex items-center gap-3">
                <div className="h-5 w-1 rounded-full bg-cyan-500" />
                <h2 className="text-base font-bold text-white">Khám phá thêm về {movieName}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {profile?.topic_links.map((item) => (
                  <Link key={item.url} to={item.url} className="group rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-cyan-500/25 hover:bg-cyan-500/[0.04]">
                    <span className="text-sm font-semibold text-white/80 transition group-hover:text-cyan-300">{item.anchor || item.title}</span>
                    {item.description && <span className="mt-1.5 block text-xs leading-5 text-white/35">{item.description}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {incomingLinks.length > 0 && (
            <div className={profile?.topic_links?.length ? 'border-t border-white/[0.06] pt-5' : ''}>
              <h2 className="mb-3 text-base font-bold text-white">Phim liên kết trong cùng chủ đề</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {incomingLinks.map((item) => (
                  <Link key={`${item.source_slug}-${item.target_path}`} to={`/phim/${item.source_slug}`} className="group rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-cyan-500/25 hover:bg-cyan-500/[0.04]">
                    <span className="text-sm font-semibold text-white/80 transition group-hover:text-cyan-300">{item.anchor || item.title}</span>
                    {item.description && <span className="mt-1.5 block text-xs leading-5 text-white/35">{item.description}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {(profile?.faq?.length ?? 0) > 0 && (
            <div className="border-t border-white/[0.06] pt-5">
              <h2 className="mb-3 text-base font-bold text-white">Câu hỏi thường gặp về {movieName}</h2>
              <div className="space-y-2">
                {profile?.faq.map((item, index) => (
                  <details key={`${item.question}-${index}`} className="group rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-white/75">{item.question}<i className="ri-arrow-down-s-line float-right text-white/30 transition group-open:rotate-180" /></summary>
                    <p className="mt-3 border-t border-white/[0.05] pt-3 text-sm leading-7 text-white/55">{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
