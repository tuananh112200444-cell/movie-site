import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import SEO, { SITE_URL } from '@/components/base/SEO';
import type { MovieDetail } from '@/types/movie';
import { getPosterUrl, getThumbUrl, getMovieDisplayName } from '@/services/movieApi';
import MovieCountdown from '@/components/base/MovieCountdown';

interface Props {
  movie: MovieDetail;
  slug: string;
  favored: boolean;
  isTrailerOnly: boolean;
  hasEpisodes: boolean;
  onFavToggle: () => void;
  onWatchNow: () => void;
}

const countryPathMap: Record<string, string> = {
  'han-quoc': '/phim-han-quoc',
  'trung-quoc': '/phim-trung-quoc',
  'au-my': '/phim-au-my',
  'nhat-ban': '/phim-nhat-ban',
  'thai-lan': '/phim-thai-lan',
  'viet-nam': '/phim-viet-nam',
};

function MobileMovieInfo({ movie }: { movie: MovieDetail }) {
  const [open, setOpen] = useState(false);

  const items = useMemo(() => [
    movie.director?.filter(Boolean).length > 0 && {
      label: 'Đạo diễn', value: movie.director.filter(Boolean).join(', '), icon: 'ri-user-star-line',
    },
    movie.actor?.filter(Boolean).length > 0 && {
      label: 'Diễn viên', value: movie.actor.filter(Boolean).slice(0, 4).join(', ')
        + (movie.actor.filter(Boolean).length > 4 ? ` +${movie.actor.filter(Boolean).length - 4}` : ''),
      icon: 'ri-group-line',
    },
    movie.category?.length > 0 && {
      label: 'Thể loại', value: (
        <span className="flex gap-1 flex-wrap">
          {movie.category.map((c) => (
            <Link key={c.slug} to={`/the-loai/${c.slug}`} className="text-red-400 hover:underline">{c.name}</Link>
          ))}
        </span>
      ), icon: 'ri-price-tag-3-line',
    },
    movie.country?.length > 0 && {
      label: 'Quốc gia', value: (
        <span className="flex gap-1 flex-wrap">
          {movie.country.map((c) => {
            const to = countryPathMap[c.slug] ?? `/filter?country=${c.slug}`;
            return <Link key={c.slug} to={to} className="text-red-400 hover:underline">{c.name}</Link>;
          })}
        </span>
      ), icon: 'ri-map-pin-line',
    },
    movie.episode_total && {
      label: 'Số tập', value: `${movie.episode_total} tập`, icon: 'ri-list-ordered',
    },
    movie.time && {
      label: 'Thời lượng', value: movie.time, icon: 'ri-time-line',
    },
  ].filter(Boolean) as { label: string; value: React.ReactNode; icon: string }[], [movie]);

  if (!items.length) return null;

  return (
    <div className="sm:hidden bg-white/[0.03] border border-white/[0.06] rounded-xl mb-2 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        {items.slice(0, 2).map((it, i) => (
          <div key={i} className="flex items-center gap-1 text-[10px] text-white/40 truncate">
            <i className={`${it.icon} text-red-400/60`} />
            <span className="truncate">{typeof it.value === 'string' ? it.value : it.label}</span>
          </div>
        ))}
        {items.length > 2 && (
          <button onClick={() => setOpen(!open)} className="ml-auto text-white/30 hover:text-red-400 transition-colors cursor-pointer">
            <i className={`${open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm`} />
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-white/[0.05] px-3 py-2 space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-2">
              <i className={`${it.icon} text-red-400/70 text-xs mt-0.5 flex-shrink-0`} />
              <div className="min-w-0">
                <span className="text-white/30 text-[10px] block">{it.label}</span>
                <span className="text-white/70 text-sm leading-normal">{it.value}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SocialShare({ title, url }: { title: string; url: string }) {
  const shareLinks = useMemo(() => [
    { name: 'Facebook', icon: 'ri-facebook-fill', color: 'bg-[#1877F2]', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { name: 'Twitter', icon: 'ri-twitter-x-fill', color: 'bg-[#1DA1F2]', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Xem phim ${title}`)}&url=${encodeURIComponent(url)}` },
    { name: 'Copy', icon: 'ri-link', color: 'bg-white/[0.10] text-white/70', onClick: () => navigator.clipboard.writeText(url).catch(() => {}) },
  ], [title, url]);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-white/40 text-[11px] mr-1 hidden sm:inline">Chia sẻ:</span>
      {shareLinks.map((link) =>
        link.href ? (
          <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer nofollow"
            className={`w-8 h-8 flex items-center justify-center ${link.color} text-white rounded-lg transition-all hover:scale-110`}
            title={link.name}>
            <i className={`${link.icon} text-xs`} />
          </a>
        ) : (
          <button key={link.name} onClick={link.onClick}
            className={`w-8 h-8 flex items-center justify-center ${link.color} rounded-lg transition-all hover:scale-110 cursor-pointer`}
            title="Sao chép link">
            <i className={`${link.icon} text-xs`} />
          </button>
        )
      )}
    </div>
  );
}

function stripHtml(text = ''): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIsoDate(movie: MovieDetail): string {
  if (movie.modified?.time) return new Date(movie.modified.time).toISOString();
  if (movie.year) return `${movie.year}-01-01T00:00:00+07:00`;
  return new Date().toISOString();
}

function buildMovieSchema({
  movie,
  slug,
  displayTitle,
  displayOrigin,
  description,
  poster,
  thumb,
  hasEpisodes,
}: {
  movie: MovieDetail;
  slug: string;
  displayTitle: string;
  displayOrigin?: string;
  description: string;
  poster: string;
  thumb: string;
  hasEpisodes: boolean;
}) {
  const canonical = `${SITE_URL}/phim/${slug}`;
  const dateModified = toIsoDate(movie);
  const genres = movie.category?.map((c) => c.name).filter(Boolean) ?? [];
  const countries = movie.country?.map((c) => c.name).filter(Boolean) ?? [];
  const actors = movie.actor?.filter(Boolean).slice(0, 12) ?? [];
  const directors = movie.director?.filter(Boolean) ?? [];
  const cleanDescription = stripHtml(description || movie.content || `Xem phim ${displayTitle} vietsub HD tai KhoPhim.`);
  const keywords = [
    displayTitle,
    displayOrigin,
    `${displayTitle} vietsub`,
    `${displayTitle} full hd`,
    movie.year ? `${displayTitle} ${movie.year}` : '',
    ...genres,
    ...countries,
  ].filter(Boolean);

  const schemas: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: SITE_URL },
        ...(movie.category?.[0] ? [{
          '@type': 'ListItem',
          position: 2,
          name: movie.category[0].name,
          item: `${SITE_URL}/the-loai/${movie.category[0].slug}`,
        }] : []),
        { '@type': 'ListItem', position: movie.category?.[0] ? 3 : 2, name: displayTitle, item: canonical },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': movie.type === 'series' ? 'TVSeries' : 'Movie',
      '@id': `${canonical}#movie`,
      name: displayTitle,
      alternateName: [displayOrigin, movie.title_zh].filter(Boolean),
      url: canonical,
      image: poster,
      thumbnailUrl: [poster, thumb].filter(Boolean),
      description: cleanDescription,
      datePublished: movie.year ? `${movie.year}-01-01` : undefined,
      dateModified,
      genre: genres,
      countryOfOrigin: countries.map((name) => ({ '@type': 'Country', name })),
      actor: actors.map((name) => ({ '@type': 'Person', name })),
      director: directors.map((name) => ({ '@type': 'Person', name })),
      inLanguage: movie.lang || 'vi',
      duration: movie.time || undefined,
      keywords: keywords.join(', '),
      potentialAction: hasEpisodes ? {
        '@type': 'WatchAction',
        target: canonical,
      } : undefined,
    },
  ];

  if (hasEpisodes) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      '@id': `${canonical}#video`,
      name: `Xem phim ${displayTitle} ${movie.lang || 'Vietsub'} ${movie.quality || 'HD'}`,
      description: cleanDescription,
      thumbnailUrl: [poster, thumb].filter(Boolean),
      uploadDate: dateModified,
      dateModified,
      embedUrl: canonical,
      url: canonical,
      inLanguage: movie.lang || 'vi',
      isFamilyFriendly: true,
      potentialAction: {
        '@type': 'WatchAction',
        target: canonical,
      },
    });
  }

  schemas.push(
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: `Xem phim ${displayTitle}`,
      description: cleanDescription,
      isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'KhoPhim', url: SITE_URL },
      primaryImageOfPage: { '@type': 'ImageObject', url: poster },
      dateModified,
      inLanguage: 'vi-VN',
    },
  );

  return schemas;
}

export default function MovieDetailHero({ movie, slug, favored, isTrailerOnly, hasEpisodes, onFavToggle, onWatchNow }: Props) {
  const [showDesc, setShowDesc] = useState(false);

  const poster = useMemo(() => getPosterUrl(movie.poster_url || movie.thumb_url), [movie.poster_url, movie.thumb_url]);
  const thumb = useMemo(() => getThumbUrl(movie.thumb_url), [movie.thumb_url]);

  const displayTitle = getMovieDisplayName(movie);
  const displayOrigin = movie.title_en?.trim() || movie.origin_name;
  const displayChinese = movie.title_zh?.trim();

  const seoTitle = useMemo(() => `Xem Phim ${displayTitle} Vietsub HD | KhoPhim`, [displayTitle]);
  const seoDesc = useMemo(() => {
    const genreKeywords = movie.category?.map((c) => c.name).join(', ') ?? '';
    const totalEp = movie.episode_total ? `${movie.episode_total} tập` : '';
    return [
      `Xem phim ${displayTitle}${displayOrigin ? ` (${displayOrigin})` : ''} online vietsub Full HD miễn phí tại KhoPhim.`,
      movie.content ? movie.content.slice(0, 120) + '...' : '',
      genreKeywords ? `Thể loại: ${genreKeywords}.` : '',
      totalEp ? `${totalEp}.` : '',
      'Không quảng cáo, xem ngay!',
    ].filter(Boolean).join(' ');
  }, [displayTitle, displayOrigin, movie.content, movie.category, movie.episode_total]);
  const movieSchema = useMemo(() => buildMovieSchema({
    movie,
    slug,
    displayTitle,
    displayOrigin,
    description: seoDesc,
    poster,
    thumb,
    hasEpisodes,
  }), [movie, slug, displayTitle, displayOrigin, seoDesc, poster, thumb, hasEpisodes]);

  return (
    <>
      <SEO
        title={seoTitle}
        description={seoDesc}
        canonical={`${SITE_URL}/phim/${slug}`}
        ogType="video.movie"
        ogImage={poster}
        schema={movieSchema}
        publishedYear={movie.year}
        genre={movie.category?.[0]?.name}
        updatedAt={movie.modified?.time}
      />

      <div className="relative pt-16">
        <div className="absolute inset-0 overflow-hidden h-[200px] sm:h-[280px] md:h-[320px]">
          <img src={thumb} alt={displayTitle} width="1920" height="320" className="w-full h-full object-cover object-top opacity-15" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f1117]/50 to-[#0f1117]" />
        </div>

        <div className="relative max-w-[1760px] mx-auto px-3 sm:px-4 pt-8 sm:pt-12 pb-4 sm:pb-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-3 sm:mb-4 flex-wrap">
            <Link to="/" className="text-white/30 text-xs hover:text-white/60">Trang chủ</Link>
            <i className="ri-arrow-right-s-line text-white/20 text-xs" />
            {movie.category?.[0] && (
              <>
                <Link to={`/the-loai/${movie.category[0].slug}`} className="text-white/30 text-xs hover:text-red-400">{movie.category[0].name}</Link>
                <i className="ri-arrow-right-s-line text-white/20 text-xs" />
              </>
            )}
            <span className="text-white/50 text-xs line-clamp-1">{displayTitle}</span>
          </div>

          <div className="flex flex-row gap-3 sm:gap-8">
            {/* Poster */}
            <div className="flex-shrink-0">
              <div className="relative w-24 sm:w-40 md:w-52 rounded-xl overflow-hidden bg-[#1a1d27]" style={{ aspectRatio: '2/3' }}>
                <img src={poster} alt={displayTitle} width="400" height="600" className="w-full h-full object-cover object-top" loading="eager" />
                {isTrailerOnly && (
                  <div className="absolute inset-0 flex items-end">
                    <div className="w-full bg-gradient-to-t from-orange-900/90 to-transparent pt-8 pb-2 px-2 text-center">
                      <span className="text-[9px] sm:text-[10px] font-bold text-orange-300 uppercase tracking-widest">Sắp Ra Mắt</span>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={onWatchNow}
                disabled={!hasEpisodes && !isTrailerOnly}
                className={`mt-2 w-full flex items-center justify-center gap-1.5 text-white text-xs sm:text-sm font-semibold py-2.5 rounded-xl transition-all whitespace-nowrap active:scale-[0.97] cursor-pointer ${
                  !hasEpisodes && !isTrailerOnly
                    ? 'bg-white/10 text-white/40 cursor-not-allowed'
                    : isTrailerOnly
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}>
                <i className={!hasEpisodes && !isTrailerOnly ? 'ri-time-line' : isTrailerOnly ? 'ri-film-line' : 'ri-play-fill'} />
                <span className="hidden xs:inline">{!hasEpisodes && !isTrailerOnly ? 'Đang cập nhật' : isTrailerOnly ? 'Xem Trailer' : 'Xem Ngay'}</span>
                <span className="xs:hidden">{!hasEpisodes && !isTrailerOnly ? 'Cập nhật' : isTrailerOnly ? 'Trailer' : 'Xem'}</span>
              </button>
              <button onClick={onFavToggle}
                className={`mt-1.5 w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap active:scale-[0.97] border ${
                  favored ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-white/60 hover:text-red-400 hover:border-red-500/30'
                }`}>
                <i className={favored ? 'ri-heart-fill' : 'ri-heart-line'} />
                <span className="hidden xs:inline">{favored ? 'Đã Yêu Thích' : 'Yêu Thích'}</span>
              </button>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-bold text-lg sm:text-2xl md:text-3xl leading-tight mb-0.5 sm:mb-1 line-clamp-2 sm:line-clamp-none">{displayTitle}</h1>
              {displayOrigin && <p className="text-white/40 text-xs sm:text-sm mb-2 sm:mb-3 line-clamp-1">{displayOrigin}</p>}
              {displayChinese && displayChinese !== displayTitle && displayChinese !== displayOrigin && (
                <p className="text-white/30 text-xs mb-2 sm:mb-3 line-clamp-1">{displayChinese}</p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-1 sm:gap-2 mb-2 sm:mb-3">
                {movie.quality && <span className="text-[10px] sm:text-xs font-bold bg-red-500 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg">{movie.quality}</span>}
                {movie.lang && <span className="text-[10px] sm:text-xs bg-white/10 text-white/80 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg">{movie.lang}</span>}
                {movie.year && <span className="text-[10px] sm:text-xs bg-white/10 text-white/80 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg">{movie.year}</span>}
                {movie.time && <span className="text-[10px] sm:text-xs bg-white/10 text-white/80 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg hidden sm:inline-flex items-center gap-1"><i className="ri-time-line mr-0.5" />{movie.time}</span>}
                {!hasEpisodes && !isTrailerOnly ? (
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-amber-500/15 text-amber-400 font-semibold flex items-center gap-1">
                    <i className="ri-time-line text-[10px]" /><span>Đang cập nhật</span>
                  </span>
                ) : isTrailerOnly ? (
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-orange-500/20 text-orange-400 font-semibold flex items-center gap-1">
                    <i className="ri-time-line text-[10px]" /><span>Đang cập nhật</span>
                  </span>
                ) : movie.status === 'completed' ? (
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-green-500/20 text-green-400 font-semibold flex items-center gap-1">
                    <i className="ri-checkbox-circle-line text-[10px]" /><span>Hoàn tất</span>
                  </span>
                ) : (
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-emerald-500/15 text-emerald-400 font-semibold flex items-center gap-1">
                    <i className="ri-live-line text-[10px]" />{movie.episode_current ?? 'Đang chiếu'}
                  </span>
                )}
              </div>

              <MovieCountdown movie={movie} variant="hero" />

              <MobileMovieInfo movie={movie} />

              {/* Desktop info */}
              <div className="hidden sm:grid grid-cols-2 gap-x-6 gap-y-1.5 mb-3 text-sm">
                {movie.director?.filter(Boolean).length > 0 && (
                  <div className="flex gap-2 items-start">
                    <span className="text-white/35 flex-shrink-0 text-xs pt-0.5">Đạo diễn</span>
                    <span className="text-white/75 text-xs line-clamp-1">{movie.director.filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {movie.actor?.filter(Boolean).length > 0 && (
                  <div className="flex gap-2 items-start">
                    <span className="text-white/35 flex-shrink-0 text-xs pt-0.5">Diễn viên</span>
                    <span className="text-white/75 text-xs line-clamp-1">{movie.actor.filter(Boolean).slice(0, 4).join(', ')}</span>
                  </div>
                )}
                {movie.category?.length > 0 && (
                  <div className="flex gap-2 items-start flex-wrap">
                    <span className="text-white/35 flex-shrink-0 text-xs pt-0.5">Thể loại</span>
                    <div className="flex gap-1 flex-wrap">
                      {movie.category.map((c) => (
                        <Link key={c.slug} to={`/the-loai/${c.slug}`} className="text-red-400 hover:underline text-xs">{c.name}</Link>
                      ))}
                    </div>
                  </div>
                )}
                {movie.country?.length > 0 && (
                  <div className="flex gap-2 items-start flex-wrap">
                    <span className="text-white/35 flex-shrink-0 text-xs pt-0.5">Quốc gia</span>
                    <div className="flex gap-1 flex-wrap">
                      {movie.country.map((c) => {
                        const to = countryPathMap[c.slug] ?? `/filter?country=${c.slug}`;
                        return <Link key={c.slug} to={to} className="text-red-400 hover:underline text-xs">{c.name}</Link>;
                      })}
                    </div>
                  </div>
                )}
                {movie.episode_total && (
                  <div className="flex gap-2 items-start">
                    <span className="text-white/35 flex-shrink-0 text-xs pt-0.5">Số tập</span>
                    <span className="text-white/75 text-xs">{movie.episode_total} tập</span>
                  </div>
                )}
              </div>

              {movie.content && (
                <div className="mt-1 sm:mt-2">
                  <p className={`text-white/55 text-xs sm:text-sm leading-[1.7] sm:leading-relaxed ${showDesc ? '' : 'line-clamp-3'}`}>{movie.content}</p>
                  {movie.content.length > 150 && (
                    <button onClick={() => setShowDesc((v) => !v)}
                      className="text-red-400 text-xs mt-1 hover:text-red-300 cursor-pointer whitespace-nowrap flex items-center gap-1 transition-colors">
                      <i className={showDesc ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
                      {showDesc ? 'Thu gọn' : 'Xem thêm'}
                    </button>
                  )}
                </div>
              )}

              <div className="mt-3 sm:mt-4 pt-3 border-t border-white/[0.06]">
                <SocialShare title={displayTitle} url={`${SITE_URL}/phim/${slug}`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
