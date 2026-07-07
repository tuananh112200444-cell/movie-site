export const MHOPHIM_URL = 'https://mhophim.com';
export const KHOPHIM_URL = 'https://khophim.org';

function makePage({
  path,
  title,
  description,
  heading = title,
  eyebrow,
  intro,
  ctaLabel,
  ctaHref,
  changefreq = 'weekly',
  priority = '0.82',
  focus = 'gợi ý phim',
}) {
  return {
    path,
    title,
    description,
    heading,
    eyebrow,
    intro,
    sections: [
      {
        heading: `Vì sao chủ đề ${focus} đáng theo dõi`,
        body:
          `Người xem thường tìm ${focus} theo cảm xúc, quốc gia, diễn viên, lịch ra tập hoặc tên phim không đầy đủ. ` +
          'MHoPhim gom các ý định tìm kiếm này thành bài gợi ý riêng để Google hiểu đây là nội dung editorial, không phải bản sao trang xem phim.',
      },
      {
        heading: 'Chuyển sang KhoPhim đúng thời điểm',
        body:
          'MHoPhim chỉ làm nhiệm vụ giới thiệu, review, xếp hạng và hướng dẫn tìm phim. Khi người đọc muốn xem tập phim, nút hành động sẽ đưa sang đúng danh mục trên khophim.org.',
      },
    ],
    cta: { label: ctaLabel, href: ctaHref },
    changefreq,
    priority,
  };
}

const corePages = [
  makePage({
    path: '/',
    title: 'MHoPhim - Tin phim, lịch chiếu và gợi ý phim hay',
    description:
      'MHoPhim là trang tin phim, review, lịch chiếu và gợi ý xem phim. Trang xem phim chính thức được điều hướng về KhoPhim tại khophim.org.',
    heading: 'MHoPhim',
    eyebrow: 'Tin phim và gợi ý xem phim',
    intro:
      'MHoPhim là lớp nội dung editorial riêng: top phim, review, lịch chiếu, hướng dẫn tìm phim và xu hướng phim đang được quan tâm. Trang xem phim và player tập trung trên KhoPhim.',
    ctaLabel: 'Sang KhoPhim để xem phim ngay',
    ctaHref: KHOPHIM_URL,
    priority: '1.00',
    focus: 'tin phim và gợi ý xem phim',
  }),
  makePage({
    path: '/top/phim-thai-hay',
    title: 'Top phim Thái hay đang được tìm nhiều',
    description: 'Gợi ý phim Thái Lan hay: học đường, tình cảm, bí ẩn, BL và series GMMTV đang được người xem Việt Nam quan tâm.',
    eyebrow: 'Phim Thái Lan',
    intro: 'Người xem phim Thái thường tìm theo tên Việt, tên Anh, tên Thái hoặc tên diễn viên. Trang này gom các nhóm từ khóa để điều hướng sang đúng danh mục.',
    ctaLabel: 'Xem phim Thái trên KhoPhim',
    ctaHref: `${KHOPHIM_URL}/phim-thai-lan`,
    priority: '0.92',
    focus: 'phim Thái Lan',
  }),
  makePage({
    path: '/top/phim-dam-my-moi',
    title: 'Phim đam mỹ mới và BL đang được quan tâm',
    description: 'Gợi ý phim đam mỹ, BL, GL và bách hợp mới cập nhật; phân nhóm theo quốc gia, thể loại và nhu cầu tìm kiếm.',
    eyebrow: 'Vũ trụ đam mỹ',
    intro: 'MHoPhim dùng để gom nội dung gợi ý, review và xu hướng BL. Trang xem và tìm tập phim vẫn tập trung tại KhoPhim để tránh trùng lặp.',
    ctaLabel: 'Mở Vũ Trụ Đam Mỹ trên KhoPhim',
    ctaHref: `${KHOPHIM_URL}/vu-tru-dam-my`,
    priority: '0.90',
    focus: 'phim đam mỹ và BL',
  }),
  makePage({
    path: '/lich-chieu/phim-moi',
    title: 'Lịch chiếu phim mới và tập mới',
    description: 'Theo dõi phim đang cập nhật, tập mới và các bộ phim sắp có trên KhoPhim theo từng nhóm nội dung.',
    eyebrow: 'Lịch cập nhật',
    intro: 'Trang lịch chiếu giúp người dùng biết nên tìm gì và vào đâu khi có tập mới. Đây là nội dung thông tin, không trùng với trang xem phim.',
    ctaLabel: 'Xem phim mới nhất trên KhoPhim',
    ctaHref: `${KHOPHIM_URL}/phim-moi-nhat`,
    changefreq: 'daily',
    priority: '0.88',
    focus: 'lịch chiếu phim mới',
  }),
  makePage({
    path: '/huong-dan/tim-phim',
    title: 'Hướng dẫn tìm phim khi không nhớ tên chính xác',
    description: 'Cách tìm phim bằng tên không dấu, tên gốc, tên diễn viên, năm phát hành và từ khóa nội dung trên KhoPhim.',
    eyebrow: 'Hướng dẫn tìm phim',
    intro: 'Nhiều người dùng chỉ nhớ một phần tên phim. Bài viết này giúp họ tìm đúng phim nhanh hơn mà không cần thử quá nhiều lần.',
    ctaLabel: 'Tìm phim trên KhoPhim',
    ctaHref: `${KHOPHIM_URL}/search`,
    changefreq: 'monthly',
    priority: '0.84',
    focus: 'cách tìm phim',
  }),
  makePage({
    path: '/review/phim-hay-nen-xem',
    title: 'Review phim hay nên xem trên KhoPhim',
    description: 'Tổng hợp các nhóm phim hay theo cảm xúc, thể loại và quốc gia để người xem chọn phim nhanh hơn.',
    eyebrow: 'Review và gợi ý',
    intro: 'Trang review trên MHoPhim tập trung vào nhận xét và gợi ý. Trang xem phim chỉ nằm trên KhoPhim để giữ SEO domain chính gọn và mạnh.',
    ctaLabel: 'Khám phá phim hay trên KhoPhim',
    ctaHref: `${KHOPHIM_URL}/phim-hay`,
    priority: '0.86',
    focus: 'review phim hay',
  }),
];

const topicPages = [
  ['top/phim-han-quoc-moi', 'Phim Hàn Quốc mới đang được tìm nhiều', 'Phim Hàn Quốc', 'phim Hàn Quốc mới', `${KHOPHIM_URL}/phim-han-quoc`],
  ['top/phim-trung-quoc-co-trang', 'Phim Trung Quốc cổ trang và tiên hiệp đang hot', 'Phim Trung Quốc', 'phim Trung Quốc cổ trang', `${KHOPHIM_URL}/phim-trung-quoc`],
  ['top/anime-vietsub-hay', 'Anime Vietsub hay và hoạt hình mới nên xem', 'Anime và hoạt hình', 'anime Vietsub', `${KHOPHIM_URL}/anime`],
  ['top/phim-au-my-hanh-dong', 'Phim Âu Mỹ hành động và viễn tưởng đáng xem', 'Phim Âu Mỹ', 'phim Âu Mỹ hành động', `${KHOPHIM_URL}/phim-au-my`],
  ['top/phim-viet-nam-moi', 'Phim Việt Nam mới và phim chiếu rạp Việt đáng chú ý', 'Phim Việt Nam', 'phim Việt Nam mới', `${KHOPHIM_URL}/phim-viet-nam`],
  ['review/phim-chieu-rap-dang-xem', 'Review phim chiếu rạp đang xem và bom tấn mới', 'Phim chiếu rạp', 'phim chiếu rạp', `${KHOPHIM_URL}/phim-chieu-rap`],
  ['huong-dan/xem-phim-vietsub', 'Hướng dẫn tìm phim Vietsub đúng tên và đúng tập', 'Hướng dẫn Vietsub', 'phim Vietsub', `${KHOPHIM_URL}/search`],
  ['lich-chieu/phim-bo-dang-chieu', 'Lịch phim bộ đang chiếu và tập mới cần theo dõi', 'Phim bộ đang chiếu', 'lịch phim bộ', `${KHOPHIM_URL}/phim-moi-cap-nhat`],
  ['top/phim-hoc-duong-hay', 'Top phim học đường hay, dễ xem và nhiều cảm xúc', 'Phim học đường', 'phim học đường', `${KHOPHIM_URL}/the-loai/hoc-duong`],
  ['top/phim-tinh-cam-lang-man', 'Top phim tình cảm lãng mạn nên xem cuối tuần', 'Phim tình cảm', 'phim tình cảm lãng mạn', `${KHOPHIM_URL}/the-loai/tinh-cam`],
  ['top/phim-hanh-dong-moi', 'Top phim hành động mới, gay cấn và dễ cuốn', 'Phim hành động', 'phim hành động mới', `${KHOPHIM_URL}/the-loai/hanh-dong`],
  ['top/phim-kinh-di-gay-can', 'Top phim kinh dị gay cấn cho người thích cảm giác mạnh', 'Phim kinh dị', 'phim kinh dị', `${KHOPHIM_URL}/phim-ma`],
  ['top/phim-hai-huoc-giai-tri', 'Top phim hài hước giải trí nhẹ nhàng dễ xem', 'Phim hài hước', 'phim hài hước', `${KHOPHIM_URL}/the-loai/hai-huoc`],
  ['top/phim-gia-dinh-am-ap', 'Top phim gia đình ấm áp, phù hợp xem cùng nhau', 'Phim gia đình', 'phim gia đình', `${KHOPHIM_URL}/the-loai/gia-dinh`],
  ['top/phim-co-trang-ngon-tinh', 'Phim cổ trang ngôn tình được tìm nhiều', 'Cổ trang ngôn tình', 'phim cổ trang ngôn tình', `${KHOPHIM_URL}/the-loai/co-trang`],
  ['top/phim-tam-ly-drama', 'Phim tâm lý drama sâu sắc và đáng suy ngẫm', 'Phim tâm lý', 'phim tâm lý drama', `${KHOPHIM_URL}/the-loai/tam-ly`],
  ['top/phim-bi-an-trinh-tham', 'Phim bí ẩn trinh thám cho người thích phá án', 'Bí ẩn trinh thám', 'phim bí ẩn trinh thám', `${KHOPHIM_URL}/the-loai/hinh-su`],
  ['top/phim-thanh-xuan-vuon-truong', 'Phim thanh xuân vườn trường nhiều cảm xúc', 'Thanh xuân', 'phim thanh xuân', `${KHOPHIM_URL}/search?q=thanh%20xuan`],
  ['review/phim-han-quoc-dang-hot', 'Review phim Hàn Quốc đang hot và đáng theo dõi', 'Review phim Hàn', 'review phim Hàn Quốc', `${KHOPHIM_URL}/phim-han-quoc`],
  ['review/phim-thai-lan-dang-hot', 'Review phim Thái Lan đang hot trên mạng xã hội', 'Review phim Thái', 'review phim Thái Lan', `${KHOPHIM_URL}/phim-thai-lan`],
  ['review/phim-trung-quoc-dang-hot', 'Review phim Trung Quốc đang hot và dễ xem', 'Review phim Trung', 'review phim Trung Quốc', `${KHOPHIM_URL}/phim-trung-quoc`],
  ['review/anime-dang-hot', 'Review anime đang hot, dễ bắt đầu và đáng theo dõi', 'Review anime', 'review anime', `${KHOPHIM_URL}/anime`],
  ['review/phim-bl-dang-hot', 'Review phim BL đang hot và các cặp đôi được chú ý', 'Review BL', 'review phim BL', `${KHOPHIM_URL}/vu-tru-dam-my`],
  ['lich-chieu/phim-han-ra-tap-moi', 'Lịch phim Hàn ra tập mới và cách theo dõi', 'Lịch phim Hàn', 'lịch phim Hàn', `${KHOPHIM_URL}/phim-han-quoc`],
  ['lich-chieu/phim-trung-ra-tap-moi', 'Lịch phim Trung ra tập mới và phim đang chiếu', 'Lịch phim Trung', 'lịch phim Trung', `${KHOPHIM_URL}/phim-trung-quoc`],
  ['lich-chieu/anime-ra-tap-moi', 'Lịch anime ra tập mới và mùa phim đáng chú ý', 'Lịch anime', 'lịch anime', `${KHOPHIM_URL}/anime`],
  ['lich-chieu/phim-thai-ra-tap-moi', 'Lịch phim Thái ra tập mới và series đáng chờ', 'Lịch phim Thái', 'lịch phim Thái', `${KHOPHIM_URL}/phim-thai-lan`],
  ['huong-dan/tim-phim-theo-dien-vien', 'Cách tìm phim theo diễn viên khi không nhớ tên phim', 'Tìm theo diễn viên', 'tìm phim theo diễn viên', `${KHOPHIM_URL}/search`],
  ['huong-dan/tim-phim-theo-the-loai', 'Cách tìm phim theo thể loại, quốc gia và cảm xúc', 'Tìm theo thể loại', 'tìm phim theo thể loại', `${KHOPHIM_URL}/the-loai/hanh-dong`],
  ['huong-dan/theo-doi-tap-moi', 'Cách theo dõi tập mới của phim bộ đang chiếu', 'Theo dõi tập mới', 'theo dõi tập mới', `${KHOPHIM_URL}/phim-moi-cap-nhat`],
  ['huong-dan/chon-phim-cuoi-tuan', 'Cách chọn phim cuối tuần theo tâm trạng', 'Chọn phim cuối tuần', 'chọn phim cuối tuần', `${KHOPHIM_URL}/phim-hay`],
  ['huong-dan/tim-phim-khong-dau', 'Cách tìm phim bằng tên không dấu và tên gốc', 'Tìm phim không dấu', 'tìm phim không dấu', `${KHOPHIM_URL}/search`],
  ['top/phim-moi-2026', 'Phim mới 2026 đáng chú ý theo từng thể loại', 'Phim mới 2026', 'phim mới 2026', `${KHOPHIM_URL}/phim-moi-nhat`],
  ['top/phim-le-hay', 'Top phim lẻ hay, dễ xem và phù hợp nhiều tâm trạng', 'Phim lẻ hay', 'phim lẻ hay', `${KHOPHIM_URL}/phim-le`],
  ['top/phim-bo-hay', 'Top phim bộ hay để cày nhiều tập', 'Phim bộ hay', 'phim bộ hay', `${KHOPHIM_URL}/phim-bo`],
  ['review/phim-dang-xem-tren-khophim', 'Những nhóm phim đáng xem trên KhoPhim tuần này', 'Đáng xem tuần này', 'phim đáng xem trên KhoPhim', `${KHOPHIM_URL}/phim-hay`],
];

const generatedPages = topicPages.map(([slug, title, eyebrow, focus, href], index) => makePage({
  path: `/${slug}`,
  title,
  description: `${title}. MHoPhim tổng hợp xu hướng, review và cách chọn ${focus} trước khi chuyển người xem sang KhoPhim.`,
  eyebrow,
  intro: `${title} là cụm nội dung riêng của MHoPhim, tập trung vào gợi ý, review, lịch cập nhật và cách tìm phim. Trang xem phim, tập phim và player vẫn nằm trên KhoPhim.`,
  ctaLabel: 'Sang KhoPhim để xem phim ngay',
  ctaHref: href,
  changefreq: slug.startsWith('lich-chieu/') ? 'daily' : slug.startsWith('huong-dan/') ? 'monthly' : 'weekly',
  priority: (0.86 - Math.min(index, 30) * 0.005).toFixed(2),
  focus,
}));

export const satellitePages = [...corePages, ...generatedPages];
