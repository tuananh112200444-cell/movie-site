import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import SEO from '@/components/base/SEO';
import { useAuth } from '@/context/AuthContext';
import { useFollowUpdates } from '@/context/FollowUpdatesContext';
import { getPosterUrl } from '@/services/movieApi';
import { getMovieCountdownInfo } from '@/utils/movieSchedule';

function scheduleLabel(targetAt?: string) {
  if (!targetAt) return 'Chưa có lịch chính xác';
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(targetAt));
}

export default function ReleaseSchedulePage() {
  const { user } = useAuth();
  const { follows, notifications, unreadCount, refreshing, browserPermission, markAllRead, refreshUpdates, requestBrowserNotifications } = useFollowUpdates();
  const scheduled = useMemo(() => follows.map((movie) => ({ movie, countdown: getMovieCountdownInfo(movie) })).sort((left, right) => {
    const leftTime = left.countdown?.targetAt ? new Date(left.countdown.targetAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.countdown?.targetAt ? new Date(right.countdown.targetAt).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  }), [follows]);

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO title="Lịch phát hành cá nhân" description="Theo dõi lịch ra tập mới và các tập vừa cập nhật của những phim bạn quan tâm." canonical="/lich-cua-toi" noIndex />
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div><div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-300"><i className="ri-calendar-event-line" /> Lịch của tôi</div><h1 className="mt-4 text-3xl font-black md:text-4xl">Phim sắp ra tập mới</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">Lịch được tạo từ các phim bạn đang theo dõi. Thời gian dự kiến dùng múi giờ Việt Nam.</p></div>
          <div className="flex flex-wrap gap-2">
            {browserPermission !== 'granted' && browserPermission !== 'unsupported' && <button type="button" onClick={() => void requestBrowserNotifications()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-xs font-bold text-white/70"><i className="ri-notification-3-line" /> Bật thông báo trình duyệt</button>}
            <button type="button" onClick={() => void refreshUpdates()} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-500 px-4 text-xs font-bold disabled:opacity-50"><i className={`ri-refresh-line ${refreshing ? 'animate-spin' : ''}`} /> Kiểm tra tập mới</button>
          </div>
        </div>

        {!user && <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-amber-100">Lịch hiện chỉ lưu trên thiết bị này</p><p className="mt-1 text-xs text-amber-100/55">Đăng nhập để đồng bộ danh sách theo dõi và thông báo sang thiết bị khác.</p></div><Link to="/tai-khoan" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-4 text-sm font-bold text-amber-950">Đăng nhập</Link></div>}

        <section className="mt-8" aria-labelledby="followed-schedule-title">
          <div className="mb-4 flex items-center gap-3"><h2 id="followed-schedule-title" className="text-lg font-bold">Đang theo dõi</h2><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/35">{follows.length} phim</span></div>
          {scheduled.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-[#0d0f18] px-5 py-14 text-center"><i className="ri-notification-off-line text-4xl text-white/15" /><h3 className="mt-3 font-bold">Bạn chưa theo dõi phim nào</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/40">Mở trang chi tiết phim và bấm “Theo dõi tập mới”. Phim sẽ xuất hiện tại đây.</p><Link to="/phim-moi-nhat" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-red-500 px-5 text-sm font-bold">Khám phá phim mới</Link></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scheduled.map(({ movie, countdown }) => (
                <Link key={movie.slug} to={`/phim/${movie.slug}`} className="group flex gap-3 rounded-2xl border border-white/[0.07] bg-[#0d0f18] p-3 transition hover:border-red-500/25 hover:bg-white/[0.035]">
                  <img src={getPosterUrl(movie.poster_url || movie.thumb_url)} alt="" className="h-28 w-[76px] shrink-0 rounded-xl object-cover" loading="lazy" />
                  <div className="min-w-0 py-1"><h3 className="line-clamp-2 text-sm font-bold group-hover:text-red-300">{movie.name}</h3><p className="mt-1 text-xs text-white/35">{movie.episode_current || 'Chưa phát hành'}</p><div className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${countdown?.targetAt ? 'bg-sky-500/10 text-sky-300' : 'bg-white/[0.05] text-white/35'}`}><i className="ri-time-line" /> {scheduleLabel(countdown?.targetAt)}</div>{countdown?.targetEpisodeNumber && <p className="mt-2 text-[11px] text-amber-300/70">Dự kiến tập {countdown.targetEpisodeNumber}</p>}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10" aria-labelledby="recent-updates-title">
          <div className="mb-4 flex items-center gap-3"><h2 id="recent-updates-title" className="text-lg font-bold">Vừa cập nhật</h2>{unreadCount > 0 && <><span className="rounded-full bg-red-500 px-2 py-1 text-[11px] font-bold">{unreadCount} mới</span><button onClick={markAllRead} className="ml-auto min-h-11 text-xs font-semibold text-white/35 hover:text-white">Đánh dấu đã đọc</button></>}</div>
          {notifications.length === 0 ? <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-6 text-sm text-white/35">Khi phim đang theo dõi có tập mới, thông báo sẽ xuất hiện tại đây.</div> : <div className="space-y-2">{notifications.slice(0, 20).map((item) => <Link key={item.id} to={`/phim/${item.movieSlug}`} className={`flex items-center gap-3 rounded-2xl border p-4 ${item.read ? 'border-white/[0.06] bg-[#0d0f18]' : 'border-red-500/20 bg-red-500/[0.06]'}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-300"><i className="ri-notification-3-fill" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.movieName}</strong><span className="mt-1 block text-xs text-white/40">Đã cập nhật {item.episode}</span></span><span className="text-[11px] text-white/25">{new Date(item.createdAt).toLocaleDateString('vi-VN')}</span></Link>)}</div>}
        </section>
      </main>
      <Footer />
    </div>
  );
}
