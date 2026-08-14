import { Link } from 'react-router-dom';
import MovieCard from '../../../components/base/MovieCard';
import type { MovieItem } from '../../../types/movie';

interface EditorialSpotlightProps {
  movies: MovieItem[];
  loading?: boolean;
  title?: string;
  eyebrow?: string;
  description?: string;
  viewAllLink?: string;
}

export default function EditorialSpotlight({
  movies,
  loading = false,
  title = 'Tuyển chọn cho tối nay',
  eyebrow = 'Biên tập bởi KhoPhim',
  description = 'Ít lựa chọn hơn, nhưng mỗi bộ phim đều đáng để bắt đầu.',
  viewAllLink = '/phim-chieu-rap',
}: EditorialSpotlightProps) {
  const selected = movies.slice(0, 5);
  if (!loading && selected.length === 0) return null;

  return (
    <section className="editorial-spotlight" aria-labelledby="editorial-spotlight-title">
      <header className="editorial-section-header">
        <div className="editorial-heading-mark" aria-hidden="true">SELECTED / 01</div>
        <div>
          <p className="editorial-eyebrow">{eyebrow}</p>
          <h2 id="editorial-spotlight-title">{title}</h2>
          <p>{description}</p>
        </div>
        <Link to={viewAllLink}>Xem toàn bộ <i className="ri-arrow-right-line" aria-hidden="true" /></Link>
      </header>

      {loading && selected.length === 0 ? (
        <div className="editorial-spotlight-grid">
          {Array.from({ length: 5 }).map((_, index) => <div key={index} className="editorial-wide-skeleton skeleton" />)}
        </div>
      ) : (
        <div className="editorial-spotlight-grid">
          {selected.map((movie, index) => (
            <div key={`${movie._id || movie.slug}-selected-${index}`} className={index === 0 ? 'editorial-spotlight-lead' : ''}>
              <MovieCard movie={movie} variant="wide" priority={index === 0} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
