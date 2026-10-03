import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchMovieComments, setMovieCommentLiked, submitMovieComment, type PublicMovieComment } from '@/services/communityService';

interface Props { slug: string; movieName: string }

const COLORS = ['bg-red-500', 'bg-orange-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-violet-500', 'bg-pink-500'];

function initials(name: string) {
  return name.trim().split(/\s+/).map((word) => word[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = name.charCodeAt(index) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function timeAgo(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} ngày trước` : new Date(value).toLocaleDateString('vi-VN');
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/authentication|required|jwt/i.test(message)) return 'Bạn cần đăng nhập để thực hiện thao tác này.';
  if (/too many/i.test(message)) return 'Bạn đã gửi nhiều bình luận. Vui lòng chờ ít phút.';
  return 'Chưa thể kết nối hệ thống bình luận. Vui lòng thử lại sau.';
}

export default function UserComments({ slug, movieName }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<PublicMovieComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'top'>('newest');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setComments(await fetchMovieComments(slug));
      setError('');
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel(`movie-comments-${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movie_comments', filter: `movie_slug=eq.${slug}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, slug]);

  const sorted = useMemo(() => [...comments].sort((left, right) => sortBy === 'top'
    ? right.likes - left.likes
    : new Date(right.created_at).getTime() - new Date(left.created_at).getTime()), [comments, sortBy]);
  const average = comments.length ? (comments.reduce((sum, item) => sum + item.rating, 0) / comments.length).toFixed(1) : '0.0';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || text.trim().length < 3) return;
    setSubmitting(true);
    setError('');
    try {
      await submitMovieComment({
        movieSlug: slug,
        rating,
        body: text,
        authorName: String(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Thành viên KhoPhim'),
      });
      setText('');
      setRating(5);
      await load();
    } catch (submitError) {
      setError(friendlyError(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (comment: PublicMovieComment) => {
    if (!user) { setError('Bạn cần đăng nhập để thích bình luận.'); return; }
    const liked = !comment.liked;
    setComments((items) => items.map((item) => item.id === comment.id
      ? { ...item, liked, likes: Math.max(0, item.likes + (liked ? 1 : -1)) }
      : item));
    try { await setMovieCommentLiked(comment.id, liked); }
    catch (likeError) { setError(friendlyError(likeError)); void load(); }
  };

  return (
    <section className="mb-6 mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0f18]" aria-labelledby="community-comments-title">
      <div className="border-b border-white/[0.06] px-5 py-5 md:px-7">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-red-500" />
          <h2 id="community-comments-title" className="font-bold">Bình luận &amp; đánh giá công khai</h2>
          <span className="text-xs text-white/30">— {movieName}</span>
          <span className="ml-auto rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"><i className="ri-global-line mr-1" /> Mọi người đều thấy</span>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="text-3xl font-black">{average}</div>
          <div>
            <div className="flex gap-0.5">{[1,2,3,4,5].map((star) => <i key={star} className={`ri-star-fill text-sm ${Number(average) >= star ? 'text-amber-400' : 'text-white/15'}`} />)}</div>
            <p className="mt-1 text-[11px] text-white/30">{comments.length} đánh giá công khai</p>
          </div>
        </div>
      </div>

      <div className="border-b border-white/[0.06] px-5 py-5 md:px-7">
        {user ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold">Chia sẻ với cộng đồng</p>
              <div className="flex items-center gap-1" aria-label={`Đánh giá ${rating} sao`}>
                {[1,2,3,4,5].map((star) => <button key={star} type="button" onClick={() => setRating(star)} aria-label={`${star} sao`} className="flex h-11 w-11 items-center justify-center rounded-lg"><i className={`ri-star-fill text-xl ${rating >= star ? 'text-amber-400' : 'text-white/15'}`} /></button>)}
              </div>
            </div>
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} minLength={3} maxLength={1000} required placeholder="Viết cảm nhận của bạn..." className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-white/25 focus:border-red-500/45" />
            <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-white/25">{text.length}/1000 · Hiển thị công khai</span><button disabled={submitting || text.trim().length < 3} className="min-h-11 rounded-xl bg-red-500 px-5 text-sm font-bold disabled:opacity-40">{submitting ? 'Đang đăng...' : 'Đăng bình luận'}</button></div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold">Tham gia thảo luận</p><p className="mt-1 text-xs text-white/40">Đăng nhập để bình luận, đánh giá và thích ý kiến khác.</p></div>
            <Link to="/tai-khoan" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-bold"><i className="ri-login-box-line" /> Đăng nhập</Link>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-xs text-amber-300">{error}</p>}
      </div>

      <div className="px-5 py-5 md:px-7">
        <div className="mb-4 flex gap-2">
          {(['newest', 'top'] as const).map((value) => <button key={value} onClick={() => setSortBy(value)} className={`min-h-11 rounded-xl px-3 text-xs font-semibold ${sortBy === value ? 'bg-red-500/15 text-red-300' : 'text-white/40'}`}>{value === 'newest' ? 'Mới nhất' : 'Nhiều lượt thích'}</button>)}
        </div>
        {loading ? <div className="h-20 animate-pulse rounded-xl bg-white/[0.04]" /> : sorted.length === 0 ? (
          <div className="py-8 text-center"><i className="ri-chat-3-line text-3xl text-white/15" /><p className="mt-2 text-sm text-white/35">Chưa có bình luận công khai. Hãy là người đầu tiên.</p></div>
        ) : (
          <div className="space-y-5">
            {sorted.map((comment) => <article key={comment.id} className="flex gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor(comment.author_name)}`}>{initials(comment.author_name)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{comment.author_name}</span><div className="flex">{[1,2,3,4,5].map((star) => <i key={star} className={`ri-star-fill text-[10px] ${comment.rating >= star ? 'text-amber-400' : 'text-white/10'}`} />)}</div><span className="text-[11px] text-white/25">{timeAgo(comment.created_at)}</span></div>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-white/65">{comment.body}</p>
                <button onClick={() => void handleLike(comment)} className={`mt-2 flex min-h-11 items-center gap-1.5 text-xs ${comment.liked ? 'text-red-400' : 'text-white/30 hover:text-white/60'}`}><i className={comment.liked ? 'ri-heart-fill' : 'ri-heart-line'} /> {comment.likes || 'Thích'}</button>
              </div>
            </article>)}
          </div>
        )}
      </div>
    </section>
  );
}
