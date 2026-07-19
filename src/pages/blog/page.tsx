import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import SEO from '../../components/base/SEO';
import { blogPosts, blogCategories } from '../../mocks/blogPosts';

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

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPosts = useMemo(() => {
    let posts = blogPosts;
    
    if (activeCategory !== 'all') {
      const category = blogCategories.find(c => c.slug === activeCategory);
      if (category) {
        posts = posts.filter(p => p.category === category.name);
      }
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      posts = posts.filter(p => 
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    
    return posts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, [activeCategory, searchQuery]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'KhoPhim Blog - Review Phim & Tin Tức Điện Ảnh',
    url: 'https://khophim.org/blog',
    description: 'Blog review phim, top phim hay, hướng dẫn xem phim tại khophim.org',
    publisher: {
      '@type': 'Organization',
      name: 'KhoPhim',
      logo: {
        '@type': 'ImageObject',
        url: 'https://khophim.org/brand/khophim-logo-v2.png',
      },
    },
    blogPosts: filteredPosts.slice(0, 10).map(post => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `https://khophim.org/blog/${post.slug}`,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: {
        '@type': 'Organization',
        name: post.author,
      },
      image: post.image,
      keywords: post.tags.join(', '),
    })),
  };

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title="KhoPhim Blog - Review Phim & Tin Tức Điện Ảnh 2026"
        description="Blog review phim, top phim hay nhất 2026, hướng dẫn xem phim HD không giật lag. Tất cả đều có trên khophim.org - kho phim vietsub miễn phí!"
        keywords="khophim blog, review phim, top phim hay, phim 2026, hướng dẫn xem phim, khophim.org"
        canonical="/blog"
        ogType="website"
        schema={schema}
      />
      <Navbar />

      {/* Hero Section */}
      <div className="relative pt-24 pb-12 lg:pt-28 lg:pb-16">
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent" />
        <div className="max-w-[1760px] mx-auto px-4 lg:px-6 relative">
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full mb-4">
              <i className="ri-article-line text-red-400 text-sm" />
              <span className="text-red-400 text-xs font-semibold">KhoPhim Blog</span>
            </div>
            <h1 className="text-2xl lg:text-4xl font-bold mb-3">
              <span className="text-white">Review Phim &</span>{' '}
              <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">Tin Tức Điện Ảnh</span>
            </h1>
            <p className="text-white/50 text-sm lg:text-base leading-relaxed">
              Khám phá review phim chi tiết, top phim hay nhất 2026 và hướng dẫn xem phim HD 
              không giật lag tại <strong className="text-white/70">khophim.org</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className={`sticky top-16 z-40 bg-[#080a10]/95 border-b border-white/[0.06] py-4`}>
        <div className="max-w-[1760px] mx-auto px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <i className="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm bài viết, review phim..."
                className="w-full bg-white/[0.06] border border-white/[0.10] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-red-500/40 placeholder-white/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                >
                  <i className="ri-close-line text-sm" />
                </button>
              )}
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
              {blogCategories.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => setActiveCategory(cat.slug)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                    activeCategory === cat.slug
                      ? 'bg-red-500 text-white'
                      : 'bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.10]'
                  }`}
                >
                  {cat.name}
                  <span className={`ml-1.5 text-[10px] ${activeCategory === cat.slug ? 'text-white/70' : 'text-white/30'}`}>
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Blog Posts Grid */}
      <main className="max-w-[1760px] mx-auto px-4 lg:px-6 py-8">
        <h2 className="sr-only">Danh Sách Bài Viết KhoPhim Blog</h2>
        {filteredPosts.length === 0 ? (
          <div className="text-center py-16">
            <i className="ri-article-line text-5xl text-white/10 mb-4" />
            <p className="text-white/40 text-sm">Không tìm thấy bài viết nào</p>
            <button
              onClick={() => { setActiveCategory('all'); setSearchQuery(''); }}
              className="mt-3 text-red-400 text-sm hover:underline"
            >
              Xem tất cả bài viết
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPosts.map((post, index) => (
              <article
                key={post.id}
                className={`group bg-[#0d0f18] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-red-500/20 transition-all duration-300 ${
                  index === 0 ? 'md:col-span-2 lg:col-span-2' : ''
                }`}
              >
                <Link to={`/blog/${post.slug}`} className="block">
                  {/* Image */}
                  <div className={`relative overflow-hidden ${index === 0 ? 'aspect-[21/9] md:aspect-[21/8]' : 'aspect-[16/10]'}`}>
                    <img
                      src={post.image}
                      alt={post.title}
                      width={800}
                      height={450}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading={index < 3 ? 'eager' : 'lazy'}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f18] via-transparent to-transparent" />
                    
                    {/* Category Badge */}
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 bg-red-500/90 text-white text-[10px] font-semibold rounded-lg">
                        {post.category}
                      </span>
                    </div>

                    {/* Read Time */}
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 text-white/60 text-[11px]">
                      <i className="ri-time-line" />
                      {post.readTime} phút đọc
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    {/* Title */}
                    <h3 className={`font-bold text-white group-hover:text-red-400 transition-colors mb-2 line-clamp-2 ${
                      index === 0 ? 'text-lg md:text-xl' : 'text-base'
                    }`}>
                      {post.title}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-white/45 text-sm leading-relaxed line-clamp-2 mb-3">
                      {post.excerpt}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img
                          src={post.authorAvatar}
                          alt={post.author}
                          width={24}
                          height={24}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <span className="text-white/50 text-xs">{post.author}</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/30 text-[11px]">
                        <span className="flex items-center gap-1">
                          <i className="ri-calendar-line" />
                          {timeAgo(post.publishedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="ri-eye-line" />
                          {post.views.toLocaleString('vi-VN')}
                        </span>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-white/[0.04] text-white/40 text-[10px] rounded-md"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* CTA Section */}
      <section className="max-w-[1760px] mx-auto px-4 lg:px-6 py-12">
        <div className="bg-gradient-to-r from-red-500/10 to-amber-500/5 border border-red-500/20 rounded-2xl p-6 md:p-8 text-center">
          <h3 className="text-lg md:text-xl font-bold text-white mb-2">
            Xem Phim Miễn Phí Tại KhoPhim
          </h3>
          <p className="text-white/50 text-sm mb-4 max-w-lg mx-auto">
            Kho phim 50,000+ bộ, chất lượng HD vietsub, không quảng cáo. 
            Truy cập <strong className="text-red-400">khophim.org</strong> ngay hôm nay!
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <i className="ri-play-circle-line" />
              Xem Phim Ngay
            </Link>
            <Link
              to="/phim-moi-cap-nhat"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/[0.08] hover:bg-white/[0.12] text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <i className="ri-movie-2-line" />
              Phim Mới
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
