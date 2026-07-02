export const MHOPHIM_URL = 'https://mhophim.com';
export const KHOPHIM_URL = 'https://khophim.org';

export const satellitePages = [
  {
    path: '/',
    title: 'MHoPhim - Tin phim, lịch chiếu và gợi ý phim hay',
    description:
      'MHoPhim là trang vệ tinh của KhoPhim, tổng hợp tin phim, lịch chiếu, review và gợi ý phim hay để người xem tìm phim nhanh hơn.',
    heading: 'MHoPhim',
    eyebrow: 'Tin phim và gợi ý xem phim',
    intro:
      'Nơi này không copy kho phim của khophim.org. MHoPhim được dùng để viết nội dung riêng: top phim, review, lịch chiếu và hướng dẫn tìm phim.',
    sections: [
      {
        heading: 'Vai trò của MHoPhim',
        body:
          'MHoPhim giúp người xem khám phá phim theo chủ đề, năm phát hành, quốc gia và nhu cầu tìm kiếm. Khi cần xem phim, người dùng được dẫn về domain chính khophim.org.',
      },
      {
        heading: 'Domain chính để xem phim',
        body:
          'KhoPhim.org vẫn là nơi chứa trang phim, tìm kiếm phim, danh sách tập và player. Cách tách vai trò này giúp SEO sạch hơn và tránh trùng lặp nội dung.',
      },
    ],
    cta: { label: 'Vào KhoPhim để xem phim', href: KHOPHIM_URL },
    changefreq: 'weekly',
    priority: '1.00',
  },
  {
    path: '/top/phim-thai-hay',
    title: 'Top phim Thái hay đang được tìm nhiều',
    description:
      'Tổng hợp các chủ đề phim Thái được quan tâm: học đường, tình cảm, bí ẩn, BL và series GMMTV để người xem dễ tìm trên KhoPhim.',
    heading: 'Top phim Thái hay đang được tìm nhiều',
    eyebrow: 'Phim Thái Lan',
    intro:
      'Người xem phim Thái thường tìm theo tên Việt, tên Anh, tên Thái hoặc tên diễn viên. Trang này gom các nhóm từ khóa để điều hướng sang KhoPhim.',
    sections: [
      {
        heading: 'Nhóm phim học đường và siêu nhiên',
        body:
          'Những từ khóa như The Gifted, blacklist học đường, phim Thái siêu nhiên, phim GMMTV và phim thanh xuân Thái Lan nên được gom thành cụm nội dung riêng.',
      },
      {
        heading: 'Cách tìm phim nhanh',
        body:
          'Nếu không nhớ đúng tên phim, hãy thử tìm bằng tên gốc, tên diễn viên, năm phát hành hoặc một vài từ khóa nổi bật trong nội dung phim.',
      },
    ],
    cta: { label: 'Tìm phim Thái trên KhoPhim', href: `${KHOPHIM_URL}/phim-thai-lan` },
    changefreq: 'weekly',
    priority: '0.90',
  },
  {
    path: '/top/phim-dam-my-moi',
    title: 'Phim đam mỹ mới và BL đang được quan tâm',
    description:
      'Gợi ý phim đam mỹ, BL, GL và bách hợp mới cập nhật; dẫn người xem về Vũ Trụ Đam Mỹ trên KhoPhim.',
    heading: 'Phim đam mỹ mới và BL đang được quan tâm',
    eyebrow: 'Vũ trụ đam mỹ',
    intro:
      'MHoPhim dùng để gom nội dung gợi ý, review và xu hướng BL. Trang xem và tìm tập phim vẫn tập trung tại KhoPhim.',
    sections: [
      {
        heading: 'Nên gom theo chủ đề',
        body:
          'Phim BL Thái, BL Hàn, BL Nhật, phim học đường, phim văn phòng và phim cổ trang nên có các cụm nội dung riêng để Google hiểu rõ chủ đề.',
      },
      {
        heading: 'Điều hướng về trang xem',
        body:
          'Mỗi bài viết nên có liên kết rõ ràng đến Vũ Trụ Đam Mỹ trên KhoPhim để người dùng tìm tập mới nhanh và không bị lẫn domain.',
      },
    ],
    cta: { label: 'Mở Vũ Trụ Đam Mỹ', href: `${KHOPHIM_URL}/vu-tru-dam-my` },
    changefreq: 'weekly',
    priority: '0.88',
  },
  {
    path: '/lich-chieu/phim-moi',
    title: 'Lịch chiếu phim mới và tập mới',
    description:
      'Theo dõi phim đang cập nhật, tập mới và các bộ phim sắp có trên KhoPhim theo từng nhóm nội dung.',
    heading: 'Lịch chiếu phim mới và tập mới',
    eyebrow: 'Lịch cập nhật',
    intro:
      'Trang lịch chiếu giúp người dùng biết nên tìm gì và vào đâu khi có tập mới. Đây là nội dung thông tin, không trùng với trang xem phim.',
    sections: [
      {
        heading: 'Phim đang cập nhật',
        body:
          'Những phim đang ra tập nên được ưu tiên trong sitemap recent của KhoPhim, còn MHoPhim viết bài giải thích lịch cập nhật và cách theo dõi.',
      },
      {
        heading: 'Phim sắp chiếu',
        body:
          'Phim chưa có tập có thể có trang thông tin riêng, nhưng khi có nguồn xem hợp lệ thì mới điều hướng về trang phim trên KhoPhim.',
      },
    ],
    cta: { label: 'Xem phim mới nhất', href: `${KHOPHIM_URL}/phim-moi-nhat` },
    changefreq: 'daily',
    priority: '0.86',
  },
  {
    path: '/huong-dan/tim-phim',
    title: 'Hướng dẫn tìm phim khi không nhớ tên chính xác',
    description:
      'Cách tìm phim bằng tên không dấu, tên gốc, tên diễn viên, năm phát hành và từ khóa nội dung trên KhoPhim.',
    heading: 'Hướng dẫn tìm phim khi không nhớ tên chính xác',
    eyebrow: 'Hướng dẫn tìm phim',
    intro:
      'Nhiều người dùng chỉ nhớ một phần tên phim. Bài viết này giúp họ tìm đúng phim nhanh hơn mà không cần thử quá nhiều lần.',
    sections: [
      {
        heading: 'Tìm bằng nhiều dạng tên',
        body:
          'Hãy thử tên Việt có dấu, không dấu, tên Anh, tên Thái, năm phát hành hoặc tên diễn viên. Search của KhoPhim ưu tiên kết quả gần đúng và phim có tập mới.',
      },
      {
        heading: 'Khi phim chưa có trên web',
        body:
          'Nếu không thấy phim, có thể phim chưa có trong các nguồn API hiện tại. Hệ thống cần ghi nhận từ khóa bị thiếu để bổ sung nguồn hợp lệ sau.',
      },
    ],
    cta: { label: 'Tìm phim trên KhoPhim', href: `${KHOPHIM_URL}/search` },
    changefreq: 'monthly',
    priority: '0.80',
  },
  {
    path: '/review/phim-hay-nen-xem',
    title: 'Review phim hay nên xem trên KhoPhim',
    description:
      'Tổng hợp các nhóm phim hay theo cảm xúc, thể loại và quốc gia để người xem chọn phim nhanh hơn.',
    heading: 'Review phim hay nên xem trên KhoPhim',
    eyebrow: 'Review và gợi ý',
    intro:
      'Trang review trên MHoPhim tập trung vào nhận xét và gợi ý. Trang xem phim chỉ nằm trên KhoPhim để giữ SEO domain chính gọn và mạnh.',
    sections: [
      {
        heading: 'Gợi ý theo tâm trạng',
        body:
          'Người xem thường tìm phim buồn, phim vui, phim tình cảm, phim căng thẳng hoặc phim để xem cuối tuần. Đây là các cụm từ khóa có giá trị.',
      },
      {
        heading: 'Liên kết nội bộ đúng hướng',
        body:
          'Mỗi bài review nên dẫn về một trang danh mục hoặc trang tìm kiếm trên KhoPhim thay vì tạo bản sao trang phim trên domain phụ.',
      },
    ],
    cta: { label: 'Khám phá phim hay', href: `${KHOPHIM_URL}/phim-hay` },
    changefreq: 'weekly',
    priority: '0.84',
  },
];
