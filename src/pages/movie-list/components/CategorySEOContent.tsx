import { useState } from 'react';
import { Link } from 'react-router-dom';

interface FAQItem { q: string; a: string; }
interface ReviewItem { title: string; year: number; rating: string; review: string; genre: string; }
interface SEOData {
  heading: string;
  intro: string;
  features: string[];
  faq: FAQItem[];
  related: { label: string; href: string }[];
  reviews?: ReviewItem[];
}

const SEO_CONTENT: Record<string, SEOData> = {
  'phim-le': {
    heading: 'Xem Phim Lẻ Vietsub Online Miễn Phí HD – Kho Phim Điện Ảnh Mới Nhất 2026',
    intro: 'KhoPhim cung cấp kho phim lẻ khổng lồ với hàng nghìn bộ phim điện ảnh từ khắp nơi trên thế giới. Xem phim lẻ vietsub miễn phí chất lượng HD và Full HD, không quảng cáo phiền phức. Từ bom tấn Hollywood đến phim điện ảnh Hàn Quốc, Trung Quốc, Nhật Bản – tất cả đều có tại khophim.org, cập nhật hàng ngày, không cần đăng ký tài khoản.',
    features: ['Phim lẻ vietsub HD & Full HD miễn phí, không quảng cáo', 'Cập nhật phim điện ảnh mới nhất 2026 hàng ngày', 'Phụ đề tiếng Việt & lồng tiếng đầy đủ', 'Xem ngay trên trình duyệt, không cần cài app', 'Tương thích điện thoại, máy tính bảng, PC'],
    reviews: [
      { title: 'Oppenheimer', year: 2023, rating: '9.2/10', review: 'Christopher Nolan đã tạo ra một kiệt tác điện ảnh khi tái hiện cuộc đời J. Robert Oppenheimer – cha đẻ của bom nguyên tử. Điều khiến bộ phim này khác biệt hoàn toàn so với các phim tiểu sử thông thường là cách Nolan đan xen ba dòng thời gian phi tuyến tính, buộc khán giả phải tự ghép lại bức tranh toàn cảnh. Cillian Murphy mang đến màn trình diễn xuất thần – đôi mắt xanh lạnh lẽo của ông chứa đựng cả sự thiên tài lẫn nỗi ám ảnh không thể thoát khỏi.', genre: 'Tiểu sử / Lịch sử' },
      { title: 'Past Lives', year: 2023, rating: '8.7/10', review: 'Hiếm có bộ phim nào nói về tình yêu mà không cần đến những cảnh hôn nhau hay kịch tính ồn ào như Past Lives. Celine Song kể câu chuyện về hai người bạn thời thơ ấu ở Seoul, bị chia cắt bởi di cư, rồi gặp lại nhau sau 24 năm tại New York. Sức mạnh của phim nằm ở những khoảng lặng – ánh mắt nhìn nhau qua cửa kính taxi, bàn tay chạm nhẹ rồi buông ra.', genre: 'Tình cảm / Drama' },
    ],
    faq: [
      { q: 'Xem phim lẻ vietsub online miễn phí không quảng cáo ở đâu?', a: 'KhoPhim (khophim.org) là trang xem phim lẻ vietsub online miễn phí tốt nhất 2026 với chất lượng HD và Full HD. Không quảng cáo, không cần đăng ký, cập nhật liên tục hàng ngày.' },
      { q: 'Phim lẻ hay nhất 2026 xem ở đâu?', a: 'KhoPhim có đầy đủ phim lẻ hay nhất 2026 từ Hollywood, Hàn Quốc, Trung Quốc và Việt Nam với vietsub chuẩn, chất lượng HD. Vào mục Phim Lẻ và dùng bộ lọc "Mới Nhất" để tìm phim mới nhất.' },
    ],
    related: [{ label: 'Phim Bộ Vietsub', href: '/phim-bo' }, { label: 'Phim Âu Mỹ HD', href: '/phim-au-my' }, { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }],
  },
  'phim-bo': {
    heading: 'Xem Phim Bộ Vietsub Online Miễn Phí HD – Series Hay Nhất Cập Nhật 2026',
    intro: 'Khám phá kho phim bộ đồ sộ tại KhoPhim với hàng nghìn bộ series vietsub từ Hàn Quốc, Trung Quốc, Âu Mỹ, Nhật Bản và nhiều quốc gia khác. Xem phim bộ online miễn phí vietsub HD Full HD, không quảng cáo, cập nhật tập mới nhanh nhất. Từ drama tình cảm lãng mạn đến phim hành động, kinh dị, cổ trang – KhoPhim có đủ tất cả thể loại phim bộ hay nhất 2026.',
    features: ['Hàng nghìn phim bộ vietsub từ nhiều quốc gia', 'Cập nhật tập mới nhanh nhất, không chờ đợi', 'Full HD vietsub & lồng tiếng', 'Không quảng cáo, xem liên tục không bị gián đoạn', 'Theo dõi lịch sử xem phim tự động'],
    reviews: [
      { title: 'Squid Game (Trò Chơi Con Mực)', year: 2021, rating: '9.0/10', review: 'Trước khi Squid Game ra mắt, ít ai nghĩ một bộ phim Hàn Quốc lại có thể trở thành hiện tượng toàn cầu đến vậy. Hwang Dong-hyuk đã xây dựng một ẩn dụ xã hội sắc bén: khi con người bị đẩy đến tận cùng của tuyệt vọng tài chính, họ sẵn sàng đặt cược mạng sống vào những trò chơi trẻ em. Điều đáng sợ không phải là bạo lực – mà là cách bộ phim phơi bày bản năng sinh tồn ích kỷ ẩn sâu trong mỗi người.', genre: 'Thriller / Sinh tồn' },
      { title: 'Crash Landing on You (Hạ Cánh Nơi Anh)', year: 2019, rating: '8.8/10', review: 'Hạ Cánh Nơi Anh là bằng chứng rằng một câu chuyện tình yêu không cần phải thực tế để chạm đến trái tim. Khi một nữ tỷ phú Hàn Quốc bị gió cuốn sang Triều Tiên và gặp một sĩ quan quân đội, bộ phim không chỉ khai thác sự lãng mạn mà còn khéo léo phác họa cuộc sống thường ngày ở một đất nước bí ẩn.', genre: 'Tình cảm / Lãng mạn' },
    ],
    faq: [
      { q: 'Xem phim bộ vietsub HD miễn phí không đăng ký ở đâu?', a: 'KhoPhim (khophim.org) cho phép xem phim bộ vietsub online hoàn toàn miễn phí, không yêu cầu đăng ký tài khoản, không giới hạn số tập. Chất lượng HD và Full HD, không quảng cáo.' },
      { q: 'Phim bộ Hàn Quốc hay nhất 2026 là gì?', a: 'KhoPhim cập nhật liên tục các phim bộ Hàn Quốc mới nhất và hot nhất 2026. Vào mục Phim Hàn Quốc để xem danh sách đầy đủ, hoặc dùng bộ lọc để tìm phim theo thể loại.' },
    ],
    related: [{ label: 'Phim Lẻ Vietsub', href: '/phim-le' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' }, { label: 'TV Shows HD', href: '/tv-shows' }],
  },
  'phim-chieu-rap': {
    heading: 'Xem Phim Chiếu Rạp Online Miễn Phí HD – Blockbuster Mới Nhất 2026',
    intro: 'KhoPhim tổng hợp toàn bộ phim chiếu rạp mới nhất 2026 từ Hollywood, Hàn Quốc, Trung Quốc và Việt Nam. Xem phim chiếu rạp online miễn phí vietsub HD Full HD, không quảng cáo, cập nhật liên tục. Từ siêu bom tấn Marvel, DC đến phim điện ảnh Hàn Quốc đình đám, phim rạp Việt Nam – tất cả đều có tại khophim.org.',
    features: ['Phim chiếu rạp vietsub HD Full HD mới nhất 2026', 'Blockbuster Hollywood, Marvel, DC đầy đủ', 'Phim rạp Hàn Quốc, Việt Nam, Trung Quốc', 'Cập nhật nhanh sau khi phim ra rạp', 'Không quảng cáo, xem ngay trên trình duyệt'],
    reviews: [
      { title: 'Avengers: Endgame', year: 2019, rating: '9.4/10', review: 'Endgame không chỉ là một bộ phim – đây là sự kiện văn hóa. Sau 11 năm và 21 bộ phim xây dựng nền tảng, Russo Brothers đã tạo ra một kết thúc xứng đáng cho hành trình dài nhất lịch sử điện ảnh. Ba giờ đồng hồ trôi qua không hề nhàm chán: từ nỗi tuyệt vọng của phần đầu, sự hài hước nhẹ nhàng ở giữa, đến trận chiến cuối cùng khiến cả rạp đứng dậy vỗ tay.', genre: 'Hành động / Siêu anh hùng' },
      { title: 'Parasite (Ký Sinh Trùng)', year: 2019, rating: '9.5/10', review: 'Bong Joon-ho đã làm điều không tưởng: đưa phim Hàn Quốc lên sân khấu Oscar và giành chiến thắng tuyệt đối. Ký Sinh Trùng là bộ phim không thể gắn nhãn thể loại – nó vừa là hài đen, vừa là thriller, vừa là phê phán xã hội sắc bén về bất bình đẳng giai cấp.', genre: 'Thriller / Hài đen' },
    ],
    faq: [
      { q: 'Xem phim chiếu rạp online miễn phí vietsub ở đâu?', a: 'KhoPhim (khophim.org) là trang xem phim chiếu rạp online miễn phí tốt nhất 2026. Phim chiếu rạp được cập nhật nhanh sau khi ra mắt, chất lượng HD Full HD vietsub, không quảng cáo.' },
      { q: 'Phim chiếu rạp hay nhất 2026 là gì?', a: 'KhoPhim cập nhật đầy đủ phim chiếu rạp hot nhất 2026 từ Marvel, DC, Disney đến các bom tấn Hàn Quốc và Việt Nam. Vào mục Phim Chiếu Rạp để xem danh sách đầy đủ.' },
    ],
    related: [{ label: 'Phim Lẻ Vietsub', href: '/phim-le' }, { label: 'Phim Âu Mỹ HD', href: '/phim-au-my' }, { label: 'Phim Sắp Chiếu', href: '/phim-sap-chieu' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }],
  },
  'han-quoc': {
    heading: 'Xem Phim Hàn Quốc Vietsub Online Miễn Phí HD – Drama Hàn Mới Nhất 2026',
    intro: 'KhoPhim là điểm đến hàng đầu để xem phim Hàn Quốc vietsub online miễn phí với chất lượng HD Full HD. Kho drama Hàn cực kỳ đa dạng: từ phim tình cảm lãng mạn, phim hành động hình sự đến phim lịch sử cổ trang, kinh dị tâm lý mới nhất 2026. Tất cả phim Hàn đều có vietsub hoặc lồng tiếng Việt chuẩn, không quảng cáo, cập nhật cực nhanh sau khi phát sóng tại Hàn Quốc.',
    features: ['Drama Hàn Quốc vietsub HD đầy đủ, không quảng cáo', 'Cập nhật tập mới nhanh sau khi phát sóng tại Hàn', 'Đa thể loại: romance, action, thriller, saeguk 2026', 'Phim Hàn lẻ & bộ từ tvN, SBS, MBC, Netflix Korea', 'Tìm kiếm phim theo tên diễn viên, đạo diễn Hàn'],
    reviews: [
      { title: 'My Mister (Anh Trai Của Tôi)', year: 2018, rating: '9.6/10', review: 'Nếu phải chọn một bộ phim Hàn Quốc để giới thiệu với người chưa từng xem phim Hàn, đó sẽ là My Mister. Không có cảnh hôn nhau, không có tình tiết lãng mạn sến súa – chỉ là hai con người cô đơn tìm thấy nhau trong im lặng. IU vào vai một cô gái trẻ mang gánh nặng cuộc đời quá sức, Lee Sun-kyun là người đàn ông trung niên đang chìm dần trong thất bại.', genre: 'Drama / Tâm lý' },
      { title: 'Signal (Tín Hiệu)', year: 2016, rating: '9.3/10', review: 'Signal là bằng chứng rằng phim hình sự Hàn Quốc có thể vượt xa mọi kỳ vọng. Ý tưởng về chiếc bộ đàm kết nối hai thám tử ở hai thời điểm khác nhau nghe có vẻ phi lý, nhưng biên kịch Kim Eun-hee đã biến nó thành công cụ để khám phá những vụ án lạnh chưa được giải quyết trong lịch sử Hàn Quốc.', genre: 'Hình sự / Khoa học viễn tưởng' },
    ],
    faq: [
      { q: 'Trang web nào xem phim Hàn Quốc vietsub miễn phí HD tốt nhất?', a: 'KhoPhim (khophim.org) là trang xem phim Hàn Quốc vietsub miễn phí tốt nhất 2026. Phim được cập nhật liên tục, chất lượng HD Full HD, phụ đề tiếng Việt chuẩn. Hoàn toàn miễn phí, không quảng cáo, không cần đăng ký.' },
      { q: 'Xem phim bộ Hàn Quốc hay nhất 2026 ở đâu miễn phí?', a: 'Tại KhoPhim, bạn có thể xem hàng nghìn phim bộ Hàn Quốc vietsub hay nhất từ trước đến nay. Từ Hậu Duệ Mặt Trời, Crash Landing On You đến các drama mới nhất 2026 đều có đầy đủ vietsub HD miễn phí.' },
    ],
    related: [{ label: 'Phim Trung Quốc', href: '/phim-trung-quoc' }, { label: 'Phim Nhật Bản', href: '/phim-nhat-ban' }, { label: 'Phim Thái Lan', href: '/phim-thai-lan' }, { label: 'Phim Âu Mỹ HD', href: '/phim-au-my' }],
  },
  'trung-quoc': {
    heading: 'Xem Phim Trung Quốc Online Miễn Phí HD – Cổ Trang, Tiên Hiệp Mới Nhất',
    intro: 'KhoPhim mang đến kho phim Trung Quốc phong phú với đầy đủ thể loại: phim cổ trang hoàng cung, tiên hiệp tu tiên, phim hiện đại tình cảm và hành động đô thị. Tất cả phim Trung Quốc tại khophim.org đều có phụ đề tiếng Việt hoặc lồng tiếng, chất lượng HD Full HD.',
    features: ['Phim cổ trang Trung Quốc vietsub đầy đủ', 'Tiên hiệp, tu tiên, kiếm hiệp hay nhất', 'Phim hiện đại ngôn tình, hành động', 'Từ iQIYI, Youku, Tencent Video', 'Cập nhật tập mới liên tục không gián đoạn'],
    reviews: [
      { title: 'Trường Phong Độ', year: 2022, rating: '8.9/10', review: 'Trong biển phim cổ trang Trung Quốc tràn ngập cung đấu và tình yêu sến súa, Trường Phong Độ là làn gió lạ. Bộ phim lấy bối cảnh thời Tam Quốc nhưng không tập trung vào những anh hùng nổi tiếng – thay vào đó là câu chuyện về hai điệp viên bình thường bị kẹt giữa hai thế lực.', genre: 'Cổ trang / Gián điệp' },
      { title: 'Hương Mật Tựa Khói Sương', year: 2018, rating: '8.7/10', review: 'Hương Mật Tựa Khói Sương là đỉnh cao của thể loại tiên hiệp ngôn tình Trung Quốc. Điều khiến bộ phim này vượt trội so với hàng trăm tác phẩm cùng thể loại là chiều sâu cảm xúc – tình yêu giữa Bạch Phượng Cửu và Dạ Hoa không phải là tình yêu sét đánh mà là sự gắn kết qua hàng nghìn năm và vô số kiếp nạn.', genre: 'Tiên hiệp / Tình cảm' },
    ],
    faq: [
      { q: 'Phim cổ trang Trung Quốc hay nhất hiện nay là gì?', a: 'KhoPhim cập nhật liên tục phim cổ trang Trung Quốc mới nhất và hay nhất. Các bom tấn như Diên Hi Công Lược, Hạo Y Hành, Thượng Dương Phú đều có đầy đủ tại KhoPhim.' },
      { q: 'Xem phim tiên hiệp Trung Quốc vietsub ở đâu?', a: 'KhoPhim (khophim.org) có kho phim tiên hiệp Trung Quốc cực kỳ đồ sộ với vietsub chuẩn và chất lượng HD. Từ Tiên Kiếm Kỳ Hiệp, Hoa Thiên Cốt đến các phim tu tiên mới nhất 2026 đều có tại đây.' },
    ],
    related: [{ label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'Phim Nhật Bản', href: '/phim-nhat-ban' }, { label: 'Phim Bộ', href: '/phim-bo' }, { label: 'Phim Lẻ', href: '/phim-le' }],
  },
  'au-my': {
    heading: 'Xem Phim Âu Mỹ Online Miễn Phí HD – Hollywood Blockbuster Mới Nhất 2026',
    intro: 'KhoPhim cung cấp kho phim Âu Mỹ khổng lồ với hàng nghìn bộ phim Hollywood và châu Âu chất lượng cao. Từ các bom tấn Marvel, DC, phim hành động thế giới đến phim tình cảm lãng mạn, kinh dị, sci-fi – tất cả đều có tại khophim.org với chất lượng HD Full HD, phụ đề tiếng Việt hoặc lồng tiếng.',
    features: ['Bom tấn Hollywood HD Full HD mới nhất', 'Marvel, DC, Disney, Universal đầy đủ', 'Phim lẻ & phim bộ Âu Mỹ vietsub', 'Cập nhật phim chiếu rạp sau khi ra mắt', 'Âm thanh & hình ảnh sắc nét chất lượng cao'],
    reviews: [
      { title: 'Interstellar', year: 2014, rating: '9.3/10', review: 'Interstellar là bộ phim khoa học viễn tưởng duy nhất khiến người xem vừa hiểu vật lý thiên văn vừa khóc vì tình phụ tử. Christopher Nolan đã hợp tác với nhà vật lý lý thuyết Kip Thorne để tạo ra hình ảnh lỗ đen chính xác nhất từng xuất hiện trên màn ảnh.', genre: 'Khoa học viễn tưởng / Drama' },
      { title: 'The Shawshank Redemption', year: 1994, rating: '9.8/10', review: 'Sau hơn 30 năm, Nhà Tù Shawshank vẫn đứng đầu danh sách phim hay nhất mọi thời đại trên IMDb. Frank Darabont đã chuyển thể truyện ngắn của Stephen King thành một bài ca về hy vọng không bao giờ tắt. Andy Dufresne không phải là anh hùng theo nghĩa thông thường – ông chỉ là một người đàn ông bị kết án oan, nhưng chọn cách giữ lấy phẩm giá và trí tuệ trong môi trường tàn nhẫn nhất.', genre: 'Drama / Tội phạm' },
    ],
    faq: [
      { q: 'Xem phim Mỹ online HD miễn phí không quảng cáo ở đâu?', a: 'KhoPhim (khophim.org) là trang xem phim Mỹ và phim Âu Mỹ online miễn phí tốt nhất 2026, chất lượng HD Full HD, không có quảng cáo phiền phức.' },
      { q: 'Phim Marvel và DC mới nhất xem ở đâu?', a: 'Toàn bộ vũ trụ điện ảnh Marvel (MCU) và DC đều có đầy đủ tại KhoPhim với chất lượng HD, vietsub chuẩn. Từ các phim cũ đến bom tấn mới nhất đều được cập nhật nhanh chóng.' },
    ],
    related: [{ label: 'Phim Lẻ', href: '/phim-le' }, { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'TV Shows', href: '/tv-shows' }],
  },
  'nhat-ban': {
    heading: 'Xem Phim Nhật Bản Online Miễn Phí HD – Anime & J-Drama Mới Nhất 2026',
    intro: 'KhoPhim là kho anime và phim Nhật Bản trực tuyến lớn nhất với chất lượng HD, phụ đề tiếng Việt đầy đủ. Từ anime hành động, phiêu lưu đến j-drama lãng mạn và phim điện ảnh đẳng cấp của Nhật Bản – tất cả đều có tại khophim.org.',
    features: ['Anime vietsub HD mùa mới nhất', 'J-drama Nhật Bản đa dạng thể loại', 'Phim điện ảnh Nhật Bản đoạt giải', 'Cập nhật tập anime mới hàng tuần', 'Tìm kiếm theo tên tiếng Nhật & tiếng Việt'],
    reviews: [
      { title: 'Spirited Away (Vùng Đất Linh Hồn)', year: 2001, rating: '9.7/10', review: 'Hayao Miyazaki đã tạo ra một thế giới không thể tưởng tượng được – và rồi khiến nó trở nên hoàn toàn có thật. Vùng Đất Linh Hồn là hành trình trưởng thành của cô bé Chihiro trong một thế giới thần linh kỳ bí. Đây là phim hoạt hình duy nhất không phải tiếng Anh giành Oscar Phim Hoạt Hình Xuất Sắc Nhất.', genre: 'Hoạt hình / Fantasy' },
      { title: 'Your Name (Tên Cậu Là Gì?)', year: 2016, rating: '9.1/10', review: 'Makoto Shinkai đã làm điều mà nhiều đạo diễn mơ ước: tạo ra một bộ phim hoạt hình vừa đẹp đến nghẹt thở vừa kể một câu chuyện tình yêu không thể quên. Tên Cậu Là Gì? không chỉ là phim về hai người hoán đổi thân xác – đó là câu chuyện về sự kết nối vượt qua không gian và thời gian.', genre: 'Hoạt hình / Tình cảm' },
    ],
    faq: [
      { q: 'Trang web xem anime vietsub HD tốt nhất là gì?', a: 'KhoPhim (khophim.org) là một trong những trang xem anime vietsub HD tốt nhất hiện nay. Kho anime cực kỳ đa dạng từ các thể loại shounen, romance, isekai, slice of life đến các anime kinh điển và mới nhất 2026.' },
      { q: 'Xem phim Nhật Bản lồng tiếng Việt ở đâu?', a: 'KhoPhim có đầy đủ phim Nhật Bản với cả vietsub và lồng tiếng Việt. Từ anime cho trẻ em đến phim người lớn, j-drama tình cảm đến phim hành động – tất cả đều miễn phí và không quảng cáo.' },
    ],
    related: [{ label: 'Hoạt Hình', href: '/hoat-hinh' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' }, { label: 'TV Shows', href: '/tv-shows' }],
  },
  'thai-lan': {
    heading: 'Xem Phim Thái Lan Online Miễn Phí HD – Phim Bộ Thái Vietsub Hay Nhất 2026',
    intro: 'KhoPhim mang đến bộ sưu tập phim Thái Lan phong phú với các thể loại đa dạng: tình cảm lãng mạn, hành động, kinh dị, hài hước và BL (Boys\' Love). Tất cả phim Thái tại khophim.org đều có phụ đề tiếng Việt chuẩn, chất lượng HD, cập nhật tập mới liên tục.',
    features: ['Phim bộ Thái Lan vietsub HD đầy đủ', 'Lakorn Thái tình cảm mới nhất', 'Phim BL Thái hay nhất hiện nay', 'Cập nhật từ Ch3, Ch7, GMMTV, One31', 'Phim Thái lẻ & bộ đa thể loại'],
    reviews: [
      { title: '2gether: The Series', year: 2020, rating: '8.5/10', review: '2gether: The Series là bộ phim BL Thái Lan đã thay đổi hoàn toàn cách thế giới nhìn nhận thể loại này. Trước 2gether, BL Thái chủ yếu chỉ được biết đến trong cộng đồng fan nhỏ – sau 2gether, nó trở thành hiện tượng toàn cầu với hashtag trending ở hàng chục quốc gia.', genre: 'BL / Tình cảm' },
      { title: 'Hormones (Tuổi Nổi Loạn)', year: 2013, rating: '8.8/10', review: 'Hormones là bộ phim học đường Thái Lan dũng cảm nhất từng được sản xuất. Thay vì tô hồng tuổi teen như hầu hết phim học đường Châu Á, Hormones đối mặt thẳng với những vấn đề thực sự: tình dục, ma túy, bạo lực học đường, áp lực gia đình, bản dạng giới.', genre: 'Học đường / Drama' },
    ],
    faq: [
      { q: 'Xem phim Thái Lan vietsub online ở đâu?', a: 'KhoPhim (khophim.org) là trang xem phim Thái Lan vietsub online tốt nhất. Kho phim Thái cực kỳ đầy đủ từ phim bộ tình cảm lakorn đến phim hành động, kinh dị và BL drama. Miễn phí, HD, không cần đăng ký.' },
      { q: 'Phim BL Thái Lan hay nhất 2026 là gì?', a: 'KhoPhim cập nhật đầy đủ các phim BL Thái Lan mới nhất và hot nhất. Bạn có thể dùng bộ lọc thể loại hoặc tìm kiếm trực tiếp để tìm các phim BL từ GMMTV và các nhà sản xuất Thái Lan khác.' },
    ],
    related: [{ label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'Phim Việt Nam', href: '/phim-viet-nam' }, { label: 'Phim Bộ', href: '/phim-bo' }, { label: 'Phim Lẻ', href: '/phim-le' }],
  },
  'viet-nam': {
    heading: 'Xem Phim Việt Nam Online Miễn Phí HD – Phim Chiếu Rạp & Phim Bộ Việt Mới Nhất 2026',
    intro: 'KhoPhim là địa chỉ xem phim Việt Nam online miễn phí tốt nhất với kho phim cực kỳ đa dạng. Từ phim chiếu rạp bom tấn Việt đến phim bộ truyền hình, phim hài, tình cảm, hành động Việt Nam – tất cả đều có tại khophim.org với chất lượng HD Full HD.',
    features: ['Phim chiếu rạp Việt Nam mới nhất', 'Phim bộ truyền hình VTV, HTV đầy đủ', 'Phim hài Việt Nam hàng nghìn bộ', 'Phim hành động, tình cảm, kinh dị Việt', 'Chất lượng HD Full HD rõ nét'],
    reviews: [
      { title: 'Mắt Biếc', year: 2019, rating: '8.6/10', review: 'Victor Vũ đã chuyển thể tiểu thuyết của Nguyễn Nhật Ánh thành một bộ phim điện ảnh Việt Nam đẹp đến đau lòng. Mắt Biếc không phải là câu chuyện tình yêu có hậu – đó là câu chuyện về một tình yêu đơn phương kéo dài suốt cả tuổi thơ và thanh xuân.', genre: 'Tình cảm / Drama' },
      { title: 'Hai Phượng', year: 2019, rating: '8.4/10', review: 'Hai Phượng đã làm điều mà điện ảnh Việt Nam chưa từng làm được: tạo ra một bộ phim hành động đủ chất lượng để cạnh tranh trên thị trường quốc tế. Ngô Thanh Vân không chỉ đóng vai chính mà còn tự thực hiện hầu hết các cảnh hành động.', genre: 'Hành động / Gia đình' },
    ],
    faq: [
      { q: 'Xem phim Việt Nam chiếu rạp online ở đâu miễn phí?', a: 'KhoPhim (khophim.org) có đầy đủ phim chiếu rạp Việt Nam với chất lượng HD, miễn phí hoàn toàn. Phim được cập nhật nhanh sau khi ra rạp. Không cần đăng ký, xem ngay trên trình duyệt.' },
      { q: 'Phim bộ Việt Nam hay nhất xem ở đâu?', a: 'KhoPhim tổng hợp hàng nghìn phim bộ Việt Nam từ các đài VTV, HTV, THVL đến các phim web drama mới nhất. Tất cả đều miễn phí, HD, có thể xem trên mọi thiết bị.' },
    ],
    related: [{ label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'Phim Thái Lan', href: '/phim-thai-lan' }, { label: 'Phim Bộ', href: '/phim-bo' }, { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' }],
  },
  'hoat-hinh': {
    heading: 'Xem Phim Hoạt Hình Online Miễn Phí HD – Anime & Cartoon Mới Nhất 2026',
    intro: 'KhoPhim là thiên đường hoạt hình với kho anime và cartoon đồ sộ dành cho mọi lứa tuổi. Từ anime Nhật Bản hành động phiêu lưu đến hoạt hình Disney, Pixar và các cartoon phương Tây – tất cả đều có tại khophim.org với chất lượng HD, lồng tiếng Việt và phụ đề.',
    features: ['Anime Nhật Bản vietsub & lồng tiếng', 'Hoạt hình Disney, Pixar, DreamWorks HD', 'Cartoon thiếu nhi vui nhộn đa dạng', 'Cập nhật anime mùa mới hàng tuần', 'Phù hợp mọi lứa tuổi từ trẻ em đến người lớn'],
    reviews: [
      { title: 'Attack on Titan (Đại Chiến Titan)', year: 2013, rating: '9.5/10', review: 'Đại Chiến Titan là anime đã phá vỡ mọi quy tắc của thể loại. Hajime Isayama không ngại giết chết nhân vật chính, không ngại đặt câu hỏi về đạo đức chiến tranh, và không ngại kết thúc câu chuyện theo cách khiến cả cộng đồng fan chia rẽ.', genre: 'Hành động / Dark Fantasy' },
      { title: 'Demon Slayer (Thanh Gươm Diệt Quỷ)', year: 2019, rating: '9.0/10', review: 'Ufotable đã nâng tầm hoạt hình anime lên một đẳng cấp mới với Thanh Gươm Diệt Quỷ. Những cảnh chiến đấu trong series này không chỉ là hành động – chúng là nghệ thuật thị giác với hiệu ứng nước, lửa, và ánh sáng được render đẹp đến mức nhiều cảnh có thể treo lên tường như tranh.', genre: 'Hành động / Shounen' },
    ],
    faq: [
      { q: 'Xem anime online miễn phí vietsub ở đâu tốt nhất?', a: 'KhoPhim (khophim.org) là trang xem anime online vietsub miễn phí với kho phim hoạt hình cực lớn. Anime được cập nhật tập mới hàng tuần, chất lượng HD, phụ đề tiếng Việt chuẩn.' },
      { q: 'Phim hoạt hình cho trẻ em xem ở đâu miễn phí?', a: 'KhoPhim có đầy đủ phim hoạt hình cho trẻ em từ Doraemon, Conan đến các phim Disney, Pixar mới nhất. Tất cả đều có lồng tiếng Việt, chất lượng HD, hoàn toàn miễn phí.' },
    ],
    related: [{ label: 'Phim Nhật Bản', href: '/phim-nhat-ban' }, { label: 'Phim Lẻ', href: '/phim-le' }, { label: 'TV Shows', href: '/tv-shows' }, { label: 'Phim Bộ', href: '/phim-bo' }],
  },
  'tv-shows': {
    heading: 'Xem TV Shows Online Miễn Phí HD – Series Truyền Hình Hay Nhất Thế Giới 2026',
    intro: 'KhoPhim tổng hợp các TV shows và series truyền hình hay nhất thế giới với chất lượng HD Full HD. Từ các drama Mỹ đình đám trên Netflix, HBO, Disney+ đến reality show, variety show Hàn Quốc và Trung Quốc – tất cả đều có tại khophim.org.',
    features: ['Series HBO, Netflix, Disney+ vietsub', 'Reality show & variety show Hàn, Trung', 'Cập nhật episode mới cực nhanh', 'HD Full HD chất lượng cao', 'Phụ đề tiếng Việt chuẩn xác'],
    reviews: [
      { title: 'Breaking Bad', year: 2008, rating: '9.9/10', review: 'Breaking Bad là câu trả lời cho câu hỏi: một con người tốt có thể trở thành ác nhân như thế nào? Vince Gilligan đã dành 5 mùa để biến Walter White từ một giáo viên hóa học hiền lành thành Heisenberg – một trong những nhân vật phản diện đáng sợ nhất lịch sử truyền hình.', genre: 'Crime / Drama' },
      { title: 'Chernobyl (HBO)', year: 2019, rating: '9.7/10', review: 'Chernobyl của HBO là miniseries tài liệu hư cấu xuất sắc nhất từng được sản xuất. Craig Mazin đã tái hiện thảm họa hạt nhân 1986 với độ chính xác lịch sử đáng kinh ngạc. Câu thoại "What is the cost of lies?" vang lên như một lời cảnh báo không chỉ cho Liên Xô mà cho bất kỳ xã hội nào.', genre: 'Lịch sử / Drama' },
    ],
    faq: [
      { q: 'Xem TV shows Netflix và HBO online miễn phí ở đâu?', a: 'KhoPhim (khophim.org) cung cấp các TV shows từ Netflix, HBO, Disney+ với phụ đề tiếng Việt và chất lượng HD. Miễn phí hoàn toàn, cập nhật liên tục các series hot nhất.' },
      { q: 'Phim truyền hình Mỹ hay nhất 2026 là gì?', a: 'KhoPhim cập nhật đầy đủ các TV shows Mỹ hot nhất 2026. Bạn có thể vào mục TV Shows để xem danh sách hoặc dùng tính năng tìm kiếm để tìm series yêu thích.' },
    ],
    related: [{ label: 'Phim Bộ', href: '/phim-bo' }, { label: 'Phim Âu Mỹ', href: '/phim-au-my' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'Hoạt Hình', href: '/hoat-hinh' }],
  },
  'phim-sap-chieu': {
    heading: 'Phim Sắp Chiếu & Phim Hot 2026 – Cập Nhật Trailer Mới Nhất',
    intro: 'Theo dõi danh sách phim sắp chiếu và phim đang hot nhất 2026 tại KhoPhim. Xem trước trailer, cập nhật thông tin phim mới ra mắt từ Hollywood, Hàn Quốc, Trung Quốc và Việt Nam. KhoPhim (khophim.org) cập nhật nhanh nhất khi phim mới phát hành.',
    features: ['Danh sách phim sắp chiếu mới nhất 2026', 'Trailer phim chính thức chất lượng HD', 'Thông tin chi tiết: diễn viên, đạo diễn, ngày ra mắt', 'Cập nhật sớm khi phim chính thức phát hành', 'Phim từ Hollywood, Hàn, Trung, Việt đầy đủ'],
    reviews: [
      { title: 'Dune: Part Two', year: 2024, rating: '9.1/10', review: 'Denis Villeneuve đã hoàn thành điều mà nhiều người cho là bất khả thi: chuyển thể thành công tiểu thuyết khoa học viễn tưởng phức tạp nhất lịch sử. Dune: Part Two không chỉ là phim về sa mạc và giun cát – đó là câu chuyện về sự nguy hiểm của việc tôn thờ một người như đấng cứu thế.', genre: 'Khoa học viễn tưởng / Sử thi' },
      { title: 'Inside Out 2', year: 2024, rating: '8.8/10', review: 'Pixar đã làm điều hiếm hoi: tạo ra một phần tiếp theo hay hơn phần gốc. Inside Out 2 mở rộng thế giới cảm xúc bên trong tâm trí Riley khi cô bé bước vào tuổi teen, với sự xuất hiện của Anxiety – nhân vật cảm xúc phức tạp nhất Pixar từng tạo ra.', genre: 'Hoạt hình / Gia đình' },
    ],
    faq: [
      { q: 'Phim hay nhất sắp ra mắt 2026 là gì?', a: 'KhoPhim cập nhật liên tục danh sách phim sắp chiếu từ khắp nơi trên thế giới. Bạn có thể theo dõi trang Phim Sắp Chiếu để xem trước trailer và chuẩn bị cho các bộ phim hot sắp ra mắt.' },
      { q: 'Xem trailer phim mới nhất ở đâu?', a: 'Tại mục Phim Sắp Chiếu của KhoPhim, bạn có thể xem trailer chính thức của tất cả phim sắp ra mắt với chất lượng HD. Cập nhật hàng ngày, đảm bảo bạn luôn nắm bắt thông tin phim mới nhất.' },
    ],
    related: [{ label: 'Phim Lẻ', href: '/phim-le' }, { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' }, { label: 'Phim Âu Mỹ', href: '/phim-au-my' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }],
  },
};

const DEFAULT_SEO: SEOData = {
  heading: 'Xem Phim Online Miễn Phí HD – KhoPhim',
  intro: 'KhoPhim (khophim.org) là trang web xem phim online miễn phí hàng đầu Việt Nam với hơn 50,000 bộ phim chất lượng cao. Không cần đăng ký, không quảng cáo, cập nhật hàng ngày.',
  features: ['Hơn 50,000 phim từ khắp nơi trên thế giới', 'Chất lượng HD Full HD', 'Phụ đề tiếng Việt đầy đủ', 'Miễn phí, không cần đăng ký', 'Tương thích mọi thiết bị'],
  faq: [{ q: 'KhoPhim có xem phim miễn phí không?', a: 'Có, KhoPhim cung cấp dịch vụ xem phim hoàn toàn miễn phí, không yêu cầu đăng ký tài khoản.' }],
  related: [{ label: 'Phim Lẻ', href: '/phim-le' }, { label: 'Phim Bộ', href: '/phim-bo' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'Phim Âu Mỹ', href: '/phim-au-my' }],
};

interface Props { categoryKey: string; }

export default function CategorySEOContent({ categoryKey }: Props) {
  const data = SEO_CONTENT[categoryKey] ?? DEFAULT_SEO;
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section className="mt-8 sm:mt-16 pt-6 sm:pt-12 pb-4" aria-label="Thông tin danh mục phim">

      {/* Section heading */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-1 h-6 bg-red-500 rounded-full flex-shrink-0" />
        <div className="flex-1">
          <h2 className="text-base font-bold text-white leading-snug">{data.heading}</h2>
          <div className="h-px bg-gradient-to-r from-red-500/30 to-transparent mt-2" />
        </div>
      </div>

      {/* Intro + Features */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10">
        <div className="lg:col-span-3">
          <p className="text-white/50 text-sm leading-relaxed mb-6">{data.intro}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {data.features.map((f, i) => {
              const icons = ['ri-check-double-line', 'ri-time-line', 'ri-translate-2', 'ri-smartphone-line', 'ri-hd-line'];
              return (
                <div key={f} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 hover:border-red-500/20 hover:bg-red-500/[0.03] transition-all">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 flex-shrink-0">
                    <i className={`${icons[i % icons.length]} text-red-400 text-sm`} />
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
            <i className="ri-question-answer-line text-red-400 text-sm" />
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Câu hỏi thường gặp</h3>
          </div>
          <div className="space-y-2">
            {data.faq.map((item, i) => (
              <div
                key={item.q}
                className={`rounded-xl border transition-all overflow-hidden ${openFaq === i ? 'border-red-500/25 bg-red-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'}`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer text-left"
                >
                  <strong className={`text-sm font-medium leading-snug transition-colors ${openFaq === i ? 'text-white' : 'text-white/70'}`}>{item.q}</strong>
                  <div className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 transition-all ${openFaq === i ? 'bg-red-500/20 rotate-45' : 'bg-white/5'}`}>
                    <i className={`ri-add-line text-xs ${openFaq === i ? 'text-red-400' : 'text-white/30'}`} />
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4">
                    <div className="h-px bg-red-500/10 mb-3" />
                    <p className="text-white/45 text-sm leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Review phim nổi bật */}
      {data.reviews && data.reviews.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-5 bg-red-500/60 rounded-full flex-shrink-0" />
            <h3 className="text-sm font-bold text-white/80">Đánh Giá Phim Nổi Bật</h3>
            <span className="text-[11px] text-white/25 bg-white/[0.04] border border-white/[0.06] px-2.5 py-0.5 rounded-full">Biên tập viên KhoPhim</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.reviews.map((review) => (
              <article
                key={review.title}
                className="group bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5 hover:border-red-500/20 transition-all"
                itemScope itemType="https://schema.org/Review"
              >
                <div itemProp="itemReviewed" itemScope itemType="https://schema.org/Movie" className="hidden">
                  <meta itemProp="name" content={review.title} />
                  <meta itemProp="dateCreated" content={String(review.year)} />
                </div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold text-sm leading-snug group-hover:text-red-300 transition-colors">{review.title}</h4>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded-md">{review.year}</span>
                      <span className="text-[11px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded-md">{review.genre}</span>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl flex-shrink-0"
                    itemProp="reviewRating" itemScope itemType="https://schema.org/Rating"
                  >
                    <i className="ri-star-fill text-amber-400 text-xs" />
                    <span className="text-amber-300 text-xs font-bold" itemProp="ratingValue">{review.rating}</span>
                    <meta itemProp="bestRating" content="10" />
                    <meta itemProp="worstRating" content="1" />
                  </div>
                </div>
                <p className="text-white/45 text-sm leading-relaxed line-clamp-4" itemProp="reviewBody">{review.review}</p>
                <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <i className="ri-quill-pen-line text-red-400 text-[9px]" />
                  </div>
                  <span className="text-[11px] text-white/20" itemProp="author" itemScope itemType="https://schema.org/Organization">
                    Đánh giá bởi <span itemProp="name" className="text-white/35">KhoPhim</span>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Related categories */}
      <div className="border-t border-white/[0.05] pt-6">
        <div className="flex items-center gap-2 mb-3">
          <i className="ri-links-line text-white/20 text-sm" />
          <h3 className="text-xs font-semibold text-white/25 uppercase tracking-wider">Danh mục liên quan</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.related.map((r) => (
            <Link
              key={r.href}
              to={r.href}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-white/[0.03] hover:bg-red-500/10 text-white/40 hover:text-red-400 border border-white/[0.06] hover:border-red-500/25 rounded-full text-sm transition-all cursor-pointer whitespace-nowrap"
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
