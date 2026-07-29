import { useState } from 'react';

const faqs = [
  {
    question: 'Làm sao tìm một bộ phim trên KhoPhim?',
    answer: 'Dùng ô tìm kiếm với tên tiếng Việt hoặc tên gốc. Bạn cũng có thể duyệt theo phim lẻ, phim bộ, quốc gia và thể loại.',
  },
  {
    question: 'Làm sao biết phim đã có tập mới?',
    answer: 'Trang phim và thẻ phim hiển thị trạng thái tập theo dữ liệu hiện có. Mục Phim Mới Cập Nhật ưu tiên các phim vừa thay đổi tập hoặc nguồn.',
  },
  {
    question: 'KhoPhim có những loại nội dung nào?',
    answer: 'KhoPhim có các nhóm phim lẻ, phim bộ, phim chiếu rạp, hoạt hình, anime, TV shows và danh mục theo quốc gia, thể loại.',
  },
  {
    question: 'Có cần cài ứng dụng để mở KhoPhim không?',
    answer: 'Không. Website hoạt động trực tiếp trên trình duyệt máy tính, điện thoại và máy tính bảng.',
  },
  {
    question: 'Vietsub, thuyết minh và lồng tiếng được nhận biết thế nào?',
    answer: 'Nhãn ngôn ngữ được hiển thị theo dữ liệu của từng phim hoặc từng nguồn. Một phim có thể có nhiều phiên bản âm thanh khác nhau.',
  },
  {
    question: 'KhoPhim có lưu vị trí đang xem không?',
    answer: 'Trình phát có thể lưu tiến độ trên trình duyệt để tiếp tục từ vị trí gần nhất. Dữ liệu này phụ thuộc vào cài đặt lưu trữ của thiết bị.',
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-10 mt-4" aria-labelledby="home-faq-heading">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-5 bg-red-500 rounded-full" />
        <h2 id="home-faq-heading" className="text-white font-bold text-base">Câu hỏi thường gặp</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {faqs.map((faq, index) => (
          <div key={faq.question} className="bg-[#141720] border border-white/5 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left cursor-pointer"
              aria-expanded={openIndex === index}
            >
              <span className="text-sm font-medium text-white/80">{faq.question}</span>
              <i className={`ri-arrow-down-s-line text-white/40 text-lg transition-transform ${openIndex === index ? 'rotate-180' : ''}`} />
            </button>
            <div className={`overflow-hidden transition-all duration-200 ${openIndex === index ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
              <p className="px-4 pb-4 text-sm text-white/45 leading-relaxed">{faq.answer}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
