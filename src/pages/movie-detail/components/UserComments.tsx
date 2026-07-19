import { useState, useEffect, useCallback, useRef } from 'react';

interface Comment {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  text: string;
  createdAt: string;
  likes: number;
  liked: boolean;
}

interface UserCommentsProps {
  slug: string;
  movieName: string;
}

const STORAGE_KEY = (slug: string) => `khophim_comments_${slug}`;

const AVATAR_COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
  'bg-violet-500', 'bg-pink-500', 'bg-rose-500',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.trim().split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return 'Không xác định';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} ngày trước`;
  return date.toLocaleDateString('vi-VN');
}

const SEED_COMMENTS: Omit<Comment, 'liked'>[] = [
  {
    id: 'seed-1',
    name: 'Minh Tuấn',
    avatar: '',
    rating: 5,
    text: 'Phim hay quá! Cốt truyện hấp dẫn, diễn xuất tuyệt vời. Xem một mạch không dừng được. Cảm ơn KhoPhim đã cập nhật nhanh!',
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    likes: 24,
  },
  {
    id: 'seed-2',
    name: 'Lan Anh',
    avatar: '',
    rating: 4,
    text: 'Phim khá hay, hình ảnh đẹp, âm nhạc cũng ổn. Chỉ tiếc là tập cuối hơi vội. Nhưng nhìn chung rất đáng xem!',
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    likes: 18,
  },
  {
    id: 'seed-3',
    name: 'Hoàng Nam',
    avatar: '',
    rating: 5,
    text: 'Đỉnh của chóp! Mình đã xem đi xem lại 3 lần rồi mà vẫn không chán. Diễn viên chính diễn xuất quá đỉnh.',
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    likes: 41,
  },
];

export default function UserComments({ slug, movieName }: UserCommentsProps) {
  const [comments, setComments]     = useState<Comment[]>([]);
  const [name, setName]             = useState('');
  const [text, setText]             = useState('');
  const [rating, setRating]         = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [sortBy, setSortBy]         = useState<'newest' | 'top'>('newest');
  const [showAll, setShowAll]       = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  /* Load from localStorage */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(slug));
      const saved: Comment[] = raw ? JSON.parse(raw) : [];
      // Merge seed + saved, seed ở cuối
      const seedWithLiked = SEED_COMMENTS.map((c) => ({ ...c, liked: false }));
      const merged = [...saved, ...seedWithLiked.filter((s) => !saved.find((sv) => sv.id === s.id))];
      setComments(merged);
    } catch {
      setComments(SEED_COMMENTS.map((c) => ({ ...c, liked: false })));
    }
  }, [slug]);

  const saveToStorage = useCallback((list: Comment[]) => {
    try {
      // Chỉ lưu comment của user (không lưu seed)
      const userComments = list.filter((c) => !c.id.startsWith('seed-'));
      localStorage.setItem(STORAGE_KEY(slug), JSON.stringify(userComments));
    } catch { /* ignore */ }
  }, [slug]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !text.trim()) return;
    setSubmitting(true);

    setTimeout(() => {
      const newComment: Comment = {
        id: `user-${Date.now()}`,
        name: name.trim(),
        avatar: '',
        rating,
        text: text.trim(),
        createdAt: new Date().toISOString(),
        likes: 0,
        liked: false,
      };
      setComments((prev) => {
        const updated = [newComment, ...prev];
        saveToStorage(updated);
        return updated;
      });
      setName('');
      setText('');
      setRating(5);
      setSubmitting(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    }, 600);
  }, [name, text, rating, saveToStorage]);

  const handleLike = useCallback((id: string) => {
    setComments((prev) => {
      const updated = prev.map((c) =>
        c.id === id
          ? { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 }
          : c
      );
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  const sorted = [...comments].sort((a, b) => {
    if (sortBy === 'top') return b.likes - a.likes;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const displayed = showAll ? sorted : sorted.slice(0, 5);
  const avgRating = comments.length > 0
    ? (comments.reduce((s, c) => s + c.rating, 0) / comments.length).toFixed(1)
    : '0';

  const ratingDist = [5, 4, 3, 2, 1].map((r) => ({
    star: r,
    count: comments.filter((c) => c.rating === r).length,
    pct: comments.length > 0 ? (comments.filter((c) => c.rating === r).length / comments.length) * 100 : 0,
  }));

  return (
    <section className="mt-6 mb-6 rounded-2xl border border-white/[0.06] bg-[#0d0f18] overflow-hidden">
      {/* Header */}
      <div className="px-5 md:px-7 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1 h-5 bg-red-500 rounded-full flex-shrink-0" />
          <h3 className="text-white font-bold text-base">Bình Luận &amp; Đánh Giá</h3>
          <span className="text-white/30 text-sm ml-1">— {movieName}</span>
          <span className="ml-auto text-white/30 text-xs bg-white/5 border border-white/8 px-2.5 py-1 rounded-full">
            {comments.length} bình luận
          </span>
        </div>

        {/* Rating summary */}
        {comments.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mt-4">
            {/* Big score */}
            <div className="text-center flex-shrink-0">
              <div className="text-4xl font-bold text-white leading-none">{avgRating}</div>
              <div className="flex items-center justify-center gap-0.5 mt-1.5">
                {[1,2,3,4,5].map((s) => (
                  <i key={s} className={`ri-star-fill text-sm ${parseFloat(avgRating) >= s ? 'text-amber-400' : 'text-white/15'}`} />
                ))}
              </div>
              <div className="text-white/30 text-[11px] mt-1">/ 5 sao</div>
            </div>
            {/* Distribution bars */}
            <div className="flex-1 space-y-1.5">
              {ratingDist.map(({ star, count, pct }) => (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-[11px] text-white/40 w-3 text-right flex-shrink-0">{star}</span>
                  <i className="ri-star-fill text-amber-400/60 text-[10px] flex-shrink-0" />
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400/70 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-white/25 w-4 flex-shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Comment form */}
      <div className="px-5 md:px-7 py-5 border-b border-white/[0.06]">
        <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <i className="ri-edit-line text-red-400" /> Viết bình luận của bạn
        </p>
        {submitted ? (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <i className="ri-checkbox-circle-fill text-emerald-400 text-lg" />
            <div>
              <p className="text-emerald-300 text-sm font-semibold">Đã gửi bình luận!</p>
              <p className="text-emerald-400/60 text-xs mt-0.5">Cảm ơn bạn đã chia sẻ cảm nhận.</p>
            </div>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            {/* Name */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên của bạn..."
              maxLength={40}
              required
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.06] transition-all"
            />

            {/* Star rating */}
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-xs">Đánh giá:</span>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={`Đánh giá ${s} sao`}
                    aria-pressed={rating === s}
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="w-7 h-7 flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                  >
                    <i className={`ri-star-fill text-xl transition-colors ${
                      (hoverRating || rating) >= s ? 'text-amber-400' : 'text-white/15'
                    }`} />
                  </button>
                ))}
              </div>
              <span className="text-amber-400 text-xs font-semibold">
                {['', 'Tệ', 'Không hay', 'Bình thường', 'Hay', 'Tuyệt vời'][hoverRating || rating]}
              </span>
            </div>

            {/* Text */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Chia sẻ cảm nhận của bạn về phim ${movieName}...`}
              rows={3}
              maxLength={500}
              required
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.06] transition-all resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-white/20 text-[11px]">{text.length}/500</span>
              <button
                type="submit"
                disabled={submitting || !name.trim() || !text.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap"
              >
                {submitting ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang gửi...</>
                ) : (
                  <><i className="ri-send-plane-fill text-sm" /> Gửi bình luận</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Sort + Comments list */}
      <div className="px-5 md:px-7 py-5">
        {/* Sort bar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-white/30 text-xs">Sắp xếp:</span>
          {(['newest', 'top'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                sortBy === s
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-white/40 hover:text-white border border-transparent hover:border-white/10'
              }`}
            >
              {s === 'newest' ? 'Mới nhất' : 'Nhiều like nhất'}
            </button>
          ))}
        </div>

        {/* Comments */}
        <div className="space-y-4">
          {displayed.map((c) => (
            <div key={c.id} className="flex gap-3">
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${getAvatarColor(c.name)}`}>
                {getInitials(c.name)}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-white/80 text-sm font-semibold">{c.name}</span>
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map((s) => (
                      <i key={s} className={`ri-star-fill text-[11px] ${c.rating >= s ? 'text-amber-400' : 'text-white/10'}`} />
                    ))}
                  </div>
                  <span className="text-white/25 text-[11px]">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">{c.text}</p>
                <button
                  onClick={() => handleLike(c.id)}
                  className={`mt-2 flex items-center gap-1.5 text-[11px] transition-all cursor-pointer ${
                    c.liked ? 'text-red-400' : 'text-white/30 hover:text-white/60'
                  }`}
                >
                  <i className={c.liked ? 'ri-heart-fill' : 'ri-heart-line'} />
                  <span>{c.likes > 0 ? c.likes : ''} Thích</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Show more */}
        {sorted.length > 5 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-5 w-full py-2.5 rounded-xl border border-white/[0.08] text-white/40 hover:text-white hover:border-white/20 text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <i className={showAll ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
            {showAll ? 'Thu gọn' : `Xem thêm ${sorted.length - 5} bình luận`}
          </button>
        )}

        {comments.length === 0 && (
          <div className="text-center py-8">
            <i className="ri-chat-3-line text-4xl text-white/10 mb-2 block" />
            <p className="text-white/30 text-sm">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
          </div>
        )}
      </div>
    </section>
  );
}
