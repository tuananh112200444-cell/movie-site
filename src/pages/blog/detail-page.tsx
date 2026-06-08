import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import SEO from '../../components/base/SEO';
import { blogPosts, blogCategories } from '../../mocks/blogPosts';
import NotFound from '../NotFound';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

// Social Share Component
function SocialShare({ title, url }: { title: string; url: string }) {
  const shareLinks = [
    {
      name: 'Facebook',
      icon: 'ri-facebook-fill',
      color: 'bg-[#1877F2] hover:bg-[#166fe5]',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      name: 'Twitter',
      icon: 'ri-twitter-x-fill',
      color: 'bg-[#1DA1F2] hover:bg-[#1a91da]',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    },
    {
      name: 'Telegram',
      icon: 'ri-telegram-fill',
      color: 'bg-[#29A8E8] hover:bg-[#2497d1]',
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    },
    {
      name: 'Zalo',
      icon: 'ri-chat-3-fill',
      color: 'bg-[#0068FF] hover:bg-[#005ce6]',
      href: `https://share.zalo.me/?url=${encodeURIComponent(url)}`,
    },
    {
      name: 'Copy Link',
      icon: 'ri-link',
      color: 'bg-white/[0.10] hover:bg-white/[0.15]',
      onClick: () => {
        navigator.clipboard.writeText(url).catch(() => { /* silent */ });
      },
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {shareLinks.map((link) =>
        link.href ? (
          <a
            key={link.name}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 px-3 py-1.5 ${link.color} text-white text-xs font-medium rounded-lg transition-colors`}
            title={`Chia sẻ qua ${link.name}`}
          >
            <i className={`${link.icon} text-sm`} />
            <span className="hidden sm:inline">{link.name}</span>
          </a>
        ) : (
          <button
            key={link.name}
            onClick={link.onClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 ${link.color} text-white text-xs font-medium rounded-lg transition-colors cursor-pointer`}
          >
            <i className={`${link.icon} text-sm`} />
            <span className="hidden sm:inline">{link.name}</span>
          </button>
        )
      )}
    </div>
  );
}

export default function BlogDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const post = useMemo(() => {
    return blogPosts.find((p) => p.slug === slug);
  }, [slug]);

  const relatedPosts = useMemo(() => {
    if (!post) return [];
    return blogPosts
      .filter((p) => p.id !== post.id && (p.category === post.category || p.tags.some((t) => post.tags.includes(t))))
      .slice(0, 3);
  }, [post]);

  if (!post) {
    return <NotFound />;
  }

  const postUrl = `https://khophim.org/blog/${post.slug}`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    url: postUrl,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      '@type': 'Organization',
      name: post.author,
      logo: {
        '@type': 'ImageObject',
        url: post.authorAvatar,
      },
    },
    publisher: {
      '@type': 'Organization',
      name: 'KhoPhim',
      logo: {
        '@type': 'ImageObject',
        url: 'https://public.readdy.ai/ai/img_res/e1260dce-9377-44c8-83b0-d22bf9614677.png',
      },
    },
    image: {
      '@type': 'ImageObject',
      url: post.image,
      width: 1200,
      height: 630,
    },
    keywords: post.tags.join(', '),
    articleSection: post.category,
    wordCount: post.content.length,
    timeRequired: `PT${post.readTime}M`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': postUrl,
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: 'https://khophim.org/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://khophim.org/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: postUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <SEO
        title={post.title}
        description={post.excerpt}
        keywords={post.tags.join(', ')}
        canonical={`/blog/${post.slug}`}
        ogType="article"
        ogImage={post.image}
        schema={[schema, breadcrumbSchema]}
      />
      <Navbar />

      {/* Breadcrumb */}
      <div className="pt-20 pb-4 border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
          <nav className="flex items-center gap-2 text-xs text-white/40">
            <Link to="/" className="hover:text-white transition-colors">
              Trang Chủ
            </Link>
            <i className="ri-arrow-right-s-line text-white/20" />
            <Link to="/blog" className="hover:text-white transition-colors">
              Blog
            </Link>
            <i className="ri-arrow-right-s-line text-white/20" />
            <span className="text-white/60 truncate max-w-[200px]">{post.title}</span>
          </nav>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Main Content */}
          <article>
            {/* Header */}
            <header className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 bg-red-500/10 text-red-400 text-[11px] font-semibold rounded-md">
                  {post.category}
                </span>
                <span className="text-white/30 text-[11px]">{timeAgo(post.publishedAt)}</span>
              </div>

              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white leading-tight mb-4">
                {post.title}
              </h1>

              {/* Author & Meta */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/50">
                <div className="flex items-center gap-2">
                  <img src={post.authorAvatar} alt={post.author} width="32" height="32" className="w-8 h-8 rounded-full object-cover" />
                  <span>{post.author}</span>
                </div>
                <span className="flex items-center gap-1">
                  <i className="ri-calendar-line" />
                  {formatDate(post.publishedAt)}
                </span>
                <span className="flex items-center gap-1">
                  <i className="ri-time-line" />
                  {post.readTime} phút đọc
                </span>
                <span className="flex items-center gap-1">
                  <i className="ri-eye-line" />
                  {post.views.toLocaleString('vi-VN')} lượt xem
                </span>
              </div>
            </header>

            {/* Featured Image */}
            <div className="relative aspect-[16/9] rounded-2xl overflow-hidden mb-6">
              <img src={post.image} alt={post.title} width="1200" height="675" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080a10]/50 to-transparent" />
            </div>

            {/* Share Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl mb-6">
              <span className="text-white/50 text-sm">Chia sẻ bài viết:</span>
              <SocialShare title={post.title} url={postUrl} />
            </div>

            {/* Content */}
            <div
              className="prose prose-invert prose-sm md:prose-base max-w-none prose-headings:text-white prose-headings:font-bold prose-p:text-white/70 prose-p:leading-relaxed prose-a:text-red-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-white prose-ul:text-white/70 prose-li:marker:text-red-400 prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-white/[0.06]">
              <span className="text-white/40 text-sm mr-2">Tags:</span>
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/blog?tag=${tag}`}
                  className="px-3 py-1 bg-white/[0.06] text-white/60 text-xs rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  #{tag}
                </Link>
              ))}
            </div>

            {/* Share Bottom */}
            <div className="mt-8 p-4 bg-gradient-to-r from-red-500/5 to-amber-500/5 border border-red-500/10 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-white font-semibold text-sm">Thích bài viết này?</p>
                  <p className="text-white/40 text-xs">Chia sẻ để bạn bè cùng đọc nhé!</p>
                </div>
                <SocialShare title={post.title} url={postUrl} />
              </div>
            </div>

            {/* CTA to Movie */}
            {post.movieSlug && (
              <div className="mt-8 p-5 bg-white/[0.03] border border-white/[0.08] rounded-xl">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 flex items-center justify-center bg-red-500/10 rounded-xl flex-shrink-0">
                    <i className="ri-movie-2-line text-red-400 text-xl" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm mb-1">Xem phim ngay tại KhoPhim</p>
                    <p className="text-white/40 text-xs mb-3">
                      Bài review này nói về một bộ phim đang có trên khophim.org
                    </p>
                    <Link
                      to={`/phim/${encodeURIComponent(post.movieSlug)}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <i className="ri-play-circle-line" />
                      Xem Phim Ngay
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </article>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* About KhoPhim */}
            <div className="bg-[#0d0f18] border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <img
                  src="https://public.readdy.ai/ai/img_res/e1260dce-9377-44c8-83b0-d22bf9614677.png"
                  alt="KhoPhim"
                  width="40" height="40"
                  className="w-10 h-10 rounded-xl"
                />
                <div>
                  <p className="text-white font-semibold text-sm">KhoPhim</p>
                  <p className="text-white/40 text-xs">khophim.org</p>
                </div>
              </div>
              <p className="text-white/50 text-xs leading-relaxed">
                Kho phim vietsub HD miễn phí hàng đầu Việt Nam. 50,000+ bộ phim, không quảng cáo, xem ngay!
              </p>
              <Link
                to="/"
                className="mt-3 inline-flex items-center gap-1 text-red-400 text-xs font-medium hover:underline"
              >
                Xem phim ngay <i className="ri-arrow-right-line" />
              </Link>
            </div>

            {/* Categories */}
            <div className="bg-[#0d0f18] border border-white/[0.06] rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-3">Danh Mục</h2>
              <div className="space-y-1">
                {blogCategories
                  .filter((c) => c.slug !== 'all')
                  .map((cat) => (
                    <Link
                      key={cat.slug}
                      to={`/blog?category=${cat.slug}`}
                      className="flex items-center justify-between px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"
                    >
                      <span>{cat.name}</span>
                      <span className="text-white/30 text-xs">{cat.count}</span>
                    </Link>
                  ))}
              </div>
            </div>

            {/* Related Posts */}
            {relatedPosts.length > 0 && (
              <div className="bg-[#0d0f18] border border-white/[0.06] rounded-xl p-5">
                <h2 className="text-white font-semibold text-sm mb-3">Bài Viết Liên Quan</h2>
                <div className="space-y-3">
                  {relatedPosts.map((p) => (
                    <Link key={p.id} to={`/blog/${p.slug}`} className="flex gap-3 group">
                      <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={p.image}
                          alt={p.title}
                          width="80" height="56"
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/70 text-xs font-medium line-clamp-2 group-hover:text-red-400 transition-colors">
                          {p.title}
                        </p>
                        <p className="text-white/30 text-[10px] mt-1">{timeAgo(p.publishedAt)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Links */}
            <div className="bg-gradient-to-br from-red-500/10 to-amber-500/5 border border-red-500/20 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-3">Xem Phim Hot</h2>
              <div className="space-y-2">
                {[
                  { name: 'Phim Hàn Quốc', to: '/phim-han-quoc' },
                  { name: 'Phim Chiếu Rạp', to: '/phim-chieu-rap' },
                  { name: 'Phim Mới Cập Nhật', to: '/phim-moi-cap-nhat' },
                  { name: 'Phim Lẻ Hay', to: '/phim-le' },
                ].map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center justify-between px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                  >
                    <span>{link.name}</span>
                    <i className="ri-arrow-right-s-line text-white/30" />
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}