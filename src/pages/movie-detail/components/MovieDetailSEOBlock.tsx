import { Link } from 'react-router-dom';
import { SITE_URL } from '@/components/base/SEO';
import type { MovieDetail } from '@/types/movie';

interface Props {
  movie: MovieDetail;
  slug: string;
}

function stripHtml(text = ''): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function MovieDetailSEOBlock({ movie, slug }: Props) {
  const genres = movie.category?.map((c) => c.name) ?? [];
  const countries = movie.country?.map((c) => c.name) ?? [];
  const actors = movie.actor?.filter(Boolean).slice(0, 8) ?? [];
  const directors = movie.director?.filter(Boolean) ?? [];
  const genreStr = genres.join(', ');
  const countryStr = countries.join(', ');
  const cleanContent = stripHtml(movie.content || '');

  return (
    <article className="mt-6 rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-5 md:p-7" aria-label={`Thông tin chi tiết phim ${movie.name}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-5 bg-red-500 rounded-full flex-shrink-0" />
        <h2 className="text-white font-bold text-base">
          Thông Tin Phim <strong className="text-red-400">{movie.name}</strong>
          {movie.origin_name && <span className="text-white/40 font-normal text-sm ml-2">({movie.origin_name})</span>}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { icon: 'ri-film-line', label: 'Tên phim', value: movie.name },
          movie.origin_name && { icon: 'ri-translate-2', label: 'Tên gốc', value: movie.origin_name },
          movie.year && { icon: 'ri-calendar-line', label: 'Năm phát hành', value: String(movie.year) },
          movie.quality && { icon: 'ri-hd-line', label: 'Chất lượng', value: movie.quality },
          movie.lang && { icon: 'ri-translate-2', label: 'Ngôn ngữ', value: movie.lang },
          movie.episode_total && { icon: 'ri-list-ordered', label: 'Số tập', value: `${movie.episode_total} tập` },
          movie.time && { icon: 'ri-time-line', label: 'Thời lượng', value: movie.time },
          genreStr && { icon: 'ri-price-tag-3-line', label: 'Thể loại', value: genreStr },
          countryStr && { icon: 'ri-map-pin-line', label: 'Quốc gia', value: countryStr },
        ].filter(Boolean).map((item, i) => {
          if (!item) return null;
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 flex-shrink-0 mt-0.5">
                <i className={`${item.icon} text-red-400 text-sm`} />
              </div>
              <div className="min-w-0">
                <p className="text-white/35 text-[11px] uppercase tracking-wider font-medium">{item.label}</p>
                <p className="text-white/80 text-sm font-medium mt-0.5 leading-snug">{item.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {directors.length > 0 && (
        <div className="mb-4">
          <p className="text-white/35 text-[11px] uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
            <i className="ri-user-star-line text-red-400" /> Đạo Diễn
          </p>
          <div className="flex flex-wrap gap-2">
            {directors.map((d) => (
              <span key={d} className="text-sm text-white/70 bg-white/[0.05] border border-white/[0.08] px-3 py-1 rounded-full">{d}</span>
            ))}
          </div>
        </div>
      )}

      {actors.length > 0 && (
        <div className="mb-5">
          <p className="text-white/35 text-[11px] uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
            <i className="ri-group-line text-red-400" /> Diễn Viên
          </p>
          <div className="flex flex-wrap gap-2">
            {actors.map((a) => (
              <span key={a} className="text-sm text-white/70 bg-white/[0.05] border border-white/[0.08] px-3 py-1 rounded-full cursor-default">{a}</span>
            ))}
          </div>
        </div>
      )}

      {cleanContent && (
        <div className="border-t border-white/[0.06] pt-5">
          <p className="text-white/35 text-[11px] uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
            <i className="ri-file-text-line text-red-400" /> Nội Dung Phim
          </p>
          <p className="text-white/55 text-sm leading-relaxed">{cleanContent}</p>
        </div>
      )}

      <div className="border-t border-white/[0.04] pt-4 mt-4">
        <p className="text-white/20 text-xs leading-relaxed">
          {`Xem phim ${movie.name}${movie.origin_name ? ` (${movie.origin_name})` : ''}${movie.year ? ` ${movie.year}` : ''} vietsub full HD miễn phí tại KhoPhim. `}
          {genreStr && `Phim ${genreStr}${countryStr ? ` ${countryStr}` : ''}. `}
          {actors.length > 0 && `Diễn viên: ${actors.slice(0, 4).join(', ')}. `}
          {directors.length > 0 && `Đạo diễn: ${directors.join(', ')}. `}
          {`Xem phim ${movie.name} online không quảng cáo, chất lượng ${movie.quality || 'HD'}, ${movie.lang || 'Vietsub'} tại `}
          <Link to={`/phim/${slug}`} className="text-red-400/40 hover:text-red-400/70">
            {SITE_URL}/phim/{slug}
          </Link>
          {'. Không cần đăng ký, xem ngay trên trình duyệt.'}
        </p>
      </div>
    </article>
  );
}
