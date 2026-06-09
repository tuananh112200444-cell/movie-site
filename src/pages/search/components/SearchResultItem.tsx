import { Link } from 'react-router-dom';
import HighlightText from './HighlightText';
import type { MovieItem } from '@/types/movie';
import { getOptimizedImageUrl } from '@/services/movieApi';
import { parseMovieYear } from '@/utils/searchRanking';
import { movieDetailUrl } from '@/utils/slugEncoder';
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
  const isFull =
    movie.type === 'single' ||
    (movie.episode_current ?? '').toLowerCase().includes('full');
  const year = parseMovieYear(movie);
  return (
    <Link
      to={href}
      className="group relative flex flex-col cursor-pointer"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5">
        <img
          src={getOptimizedImageUrl(movie.thumb_url || movie.poster_url, 260, 72)}
          alt={movie.name}
          width="300"
          height="450"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.display = 'none';
          }}
        />
        {/* Overlay badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
          {movie.quality && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-md">
              {movie.quality}
            </span>
          )}
          {movie.lang?.toLowerCase().includes('vietsub') && (
            <span className="bg-blue-500/80 text-white text-xs font-bold px-1.5 py-0.5 rounded-md">
              Vietsub
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <MovieCountdown movie={movie} />
          {isFull ? (
            <span className="bg-green-500/80 text-white text-xs font-bold px-1.5 py-0.5 rounded-md">
              Full
            </span>
          ) : (
            <span className="bg-amber-500/80 text-white text-xs font-bold px-1.5 py-0.5 rounded-md">
              {movie.episode_current ?? 'Tập 1'}
            </span>
          )}
        </div>
        {/* Hover play */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-10 h-10 flex items-center justify-center bg-red-500 rounded-full">
            <i className="ri-play-fill text-white text-lg" />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-2.5 px-0.5">
        <HighlightText
          text={movie.name}
          query={query}
          className="text-base font-semibold text-white line-clamp-2 leading-snug"
        />
        {movie.origin_name && (
          <HighlightText
            text={movie.origin_name}
            query={query}
            className="text-sm text-white/50 line-clamp-1 mt-0.5"
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
  const isFull =
    movie.type === 'single' ||
    (movie.episode_current ?? '').toLowerCase().includes('full');
  const year = parseMovieYear(movie);
  return (
    <Link
      to={href}
      className="group flex gap-2.5 sm:gap-4 bg-[#0f1219] hover:bg-[#151921] border border-white/[0.05] hover:border-red-500/15 rounded-2xl p-2 sm:p-3 transition-all cursor-pointer"
    >
      {/* Thumbnail */}
      <div className="relative w-[80px] sm:w-[100px] md:w-[120px] aspect-[2/3] rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
        <img
          src={getOptimizedImageUrl(movie.thumb_url || movie.poster_url, 220, 72)}
          alt={movie.name}
          width="120"
          height="180"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.display = 'none';
          }}
        />
        <div className="absolute top-1.5 left-1.5">
          {movie.quality && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded">
              {movie.quality}
            </span>
          )}
        </div>
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-8 h-8 flex items-center justify-center bg-red-500 rounded-full">
            <i className="ri-play-fill text-white text-sm" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5">
        <HighlightText
          text={movie.name}
          query={query}
          className="text-base font-semibold text-white line-clamp-1"
        />
        {movie.origin_name && (
          <HighlightText
            text={movie.origin_name}
            query={query}
            className="text-sm text-white/50 line-clamp-1 mt-0.5"
          />
        )}

        {/* Meta chips */}
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {year > 0 && (
            <span className="text-sm text-white/50 bg-white/[0.05] px-2 py-0.5 rounded-md">
              {year}
            </span>
          )}
          {movie.category?.slice(0, 3).map((cat) => (
            <span
              key={cat.slug}
              className="text-sm text-white/50 bg-white/[0.05] px-2 py-0.5 rounded-md"
            >
              {cat.name}
            </span>
          ))}
          {movie.country?.[0] && (
            <span className="text-sm text-white/50 bg-white/[0.05] px-2 py-0.5 rounded-md">
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
        <i className="ri-arrow-right-s-line text-white/15 group-hover:text-red-400 group-hover:translate-x-0.5 transition-all text-lg" />
      </div>
    </Link>
  );
}
