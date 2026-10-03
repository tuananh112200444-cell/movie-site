import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import SEO from '@/components/base/SEO';
import { useAuth } from '@/context/AuthContext';
import { submitMovieRequest, type MovieRequestType } from '@/services/movieRequestService';

const TYPES: Array<{ value: MovieRequestType; title: string; short: string; description: string; icon: string }> = [
  { value: 'movie', title: 'Thêm phim mới', short: 'Phim mới', description: 'Phim chưa có trên KhoPhim', icon: 'ri-movie-2-line' },
  { value: 'missing_episode', title: 'Báo thiếu hoặc lỗi tập', short: 'Thiếu tập', description: 'Thiếu tập, sai tập hoặc không phát được', icon: 'ri-play-list-add-line' },
  { value: 'source', title: 'Bổ sung nguồn phát', short: 'Thêm nguồn', description: 'Vietsub, thuyết minh, lồng tiếng hoặc chất lượng khác', icon: 'ri-links-line' },
];

const SOURCE_OPTIONS = ['Vietsub', 'Thuyết minh', 'Lồng tiếng', 'HD/4K', 'Nguồn dự phòng'];

function requestType(value: string | null): MovieRequestType {
  return value === 'missing_episode' || value === 'source' ? value : 'movie';
}

export default function MovieRequestPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [type, setType] = useState<MovieRequestType>(() => requestType(searchParams.get('type')));
  const [movieName, setMovieName] = useState(() => searchParams.get('name') || '');
  const [movieUrl, setMovieUrl] = useState(() => searchParams.get('url') || '');
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setType(requestType(searchParams.get('type')));
    if (searchParams.get('name')) setMovieName(searchParams.get('name') || '');
    if (searchParams.get('url')) setMovieUrl(searchParams.get('url') || '');
  }, [searchParams]);

  const selected = useMemo(() => TYPES.find((item) => item.value === type) || TYPES[0], [type]);
  const needsMovieUrl = type !== 'movie';
  const needsDetails = type !== 'movie';

  const selectType = (next: MovieRequestType) => {
    setType(next);
    setSuccess('');
    setError('');
    const params = new URLSearchParams(searchParams);
    params.set('type', next);
    setSearchParams(params, { replace: true });
  };

  const toggleSourceOption = (option: string) => {
    const parts = details.split(',').map((item) => item.trim()).filter(Boolean);
    const next = parts.includes(option) ? parts.filter((item) => item !== option) : [...parts, option];
    setDetails(next.join(', '));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSuccess('');
    setError('');
    try {
      const result = await submitMovieRequest({
        request_type: type,
        movie_name: movieName.trim(),
        movie_url: movieUrl.trim(),
        details: details.trim(),
        contact: contact.trim(),
      });
      setSuccess(result.demo
        ? 'Đã ghi nhận trong bản demo. Khi tính năng được phát hành, yêu cầu sẽ đi thẳng tới đội nội dung.'
        : 'Đã gửi yêu cầu. Bạn không cần gửi lại; KhoPhim sẽ kiểm tra theo thứ tự tiếp nhận.');
      setDetails('');
      if (type === 'movie') {
        setMovieName('');
        setMovieUrl('');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể gửi yêu cầu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO title="Yêu cầu phim hoặc bổ sung tập" description="Gửi yêu cầu phim mới, báo thiếu tập hoặc đề nghị thêm nguồn phát cho KhoPhim." canonical="/yeu-cau-phim" noIndex />
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-12">
        <div>
          <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-white/35 hover:text-white"><i className="ri-arrow-left-line" /> Trang chủ</Link>
          <div className="mt-2 flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-xl shadow-lg shadow-red-950/30"><i className="ri-customer-service-2-line" /></span>
            <div><h1 className="text-2xl font-black md:text-3xl">Gửi yêu cầu cho KhoPhim</h1><p className="mt-1.5 text-sm leading-6 text-white/45">Chọn đúng loại yêu cầu để đội nội dung xử lý nhanh hơn.</p></div>
          </div>
        </div>

        <section className="mt-7 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0d0f18]">
          <div className="grid grid-cols-3 gap-1 border-b border-white/[0.07] bg-black/20 p-1.5" role="tablist" aria-label="Loại yêu cầu">
            {TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={type === item.value}
                onClick={() => selectType(item.value)}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center transition sm:min-h-12 sm:flex-row sm:gap-2 ${
                  type === item.value ? 'bg-red-500 text-white shadow-lg shadow-red-950/30' : 'text-white/40 hover:bg-white/[0.05] hover:text-white/70'
                }`}
              >
                <i className={`${item.icon} text-base`} />
                <span className="text-[11px] font-bold sm:text-xs">{item.short}</span>
              </button>
            ))}
          </div>

          <div className="p-5 md:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-bold">{selected.title}</h2><p className="mt-1 text-xs leading-5 text-white/40">{selected.description}</p></div>
              <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">Không cần đăng nhập</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-white/55">Tên phim *</span>
                <input value={movieName} onChange={(event) => setMovieName(event.target.value)} required minLength={2} maxLength={180} placeholder="Tên tiếng Việt hoặc tên gốc" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm outline-none placeholder:text-white/20 focus:border-red-500/50" />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-white/55">
                  <span>Đường dẫn phim {needsMovieUrl ? '*' : ''}</span>
                  {movieUrl && <span className="font-normal text-emerald-300/70"><i className="ri-checkbox-circle-line" /> Đã nhận đường dẫn</span>}
                </span>
                <input type="url" value={movieUrl} onChange={(event) => setMovieUrl(event.target.value)} required={needsMovieUrl} maxLength={500} placeholder={type === 'movie' ? 'Trang giới thiệu phim ở nơi khác (nếu có)' : 'https://khophim.org/phim/...'} className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm outline-none placeholder:text-white/20 focus:border-red-500/50" />
              </label>

              {type === 'source' && (
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold text-white/55">Bạn cần nguồn nào? *</legend>
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_OPTIONS.map((option) => {
                      const active = details.split(',').map((item) => item.trim()).includes(option);
                      return <button key={option} type="button" aria-pressed={active} onClick={() => toggleSourceOption(option)} className={`min-h-11 rounded-full border px-3 text-xs font-semibold transition ${active ? 'border-red-500/40 bg-red-500/15 text-red-200' : 'border-white/10 bg-white/[0.035] text-white/45 hover:text-white/70'}`}>{active && <i className="ri-check-line mr-1" />}{option}</button>;
                    })}
                  </div>
                </fieldset>
              )}

              {type !== 'source' && (
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/55">{type === 'missing_episode' ? 'Tập bị thiếu hoặc gặp lỗi *' : 'Thông tin giúp nhận diện phim'}</span>
                  <textarea value={details} onChange={(event) => setDetails(event.target.value)} required={needsDetails} minLength={needsDetails ? 2 : undefined} maxLength={1000} rows={3} placeholder={type === 'missing_episode' ? 'Ví dụ: thiếu tập 8, tập 6 không phát được...' : 'Năm phát hành, diễn viên hoặc quốc gia...'} className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm outline-none placeholder:text-white/20 focus:border-red-500/50" />
                </label>
              )}

              {!user && (
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/55">Liên hệ nhận phản hồi <span className="font-normal text-white/25">(không bắt buộc)</span></span>
                  <input value={contact} onChange={(event) => setContact(event.target.value)} maxLength={180} placeholder="Email hoặc Telegram" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm outline-none placeholder:text-white/20 focus:border-red-500/50" />
                </label>
              )}

              {success && <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-200"><i className="ri-checkbox-circle-fill mr-2" />{success}</div>}
              {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

              <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] leading-5 text-white/25">Mỗi yêu cầu chỉ cần gửi một lần. Không gửi thông tin nhạy cảm.</p>
                <button disabled={submitting || movieName.trim().length < 2 || (needsMovieUrl && !movieUrl.trim()) || (needsDetails && details.trim().length < 2)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-black transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-35">
                  {submitting ? 'Đang gửi...' : <><i className="ri-send-plane-fill" /> Gửi yêu cầu</>}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
