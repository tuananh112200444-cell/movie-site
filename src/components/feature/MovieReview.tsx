import { useState, useEffect } from 'react';
import { getReview } from '@/services/reviewService';
import type { MovieReview } from '@/services/reviewService';

interface MovieReviewProps {
  slug: string;
  movieName: string;
  originName?: string;
  year?: number;
  genres?: string[];
  posterUrl?: string;
}

export default function MovieReviewSection({ slug, movieName, originName, year, genres, posterUrl }: MovieReviewProps) {
  const [review, setReview] = useState<MovieReview | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getReview(slug).then((r) => {
      setReview(r);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [slug]);

  if (!loaded || !review) return null;

  const paragraphs = review.content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const previewParagraphs = paragraphs.slice(0, 3);
  const restParagraphs = paragraphs.slice(3);
  const hasMore = restParagraphs.length > 0;

  // Schema.org Article + Review markup
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Review phim ${movieName}${originName ? ` (${originName})` : ''}${year ? ` ${year}` : ''} - Đánh giá chi tiết`,
    description: paragraphs[0]?.slice(0, 200) ?? `Bài review chi tiết phim ${movieName}`,
    articleBody: review.content,
    wordCount: review.wordCount,
    datePublished: review.generatedAt,
    dateModified: review.updatedAt,
    author: { '@type': 'Organization', name: 'KhoPhim', url: 'https://khophim.org' },
    publisher: {
      '@type': 'Organization',
      name: 'KhoPhim',
      url: 'https://khophim.org',
      logo: { '@type': 'ImageObject', url: 'https://khophim.org/logo.png' },
    },
    about: {
      '@type': 'Movie',
      name: movieName,
      ...(originName ? { alternateName: originName } : {}),
      ...(year ? { datePublished: String(year) } : {}),
      ...(genres?.length ? { genre: genres } : {}),
      ...(posterUrl ? { image: posterUrl } : {}),
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://khophim.org/blog/review-${slug}`,
    },
    inLanguage: 'vi',
    keywords: [
      `review phim ${movieName}`,
      `đánh giá ${movieName}`,
      `${movieName} có hay không`,
      `phim ${movieName} review`,
      ...(originName ? [`review ${originName}`] : []),
      ...(genres ?? []),
    ].join(', '),
  };

  const reviewSchema = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    name: `Review phim ${movieName}`,
    reviewBody: review.content.slice(0, 500),
    reviewRating: {
      '@type': 'Rating',
      ratingValue: '8',
      bestRating: '10',
      worstRating: '1',
    },
    author: { '@type': 'Organization', name: 'KhoPhim' },
    itemReviewed: {
      '@type': 'Movie',
      name: movieName,
      ...(originName ? { alternateName: originName } : {}),
      ...(year ? { datePublished: String(year) } : {}),
    },
    datePublished: review.updatedAt,
    publisher: { '@type': 'Organization', name: 'KhoPhim' },
  };

  return (
    <>
      {/* Schema JSON-LD — Google đọc được dù JS chạy sau */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewSchema) }}
      />

      <article
        className="mt-6 rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-5 md:p-7"
        aria-label={`Review phim ${movieName}`}
        itemScope
        itemType="https://schema.org/Article"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1 h-5 bg-violet-500 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base" itemProp="headline">
              Review Phim <strong className="text-violet-400">{movieName}</strong>
              {originName && <span className="text-white/30 font-normal text-sm ml-1.5">({originName})</span>}
            </h3>
            <p className="text-white/30 text-xs mt-0.5 flex items-center gap-1.5">
              <i className="ri-quill-pen-line" />
              <span itemProp="wordCount">{review.wordCount}</span> từ
              <span className="text-white/15">·</span>
              <time itemProp="dateModified" dateTime={review.updatedAt}>
                Cập nhật {new Date(review.updatedAt).toLocaleDateString('vi-VN')}
              </time>
            </p>
          </div>
          {/* Rating stars */}
          <div className="flex items-center gap-1.5 flex-shrink-0" itemScope itemType="https://schema.org/Rating">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <i key={star} className="ri-star-fill text-amber-400 text-sm" />
              ))}
            </div>
            <span className="text-amber-400/70 text-xs font-medium" itemProp="ratingValue">8</span>
            <span className="text-white/20 text-xs">/10</span>
          </div>
        </div>

        {/* Content — itemProp articleBody cho Google */}
        <div
          className="text-white/65 text-sm leading-[1.85] space-y-4"
          itemProp="articleBody"
        >
          {previewParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}

          {hasMore && expanded && restParagraphs.map((p, i) => (
            <p key={`rest-${i}`}>{p}</p>
          ))}

          {/* Gradient fade khi chưa expand */}
          {hasMore && !expanded && (
            <div className="relative h-8 -mt-2">
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0d0f18] to-transparent pointer-events-none" />
            </div>
          )}
        </div>

        {hasMore && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors cursor-pointer mt-3"
          >
            <i className={expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
            {expanded ? 'Thu gọn' : `Đọc tiếp (${restParagraphs.length} đoạn nữa)`}
          </button>
        )}

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-white/[0.05] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center rounded-full bg-violet-500/20">
              <i className="ri-quill-pen-line text-violet-400 text-xs" />
            </div>
            <p className="text-white/25 text-xs" itemProp="author" itemScope itemType="https://schema.org/Organization">
              Bài review bởi <span itemProp="name" className="text-white/40">KhoPhim</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {genres && genres.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {genres.slice(0, 3).map((g) => (
                  <span key={g} className="text-[10px] text-violet-400/60 bg-violet-500/8 border border-violet-500/15 px-2 py-0.5 rounded-full">
                    {g}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 text-white/20 text-xs">
              <i className="ri-shield-check-line" />
              Nội dung gốc
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
