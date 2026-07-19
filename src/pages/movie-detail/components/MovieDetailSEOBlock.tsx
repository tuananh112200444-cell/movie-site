import { Link } from 'react-router-dom';
import type { MovieDetail } from '@/types/movie';

interface Props {
  movie: MovieDetail;
  slug: string;
}

function stripHtml(text = ''): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function entitySearchLink(name: string, role: 'actor' | 'director'): string {
  const params = new URLSearchParams({ q: name, role });
  return `/search?${params.toString()}`;
}

export default function MovieDetailSEOBlock({ movie }: Props) {
  const genres = movie.category?.filter((item) => item.name && item.slug) ?? [];
  const countries = movie.country?.filter((item) => item.name && item.slug) ?? [];
  const actors = movie.actor?.filter(Boolean).slice(0, 10) ?? [];
  const directors = movie.director?.filter(Boolean).slice(0, 6) ?? [];
  const cleanContent = stripHtml(movie.content || '');

  return (
    <article className="mt-6 rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-5 md:p-7" aria-label={`Thông tin chi tiết phim ${movie.name}`}>
      <div className="mb-5 flex items-center gap-3">
        <div className="h-5 w-1 flex-shrink-0 rounded-full bg-red-500" />
        <h2 className="text-base font-bold text-white">
          Thông tin phim <strong className="text-red-400">{movie.name}</strong>
          {movie.origin_name && <span className="ml-2 text-sm font-normal text-white/40">({movie.origin_name})</span>}
        </h2>
      </div>

      <dl className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Tên phim', movie.name],
          ['Tên gốc', movie.origin_name],
          ['Năm phát hành', movie.year ? String(movie.year) : ''],
          ['Trạng thái', movie.episode_current],
          ['Số tập', movie.episode_total],
          ['Thời lượng', movie.time],
          ['Ngôn ngữ', movie.lang],
          ['Chất lượng nguồn', movie.quality],
        ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/35">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium leading-snug text-white/80">{value}</dd>
          </div>
        ))}
      </dl>

      {cleanContent && (
        <section className="border-t border-white/[0.06] pt-5" aria-labelledby="movie-synopsis-heading">
          <h3 id="movie-synopsis-heading" className="mb-3 text-sm font-semibold text-white">Nội dung phim</h3>
          <p className="text-sm leading-7 text-white/60">{cleanContent}</p>
        </section>
      )}

      <nav className="mt-5 space-y-4 border-t border-white/[0.06] pt-5" aria-label="Khám phá phim liên quan">
        {genres.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Thể loại</h3>
            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => <Link key={genre.slug} to={`/the-loai/${genre.slug}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-white/70 hover:border-red-500/30 hover:text-red-400">{genre.name}</Link>)}
            </div>
          </div>
        )}
        {countries.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Quốc gia</h3>
            <div className="flex flex-wrap gap-2">
              {countries.map((country) => <Link key={country.slug} to={`/filter?country=${country.slug}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-white/70 hover:border-red-500/30 hover:text-red-400">{country.name}</Link>)}
            </div>
          </div>
        )}
        {directors.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Đạo diễn</h3>
            <div className="flex flex-wrap gap-2">
              {directors.map((name) => <Link key={name} to={entitySearchLink(name, 'director')} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-white/70 hover:border-red-500/30 hover:text-red-400">{name}</Link>)}
            </div>
          </div>
        )}
        {actors.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Diễn viên</h3>
            <div className="flex flex-wrap gap-2">
              {actors.map((name) => <Link key={name} to={entitySearchLink(name, 'actor')} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-white/70 hover:border-red-500/30 hover:text-red-400">{name}</Link>)}
            </div>
          </div>
        )}
      </nav>
    </article>
  );
}
