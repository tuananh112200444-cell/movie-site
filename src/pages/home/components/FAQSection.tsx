import { useState } from 'react';

const faqs = [
  {
    question: 'KhoPhim có xem phim online miễn phí không?',
    answer: 'Có, KhoPhim (khophim.org) cung cấp dịch vụ xem phim online hoàn toàn miễn phí với chất lượng HD và Full HD, không cần đăng ký tài khoản, không có quảng cáo phiền phức. Bạn chỉ cần truy cập website và chọn phim muốn xem ngay lập tức.',
  },
  {
    question: 'KhoPhim có những thể loại phim nào?',
    answer: 'KhoPhim có đầy đủ các thể loại: phim lẻ, phim bộ, phim chiếu rạp, hoạt hình, TV shows, phim Hàn Quốc, phim Trung Quốc, phim Âu Mỹ, phim Thái Lan, phim Nhật Bản, phim Việt Nam và nhiều thể loại khác. Tổng cộng hơn 50,000 bộ phim từ khắp nơi trên thế giới.',
  },
  {
    question: 'Có thể xem phim mới nhất 2026 ở đâu?',
    answer: 'KhoPhim cập nhật phim mới hàng ngày, bao gồm phim chiếu rạp, phim bộ đang phát sóng và phim từ Netflix, HBO, Disney+. Bạn có thể xem phim mới nhất tại trang chủ hoặc vào mục Phim Mới Cập Nhật để tìm kiếm phim hay nhất 2026.',
  },
  {
    question: 'Xem phim trên KhoPhim có cần tải app không?',
    answer: 'Không cần tải app, bạn có thể xem phim trực tiếp trên trình duyệt web mà không cần cài đặt thêm gì cả. KhoPhim tương thích hoàn toàn với Chrome, Safari, Firefox trên cả máy tính và điện thoại.',
  },
  {
    question: 'Phim trên KhoPhim có phụ đề tiếng Việt không?',
    answer: 'Phần lớn phim nước ngoài trên KhoPhim đều có phụ đề tiếng Việt (vietsub) hoặc được lồng tiếng Việt, giúp người xem dễ theo dõi nội dung. Phụ đề được dịch chuẩn xác và đồng bộ hoàn hảo với hình ảnh.',
  },
  {
    question: 'KhoPhim có phim Hàn Quốc vietsub không?',
    answer: 'Có! KhoPhim có kho phim Hàn Quốc vietsub cực kỳ đồ sộ với hàng nghìn drama từ romance, hành động, kinh dị đến cổ trang. Phim Hàn được cập nhật nhanh nhất sau khi phát sóng tại Hàn Quốc, bao gồm cả phim từ tvN, SBS, MBC và Netflix Korea.',
  },
  {
    question: 'Xem phim HD trên KhoPhim có cần internet tốc độ cao không?',
    answer: 'KhoPhim sử dụng công nghệ HLS tự động điều chỉnh chất lượng video theo tốc độ mạng của bạn. Với đường truyền 5 Mbps trở lên, bạn có thể xem phim Full HD 1080p mượt mà. Với mạng chậm hơn, hệ thống tự động giảm xuống 720p hoặc 480p để đảm bảo xem không bị giật.',
  },
  {
    question: 'KhoPhim có lưu lịch sử xem phim không?',
    answer: 'Có, KhoPhim tự động lưu lịch sử xem phim và vị trí đang xem ngay trên trình duyệt của bạn. Lần sau vào trang, bạn có thể tiếp tục xem từ chỗ đã dừng. Tính năng này hoạt động hoàn toàn mà không cần đăng ký tài khoản.',
  },
  {
    question: 'Phim chiếu rạp có trên KhoPhim không?',
    answer: 'Có! KhoPhim cập nhật phim chiếu rạp nhanh sau khi ra mắt, bao gồm blockbuster Hollywood (Marvel, DC, Disney), phim Hàn Quốc chiếu rạp và phim Việt Nam chiếu rạp. Tất cả đều có vietsub HD miễn phí.',
  },
  {
    question: 'KhoPhim có an toàn để xem phim không?',
    answer: 'KhoPhim (khophim.org) là trang web xem phim an toàn, không chứa virus hay phần mềm độc hại. Website không yêu cầu cài đặt bất kỳ phần mềm nào, không thu thập thông tin cá nhân và không có quảng cáo pop-up nguy hiểm. Bạn có thể yên tâm xem phim trực tiếp trên trình duyệt.',
  },
];

export default function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIdx(openIdx === i ? null : i);

  return (
    <section className="py-10 mt-4" aria-label="Câu hỏi thường gặp">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-5 bg-red-500 rounded-full" />
        <h2 id="faq" className="text-white font-bold text-base">
          <a href="#faq" className="hover:text-red-400 transition-colors">Câu Hỏi Thường Gặp Về KhoPhim</a>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {faqs.map((faq, i) => (
          <div
            key={i}
            className="bg-[#141720] border border-white/5 rounded-xl overflow-hidden transition-all"
          >
            <button
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left cursor-pointer"
              aria-expanded={openIdx === i}
            >
              <span className="text-sm font-medium text-white/80">{faq.question}</span>
              <i
                className={`ri-arrow-down-s-line text-white/40 text-lg flex-shrink-0 transition-transform duration-200 ${
                  openIdx === i ? 'rotate-180' : ''
                }`}
              />
            </button>

            <div
              className={`overflow-hidden transition-all duration-200 ${
                openIdx === i ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <p className="px-4 pb-4 text-sm text-white/45 leading-relaxed">
                {faq.answer}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
