import { useState } from 'react';
import type { ActorInfo } from '@/mocks/actors';

interface ActorFAQProps {
  actor: ActorInfo;
}

function buildFAQ(actor: ActorInfo): Array<{ q: string; a: string }> {
  return [
    {
      q: `${actor.name} sinh năm bao nhiêu?`,
      a: `${actor.name} sinh ngày ${actor.born} tại ${actor.birthplace}. ${actor.height ? `Chiều cao của ${actor.name} là ${actor.height}.` : ''}`,
    },
    {
      q: `Phim ${actor.name} hay nhất là gì?`,
      a: `${actor.name} nổi tiếng với nhiều bộ phim xuất sắc, trong đó nổi bật nhất là: ${actor.knownFor.join(', ')}. Tất cả các phim này đều có thể xem miễn phí vietsub HD tại KhoPhim.`,
    },
    {
      q: `Xem phim ${actor.name} vietsub ở đâu miễn phí?`,
      a: `Bạn có thể xem toàn bộ phim của ${actor.name} vietsub HD miễn phí tại KhoPhim (khophim.org). Trang web cập nhật đầy đủ các bộ phim của ${actor.name} với chất lượng HD, không quảng cáo, không cần đăng ký.`,
    },
    {
      q: `${actor.name} đã nhận được những giải thưởng nào?`,
      a: `${actor.name} đã nhận được nhiều giải thưởng danh giá trong sự nghiệp diễn xuất: ${actor.awards.join('; ')}.`,
    },
    {
      q: `${actor.name} thuộc công ty giải trí nào?`,
      a: actor.agency
        ? `${actor.name} hiện đang thuộc công ty giải trí ${actor.agency}. Đây là một trong những công ty quản lý nghệ sĩ hàng đầu tại Hàn Quốc.`
        : `${actor.name} là một trong những diễn viên hàng đầu của điện ảnh Hàn Quốc với sự nghiệp diễn xuất đáng ngưỡng mộ.`,
    },
    {
      q: `Phim mới nhất của ${actor.name} là gì?`,
      a: `KhoPhim luôn cập nhật phim mới nhất của ${actor.name} ngay khi phát hành. Truy cập trang diễn viên ${actor.name} tại KhoPhim để xem danh sách phim mới nhất và đầy đủ nhất.`,
    },
  ];
}

export default function ActorFAQ({ actor }: ActorFAQProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqs = buildFAQ(actor);

  return (
    <section className="mt-10">
      <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
        <span className="w-1 h-4 bg-red-500 rounded-full flex-shrink-0" />
        Câu Hỏi Thường Gặp Về {actor.name}
      </h3>

      <div className="space-y-2">
        {faqs.map((faq, idx) => (
          <div
            key={idx}
            className="bg-[#0d0f1a] border border-white/[0.07] rounded-xl overflow-hidden"
          >
            <button
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer group"
            >
              <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors pr-4">
                {faq.q}
              </span>
              <i className={`ri-arrow-down-s-line text-white/40 flex-shrink-0 transition-transform duration-300 ${openIdx === idx ? 'rotate-180 text-red-400' : ''}`} />
            </button>
            {openIdx === idx && (
              <div className="px-5 pb-4 border-t border-white/[0.05]">
                <p className="text-sm text-white/55 leading-relaxed pt-3">{faq.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export { buildFAQ };
