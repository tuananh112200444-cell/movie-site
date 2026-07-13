import { Link } from 'react-router-dom';
import HighlightText from './HighlightText';
import type { MovieItem } from '@/types/movie';
import { useImageFallback } from '@/hooks/useImageFallback';
import { parseMovieYear } from '@/utils/searchRanking';
import { movieDetailUrl } from '@/utils/slugEncoder';
import { cancelPrefetchMovieDetail, prefetchMovieDetail } from '@/utils/prefetchRoute';
import MovieCountdown from '@/components/base/MovieCountdown';


interface Props {
  movie: MovieItem;
  query: string;
  viewMode: 'grid' | 'list';
}

function getMovieHref(movie: MovieItem): string {
  const href = movieDetailUrl(movie.slug);
  const isOphimSource = movie.source_site === 'ophim' || movie.source_name === 'OPhim';
  return isOphimSource ? `${href}?source=ophim` : href;
}

export default function SearchResultItem({ movie, query, viewMode }: Props) {
  if (viewMode === 'list') {
    return <ListItem movie={movie} query={query} />;
  }
  return <GridItem movie={movie} query={query} />;
}

/* ── Grid Card ── */
function GridItem({ movie, query }: { movie: MovieItem; query: string }) {
  const href = getMovieHref(movie);
  const posterPath = movie.thumb_url || movie.poster_url;
  const fallbackPath = movie.poster_url || movie.thumb_url;
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    posterPath,
    fallbackPath,
    false,
    300,
    80,
    { preferredAspect: 'portrait' },
  );
  const isFull =
    movie.type === 'single' ||
    (movie.episode_current ?? '').toLowerCase().includes('full');
  const year = parseMovieYear(movie);
  return (
    <Link
      to={href}
      className="group relative flex flex-col cursor-pointer rounded-[1.15rem] p-1 transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.035]"
      onMouseEnter={() => prefetchMovieDetail(movie.slug)}
      onMouseLeave={() => cancelPrefetchMovieDetail(movie.slug)}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-[1rem] overflow-hidden bg-[#141823] ring-1 ring-white/[0.07] shadow-[0_14px_38px_rgba(0,0,0,0.24)] transition-all duration-300 group-hover:ring-white/[0.16] group-hover:shadow-[0_18px_48px_rgba(0,0,0,0.34)]">
        <img
          src={currentSrc}
          alt={movie.name}
          width="300"
          height="450"
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover object-center group-hover:scale-105 transition-[opacity,transform] duration-500 ${loaded && !hasError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={onLoad}
          onError={onError}
        />
        {!loaded && !hasError && <div className="absolute inset-0 skeleton" />}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_0%,rgba(239,68,68,0.12),transparent_70%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] text-white/30">
            <i className="ri-film-line text-2xl" />
            <span className="px-3 text-center text-[10px] font-semibold uppercase tracking-wide text-white/35">KhoPhim</span>
          </div>
        )}
        {/* Overlay badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
          {movie.quality && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-md shadow-lg shadow-red-950/30">
              {movie.quality}
            </span>
          )}
          {movie.lang?.toLowerCase().includes('vietsub') && (
            <span className="bg-blue-500/85 text-white text-xs font-bold px-1.5 py-0.5 rounded-md shadow-lg shadow-blue-950/30">
              Vietsub
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <MovieCountdown movie={movie} />
          {isFull ? (
            <span className="bg-green-500/85 text-white text-xs font-bold px-1.5 py-0.5 rounded-md shadow-lg shadow-green-950/30">
              Full
            </span>
          ) : (
            <span className="bg-amber-500/90 text-white text-xs font-bold px-1.5 py-0.5 rounded-md shadow-lg shadow-amber-950/30">
              {movie.episode_current ?? 'Tập 1'}
            </span>
          )}
        </div>
        {/* Hover play */}
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-11 h-11 flex items-center justify-center bg-white text-black rounded-full shadow-[0_10px_26px_rgba(0,0,0,0.35)]">
            <i className="ri-play-fill text-lg ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-2.5 px-0.5">
        <HighlightText
          text={movie.name}
          query={query}
          className="text-[0.95rem] sm:text-base font-bold text-white/90 group-hover:text-white line-clamp-2 leading-snug transition-colors"
        />
        {movie.origin_name && (
          <HighlightText
            text={movie.origin_name}
            query={query}
            className="text-sm text-white/45 line-clamp-1 mt-0.5"
          />
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {year > 0 && <span className="text-xs text-white/40">{year}</span>}
          <span className="text-xs text-white/30">•</span>
          {movie.category?.[0] && (
            <span className="text-xs text-white/40">{movie.category[0].name}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── List Card (ngang, info nhiều hơn) ── */
function ListItem({ movie, query }: { movie: MovieItem; query: string }) {
  const href = getMovieHref(movie);
  const posterPath = movie.thumb_url || movie.poster_url;
  const fallbackPath = movie.poster_url || movie.thumb_url;
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    posterPath,
    fallbackPath,
    false,
    260,
    80,
    { preferredAspect: 'portrait' },
  );
  const isFull =
    movie.type === 'single' ||
    (movie.episode_current ?? '').toLowerCase().includes('full');
  const year = parseMovieYear(movie);
  return (
    <Link
      to={href}
      className="group flex gap-2.5 sm:gap-4 rounded-2xl border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-2 shadow-[0_12px_36px_rgba(0,0,0,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.045] sm:p-3"
      onMouseEnter={() => prefetchMovieDetail(movie.slug)}
      onMouseLeave={() => cancelPrefetchMovieDetail(movie.slug)}
    >
      {/* Thumbnail */}
      <div className="relative w-[80px] sm:w-[100px] md:w-[120px] aspect-[2/3] rounded-xl overflow-hidden bg-[#141823] ring-1 ring-white/[0.07] flex-shrink-0">
        <img
          src={currentSrc}
          alt={movie.name}
          width="120"
          height="180"
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover object-center group-hover:scale-105 transition-[opacity,transform] duration-500 ${loaded && !hasError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={onLoad}
          onError={onError}
        />
        {!loaded && !hasError && <div className="absolute inset-0 skeleton" />}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[radial-gradient(circle_at_50%_0%,rgba(239,68,68,0.12),transparent_70%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] text-white/30">
            <i className="ri-film-line text-xl" />
            <span className="px-2 text-center text-[9px] font-semibold uppercase tracking-wide text-white/35">KhoPhim</span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          {movie.quality && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded">
              {movie.quality}
            </span>
          )}
        </div>
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-9 h-9 flex items-center justify-center bg-white text-black rounded-full shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
            <i className="ri-play-fill text-sm ml-0.5" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5">
        <HighlightText
          text={movie.name}
          query={query}
          className="text-base font-bold text-white/90 group-hover:text-white line-clamp-1 transition-colors"
        />
        {movie.origin_name && (
          <HighlightText
            text={movie.origin_name}
            query={query}
            className="text-sm text-white/45 line-clamp-1 mt-0.5"
          />
        )}

        {/* Meta chips */}
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {year > 0 && (
            <span className="text-sm text-white/55 bg-white/[0.06] border border-white/[0.06] px-2 py-0.5 rounded-md">
              {year}
            </span>
          )}
          {movie.category?.slice(0, 3).map((cat) => (
            <span
              key={cat.slug}
              className="text-sm text-white/55 bg-white/[0.06] border border-white/[0.06] px-2 py-0.5 rounded-md"
            >
              {cat.name}
            </span>
          ))}
          {movie.country?.[0] && (
            <span className="text-sm text-white/55 bg-white/[0.06] border border-white/[0.06] px-2 py-0.5 rounded-md">
              {movie.country[0].name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 mt-2 sm:mt-2.5 text-sm text-white/40 flex-wrap">
          <MovieCountdown movie={movie} />
          <span className="flex items-center gap-1">
            <i className="ri-film-line" />
            {movie.type === 'single' ? 'Phim Lẻ' : movie.type === 'series' ? 'Phim Bộ' : 'Phim'}
          </span>
          {movie.time && (
            <span className="flex items-center gap-1">
              <i className="ri-time-line" />
              {movie.time}
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
              isFull
                ? 'bg-green-500/15 text-green-400'
                : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {isFull ? 'Full' : movie.episode_current ?? 'Tập 1'}
          </span>
          {movie.lang?.toLowerCase().includes('vietsub') && (
            <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-500/15 text-blue-400">
              Vietsub
            </span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-center w-8 flex-shrink-0">
        <i className="ri-arrow-right-s-line text-white/18 group-hover:text-white group-hover:translate-x-0.5 transition-all text-lg" />
      </div>
    </Link>
  );
}
