import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CountryConfig } from '../page';

interface Props {
  config: CountryConfig;
}

export default function CountrySEOContent({ config }: Props) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section className="mt-16 pt-12 pb-4" aria-label={`Thông tin ${config.name}`}>

      {/* Section heading */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-1 h-6 ${config.accentBg} rounded-full flex-shrink-0`} />
        <div className="flex-1">
          <h2 className="text-base font-bold text-white leading-snug">
            Xem {config.name} Vietsub Online Miễn Phí HD – Mới Nhất 2026
          </h2>
          <div className={`h-px bg-gradient-to-r ${config.gradientFrom} to-transparent mt-2`} />
        </div>
      </div>

      {/* Intro + Features */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10">
        <div className="lg:col-span-3">
          <p className="text-white/50 text-sm leading-relaxed mb-6">
            {config.seoIntro ?? `KhoPhim là điểm đến hàng đầu để xem ${config.name} vietsub online miễn phí với chất lượng HD Full HD. Kho phim cực kỳ đa dạng, cập nhật liên tục hàng ngày. Tất cả đều miễn phí, không quảng cáo, không cần đăng ký.`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {config.highlights.map((f, i) => {
              const icons = ['ri-check-double-line', 'ri-time-line', 'ri-translate-2', 'ri-play-circle-line', 'ri-hd-line'];
              return (
                <div
                  key={f}
                  className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 hover:border-white/10 transition-all"
                >
                  <div className={`w-7 h-7 flex items-center justify-center rounded-lg ${config.accentBg}/10 flex-shrink-0`}>
                    <i className={`${icons[i % icons.length]} ${config.accentColor} text-sm`} />
                  </div>
                  <span className="text-white/60 text-sm leading-snug">{f}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* FAQ */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <i className={`ri-question-answer-line ${config.accentColor} text-sm`} />
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Câu hỏi thường gặp</h2>
          </div>
          <div className="space-y-2">
            {config.faq.map((item, i) => (
              <div
                key={item.q}
                className={`rounded-xl border transition-all overflow-hidden ${
                  openFaq === i
                    ? `border-white/15 bg-white/[0.04]`
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                }`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer text-left"
                >
                  <strong className={`text-sm font-medium leading-snug transition-colors ${openFaq === i ? 'text-white' : 'text-white/70'}`}>
                    {item.q}
                  </strong>
                  <div className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 transition-all ${openFaq === i ? `${config.accentBg}/20 rotate-45` : 'bg-white/5'}`}>
                    <i className={`ri-add-line text-xs ${openFaq === i ? config.accentColor : 'text-white/30'}`} />
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4">
                    <div className="h-px bg-white/[0.06] mb-3" />
                    <p className="text-white/45 text-sm leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews */}
      {config.reviews && config.reviews.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-1 h-5 ${config.accentBg}/60 rounded-full flex-shrink-0`} />
            <h2 className="text-sm font-bold text-white/80">Đánh Giá Phim Nổi Bật</h2>
            <span className="text-[11px] text-white/25 bg-white/[0.04] border border-white/[0.06] px-2.5 py-0.5 rounded-full">
              Biên tập viên KhoPhim
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {config.reviews.map((review) => (
              <article
                key={review.title}
                className="group bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all"
                itemScope
                itemType="https://schema.org/Review"
              >
                <div itemProp="itemReviewed" itemScope itemType="https://schema.org/Movie" className="hidden">
                  <meta itemProp="name" content={review.title} />
                  <meta itemProp="dateCreated" content={String(review.year)} />
                </div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold text-sm leading-snug group-hover:text-white/80 transition-colors">
                      {review.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded-md">{review.year}</span>
                      <span className="text-[11px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded-md">{review.genre}</span>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl flex-shrink-0"
                    itemProp="reviewRating"
                    itemScope
                    itemType="https://schema.org/Rating"
                  >
                    <i className="ri-star-fill text-amber-400 text-xs" />
                    <span className="text-amber-300 text-xs font-bold" itemProp="ratingValue">{review.rating}</span>
                    <meta itemProp="bestRating" content="10" />
                    <meta itemProp="worstRating" content="1" />
                  </div>
                </div>
                <p className="text-white/45 text-sm leading-relaxed line-clamp-4" itemProp="reviewBody">
                  {review.review}
                </p>
                <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <i className="ri-quill-pen-line text-white/40 text-[9px]" />
                  </div>
                  <span
                    className="text-[11px] text-white/20"
                    itemProp="author"
                    itemScope
                    itemType="https://schema.org/Organization"
                  >
                    Đánh giá bởi <span itemProp="name" className="text-white/35">KhoPhim</span>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Related links */}
      <div className="border-t border-white/[0.05] pt-6">
        <div className="flex items-center gap-2 mb-3">
          <i className="ri-links-line text-white/20 text-sm" />
          <h2 className="text-xs font-semibold text-white/25 uppercase tracking-wider">Danh mục liên quan</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.related.map((r) => (
            <Link
              key={r.href}
              to={r.href}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/70 border border-white/[0.06] hover:border-white/10 rounded-full text-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-right-s-line text-xs" />
              {r.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
