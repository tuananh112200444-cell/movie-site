import { useState } from 'react';
import { Link } from 'react-router-dom';
import MovieForm from './components/MovieForm';
import EpisodeStreamForm from './components/EpisodeStreamForm';

type Step = 'movie' | 'episodes' | 'done';

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'movie', label: 'Thêm phim', icon: 'ri-movie-line' },
  { key: 'episodes', label: 'Thêm tập & stream', icon: 'ri-stack-line' },
];

interface SavedMovie {
  id: string;
  slug: string;
  name: string;
  poster_url: string;
  thumb_url: string;
  type: string;
}

export default function AdminAddMoviePage() {
  return <AddMovieWizard />;
}

function AddMovieWizard() {
  const [step, setStep] = useState<Step>('movie');
  const [savedMovie, setSavedMovie] = useState<SavedMovie | null>(null);

  const handleMovieDone = (movie: SavedMovie) => {
    setSavedMovie(movie);
    setStep('episodes');
  };

  const handleStreamDone = () => {
    setStep('done');
  };

  const handleRestart = () => {
    setSavedMovie(null);
    setStep('movie');
  };

  const currentIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <title>Thêm phim thủ công – Admin | KhoPhim</title>
      <meta name="robots" content="noindex, nofollow" />

      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06] cursor-pointer">
            <i className="ri-arrow-left-line text-base" />
          </Link>
          <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/15">
            <i className="ri-movie-2-line text-red-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base">Thêm phim thủ công</h1>
            <p className="text-white/35 text-xs mt-0.5">Tạo movie → episodes + streams trên Supabase</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {step !== 'done' && (
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((s, idx) => {
              const active = idx === currentIdx;
              const done = idx < currentIdx;
              return (
                <div key={s.key} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all flex-1 justify-center ${
                    active
                      ? 'bg-red-500/15 border-red-500/30 text-red-400'
                      : done
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-white/[0.03] border-white/[0.06] text-white/25'
                  }`}>
                    <i className={`${s.icon} text-sm`} />
                    <span className="text-xs font-medium whitespace-nowrap">{s.label}</span>
                    {done && <i className="ri-checkbox-circle-fill text-emerald-400 text-xs" />}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`w-6 h-px ${done ? 'bg-emerald-500/30' : 'bg-white/10'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5 md:p-6">
          {step === 'movie' && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-500/15">
                  <i className="ri-movie-line text-red-400" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm">Bước 1: Thông tin phim</h2>
                  <p className="text-white/30 text-xs">Nhập thông tin cơ bản, slug sẽ được kiểm tra trùng lặp</p>
                </div>
              </div>
              <MovieForm onDone={handleMovieDone} />
            </div>
          )}

          {step === 'episodes' && savedMovie && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-500/15">
                  <i className="ri-stack-line text-red-400" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm">Bước 2: Thêm tập & link phát</h2>
                  <p className="text-white/30 text-xs">Mỗi tập có slug riêng, gắn stream URL hoặc embed URL</p>
                </div>
              </div>
              <EpisodeStreamForm
                movieId={savedMovie.id}
                movieSlug={savedMovie.slug}
                movieType={savedMovie.type}
                moviePoster={savedMovie.thumb_url || savedMovie.poster_url}
                movieName={savedMovie.name}
                onDone={handleStreamDone}
              />
            </div>
          )}

          {step === 'done' && savedMovie && (
            <div className="text-center py-10">
              <div className="w-16 h-16 flex items-center justify-center rounded-full bg-emerald-500/15 mx-auto mb-4">
                <i className="ri-checkbox-circle-line text-emerald-400 text-3xl" />
              </div>
              <h2 className="text-white font-bold text-lg mb-1">Thêm phim thành công!</h2>
              <p className="text-white/30 text-sm mb-2">
                Phim đã được lưu vào Supabase cùng episodes và streams.
              </p>
              <p className="text-white/20 text-xs font-mono mb-6">
                Movie ID: {savedMovie.id} · Slug: {savedMovie.slug}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleRestart}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/50 hover:text-white text-sm font-medium transition-all cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line" /> Thêm phim khác
                </button>
                <Link
                  to={`/phim/${savedMovie.slug}`}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 rounded-xl text-white text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-external-link-line" /> Xem phim
                </Link>
                <Link
                  to={`/search?q=${encodeURIComponent(savedMovie.name)}`}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white text-sm font-medium transition-all cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-search-line" /> Tìm kiếm thử
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}