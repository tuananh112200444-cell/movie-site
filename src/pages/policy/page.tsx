import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import SEO, { SITE_URL } from '@/components/base/SEO';

const policySchema = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Chính Sách & Điều Khoản Sử Dụng – KhoPhim',
    url: `${SITE_URL}/policy`,
    description: 'Chính sách bảo mật, điều khoản sử dụng và chính sách DMCA của KhoPhim (khophim.org). Cam kết bảo vệ quyền riêng tư người dùng.',
    inLanguage: 'vi',
    isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
    dateModified: '2026-04-09',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Chính Sách & Điều Khoản', item: `${SITE_URL}/policy` },
    ],
  },
];

type TabKey = 'privacy' | 'terms' | 'dmca';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'privacy', label: 'Chính Sách Bảo Mật', icon: 'ri-shield-user-line' },
  { key: 'terms',   label: 'Điều Khoản Sử Dụng', icon: 'ri-file-text-line' },
  { key: 'dmca',    label: 'Chính Sách DMCA',     icon: 'ri-copyright-line' },
];

const CONTENT: Record<TabKey, { sections: { title: string; body: string }[] }> = {
  privacy: {
    sections: [
      {
        title: '1. Thông Tin Chúng Tôi Thu Thập',
        body: 'KhoPhim (khophim.org) không yêu cầu người dùng đăng ký tài khoản và không thu thập thông tin cá nhân như tên, email hay số điện thoại. Chúng tôi chỉ thu thập dữ liệu kỹ thuật ẩn danh như địa chỉ IP, loại trình duyệt, thiết bị và trang bạn truy cập — nhằm mục đích cải thiện trải nghiệm người dùng và phân tích lưu lượng truy cập.',
      },
      {
        title: '2. Cookie & Lưu Trữ Cục Bộ',
        body: 'KhoPhim sử dụng localStorage và sessionStorage của trình duyệt để lưu trữ lịch sử xem phim, danh sách yêu thích và tiến độ xem dở — tất cả đều được lưu trên thiết bị của bạn, không gửi lên máy chủ. Bạn có thể xóa dữ liệu này bất kỳ lúc nào bằng cách xóa cache trình duyệt.',
      },
      {
        title: '3. Dữ Liệu Bên Thứ Ba',
        body: 'Nội dung phim trên KhoPhim được tổng hợp từ các nguồn công khai thông qua API. Chúng tôi không kiểm soát chính sách bảo mật của các nguồn bên thứ ba này. Khi bạn phát video, trình duyệt của bạn có thể kết nối trực tiếp đến máy chủ của bên thứ ba.',
      },
      {
        title: '4. Bảo Mật Dữ Liệu',
        body: 'Chúng tôi áp dụng các biện pháp kỹ thuật hợp lý để bảo vệ dữ liệu người dùng. Tuy nhiên, không có phương thức truyền tải qua Internet nào là an toàn tuyệt đối. Chúng tôi không chịu trách nhiệm về các vi phạm bảo mật nằm ngoài tầm kiểm soát của mình.',
      },
      {
        title: '5. Thay Đổi Chính Sách',
        body: 'KhoPhim có quyền cập nhật chính sách bảo mật này bất kỳ lúc nào. Các thay đổi sẽ có hiệu lực ngay khi được đăng tải trên trang web. Việc tiếp tục sử dụng dịch vụ sau khi thay đổi đồng nghĩa với việc bạn chấp nhận chính sách mới.',
      },
      {
        title: '6. Liên Hệ',
        body: 'Nếu bạn có câu hỏi về chính sách bảo mật, vui lòng liên hệ chúng tôi qua Telegram hoặc Facebook được liệt kê trong trang Giới Thiệu.',
      },
    ],
  },
  terms: {
    sections: [
      {
        title: '1. Chấp Nhận Điều Khoản',
        body: 'Bằng cách truy cập và sử dụng KhoPhim (khophim.org), bạn đồng ý tuân thủ và bị ràng buộc bởi các điều khoản và điều kiện sử dụng này. Nếu bạn không đồng ý với bất kỳ phần nào, vui lòng không sử dụng dịch vụ của chúng tôi.',
      },
      {
        title: '2. Mục Đích Sử Dụng',
        body: 'KhoPhim được cung cấp chỉ cho mục đích xem phim giải trí cá nhân, phi thương mại. Bạn không được phép sử dụng dịch vụ để tải xuống, sao chép, phân phối lại hoặc khai thác thương mại bất kỳ nội dung nào trên trang web.',
      },
      {
        title: '3. Nội Dung Tổng Hợp',
        body: 'KhoPhim là nền tảng tổng hợp nội dung từ các nguồn công khai trên Internet. Chúng tôi không lưu trữ bất kỳ tệp video nào trên máy chủ của mình. Tất cả nội dung được nhúng từ các nguồn bên thứ ba và chúng tôi không chịu trách nhiệm về tính chính xác, hợp pháp hay chất lượng của nội dung đó.',
      },
      {
        title: '4. Hành Vi Bị Cấm',
        body: 'Người dùng không được phép: (a) sử dụng bot, crawler hoặc công cụ tự động để truy cập dịch vụ; (b) cố gắng xâm nhập, phá hoại hoặc làm gián đoạn hệ thống; (c) đăng tải hoặc chia sẻ nội dung vi phạm pháp luật; (d) mạo danh KhoPhim hoặc nhân viên của chúng tôi.',
      },
      {
        title: '5. Giới Hạn Trách Nhiệm',
        body: 'KhoPhim được cung cấp "nguyên trạng" mà không có bất kỳ bảo đảm nào. Chúng tôi không chịu trách nhiệm về bất kỳ thiệt hại trực tiếp, gián tiếp, ngẫu nhiên hay hậu quả nào phát sinh từ việc sử dụng hoặc không thể sử dụng dịch vụ.',
      },
      {
        title: '6. Thay Đổi Dịch Vụ',
        body: 'KhoPhim có quyền thay đổi, tạm ngừng hoặc chấm dứt bất kỳ phần nào của dịch vụ bất kỳ lúc nào mà không cần thông báo trước. Chúng tôi không chịu trách nhiệm với bạn hoặc bên thứ ba về bất kỳ sự thay đổi, tạm ngừng hay chấm dứt nào.',
      },
      {
        title: '7. Luật Áp Dụng',
        body: 'Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Mọi tranh chấp phát sinh sẽ được giải quyết tại tòa án có thẩm quyền tại Việt Nam.',
      },
    ],
  },
  dmca: {
    sections: [
      {
        title: '1. Cam Kết Tôn Trọng Bản Quyền',
        body: 'KhoPhim (khophim.org) tôn trọng quyền sở hữu trí tuệ của các cá nhân và tổ chức. Chúng tôi tuân thủ Đạo luật Bản quyền Thiên niên kỷ Kỹ thuật số (DMCA) và các quy định bản quyền quốc tế tương đương.',
      },
      {
        title: '2. Chúng Tôi Không Lưu Trữ Nội Dung',
        body: 'KhoPhim không lưu trữ bất kỳ tệp video, hình ảnh hay nội dung có bản quyền nào trên máy chủ của mình. Tất cả nội dung được nhúng từ các nguồn bên thứ ba thông qua API công khai. Chúng tôi chỉ đóng vai trò là công cụ tìm kiếm và tổng hợp liên kết.',
      },
      {
        title: '3. Quy Trình Gỡ Bỏ Nội Dung',
        body: 'Nếu bạn là chủ sở hữu bản quyền và tin rằng nội dung trên KhoPhim vi phạm quyền của bạn, vui lòng gửi thông báo DMCA đến chúng tôi qua Telegram hoặc Facebook. Thông báo cần bao gồm: (a) mô tả tác phẩm bị vi phạm; (b) URL cụ thể của nội dung vi phạm; (c) thông tin liên hệ của bạn; (d) tuyên bố rằng bạn là chủ sở hữu hợp pháp.',
      },
      {
        title: '4. Thời Gian Xử Lý',
        body: 'Chúng tôi cam kết xem xét và phản hồi các yêu cầu DMCA hợp lệ trong vòng 48-72 giờ làm việc. Nếu yêu cầu được xác nhận hợp lệ, chúng tôi sẽ gỡ bỏ hoặc vô hiệu hóa quyền truy cập vào nội dung liên quan ngay lập tức.',
      },
      {
        title: '5. Khiếu Nại Ngược',
        body: 'Nếu bạn tin rằng nội dung của mình bị gỡ bỏ do nhầm lẫn, bạn có thể gửi khiếu nại ngược với đầy đủ thông tin chứng minh quyền sở hữu hợp pháp. Chúng tôi sẽ xem xét và phục hồi nội dung nếu khiếu nại được xác nhận hợp lệ.',
      },
      {
        title: '6. Liên Hệ DMCA',
        body: 'Để gửi yêu cầu DMCA hoặc liên hệ về vấn đề bản quyền, vui lòng liên hệ qua Telegram: @davisjohn_1 hoặc qua trang Facebook chính thức của KhoPhim. Chúng tôi cam kết xử lý mọi yêu cầu một cách nghiêm túc và kịp thời.',
      },
    ],
  },
};

export default function PolicyPage() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabParam && TABS.some(t => t.key === tabParam) ? tabParam : 'privacy'
  );

  // Sync tab when URL param changes
  useEffect(() => {
    if (tabParam && TABS.some(t => t.key === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const content = CONTENT[activeTab];

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title="Chính Sách Bảo Mật & Điều Khoản Sử Dụng – KhoPhim"
        description="Chính sách bảo mật, điều khoản sử dụng và chính sách DMCA của KhoPhim (khophim.org). Cam kết bảo vệ quyền riêng tư và tôn trọng bản quyền."
        keywords="chính sách bảo mật KhoPhim, điều khoản sử dụng khophim, DMCA KhoPhim, quyền riêng tư"
        canonical="/policy"
        schema={policySchema}
        updatedAt="2026-04-08"
      />
      <Navbar />

      <main className="max-w-[900px] mx-auto px-4 md:px-6 pt-24 pb-20">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 mb-8 text-xs text-white/30">
          <Link to="/" className="hover:text-white/60 transition-colors">Trang Chủ</Link>
          <i className="ri-arrow-right-s-line" />
          <span className="text-white/50">Chính Sách & Điều Khoản</span>
        </nav>

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-4">
            <i className="ri-shield-check-line text-red-400 text-xs" />
            <span className="text-white/50 text-xs font-medium">Cập nhật: 08/04/2026</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Chính Sách & Điều Khoản
          </h1>
          <p className="text-white/45 text-sm leading-relaxed max-w-xl">
            KhoPhim cam kết minh bạch về cách chúng tôi vận hành dịch vụ, bảo vệ quyền riêng tư người dùng và tôn trọng quyền sở hữu trí tuệ.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[#0d0f18] border border-white/[0.06] rounded-xl p-1 mb-8 flex-wrap">
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap flex-1 justify-center ${
                activeTab === key
                  ? 'bg-red-500 text-white'
                  : 'text-white/45 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <i className={`${icon} text-sm`} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.split(' ').slice(-1)[0]}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-5">
          {content.sections.map(({ title, body }) => (
            <article
              key={title}
              className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.10] transition-colors"
            >
              <h2 className="text-white font-semibold text-sm mb-3 flex items-start gap-2.5">
                <span className="w-5 h-5 flex items-center justify-center bg-red-500/15 rounded-lg flex-shrink-0 mt-0.5">
                  <i className="ri-checkbox-circle-line text-red-400 text-xs" />
                </span>
                {title}
              </h2>
              <p className="text-white/50 text-sm leading-relaxed pl-7">{body}</p>
            </article>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-10 bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-11 h-11 flex items-center justify-center bg-red-500/10 rounded-xl flex-shrink-0">
            <i className="ri-mail-send-line text-red-400 text-xl" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm mb-1">Có câu hỏi về chính sách?</p>
            <p className="text-white/40 text-xs leading-relaxed">
              Liên hệ chúng tôi qua Telegram hoặc Facebook. Đội ngũ KhoPhim sẽ phản hồi trong vòng 24-48 giờ.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <a
              href="https://t.me/davisjohn_1"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-1.5 bg-[#29A8E8]/15 hover:bg-[#29A8E8]/25 border border-[#29A8E8]/25 text-[#29A8E8] text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-telegram-fill" />
              Telegram
            </a>
            <Link
              to="/about"
              className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-white/60 hover:text-white text-xs font-medium px-4 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-information-line" />
              Giới Thiệu
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
