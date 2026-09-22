-- Evidence checked 2026-09-11 from primary or authoritative sources:
-- A Bona Fide Killer: https://content.mbc.co.kr/program/drama/3900831_64285.html
-- Phi Phong: https://lsf.go.id/film/phi-phong-blood-demon/1269
-- The Air 4 Elements: https://www.iq.com/album/the-air-4-elements-gio-thoang-tinh-theo-2026-z2cvnrjpt9?lang=vi_vn
-- Silo: https://www.apple.com/tv-pr/news/2023/03/apple-tv-unearths-first-look-at-gripping-new-series-silo-and-sets-global-premiere-for-friday-may-5-2023/

begin;

-- Correct only facts that are contradicted by official sources or by the
-- playable inventory. Canonical slugs are deliberately preserved.
update public.movies
set director = array['Yoon Jong-ho']::text[], updated_at = now()
where slug = 'sat-thu-noi-tro'
  and director = array['YOON']::text[];

update public.movies
set
  name = 'The Air 4 Elements: Gió Thoảng Tình Theo',
  title_vi = 'The Air 4 Elements: Gió Thoảng Tình Theo',
  title_en = 'The Air 4 Elements',
  episode_total = '8',
  total_episodes = 8,
  updated_at = now()
where slug = 'the-air-4-elements'
  and public.get_movie_playable_max_episode(id) = 8;

update public.movies
set
  director = array['Morten Tyldum']::text[],
  poster_url = 'https://img.ophim.live/uploads/movies/silo-poster.jpg',
  thumb_url = 'https://img.ophim.live/uploads/movies/silo-thumb.jpg',
  updated_at = now()
where slug = 'silo-2023'
  and cardinality(director) = 0;

create temporary table seo_editorial_payloads (
  slug text primary key,
  focus_keyword text not null,
  secondary_keywords text[] not null,
  seo_title text not null,
  meta_description text not null,
  intro_content text not null,
  review_content text not null,
  faq jsonb not null,
  topic_links jsonb not null
) on commit drop;

insert into seo_editorial_payloads values
(
  'sat-thu-noi-tro',
  'sát thủ nội trợ',
  array['Vợ Tôi Là Sát Thủ','A Bona Fide Killer','sát thủ nội trợ vietsub','A Bona Fide Killer 2026','phim Gong Hyo-jin','phim Hàn Quốc hành động 2026'],
  'Sát Thủ Nội Trợ (2026) – Tập Mới Vietsub | KhoPhim',
  'Sát Thủ Nội Trợ (A Bona Fide Killer) – nội dung, diễn viên, đạo diễn Yoon Jong-ho và các tập Vietsub đang có trên KhoPhim.',
  $intro_sat_thu$
Sát Thủ Nội Trợ, còn được biết đến với tên Vợ Tôi Là Sát Thủ hoặc A Bona Fide Killer, là phim truyền hình Hàn Quốc năm 2026. Nhân vật trung tâm Yoo Bo-na có cuộc sống bề ngoài như một nhân viên văn phòng, người vợ và người mẹ bình thường. Danh tính bí mật của cô là Kingfisher, một tay súng thuộc tổ chức chuyên truy đuổi những tội phạm thoát khỏi sự trừng phạt của pháp luật. Sau quãng thời gian tạm rời công việc nguy hiểm để chăm sóc gia đình, Bo-na buộc phải trở lại với cuộc sống hai mặt.

Theo hồ sơ chương trình của MBC, phim do Yoon Jong-ho đạo diễn, Kim Eun-hee biên kịch và có Gong Hyo-jin, Jung Jun-won, Lee Sang-yi cùng Sung Dong-il trong dàn diễn viên chính. Trang này cập nhật nội dung, diễn viên, tình trạng tập và nguồn xem hiện có. Khi một tập mới vượt qua kiểm tra nguồn phát, thông tin tập trên cùng URL sẽ được cập nhật để người xem không phải tìm một trang khác.
$intro_sat_thu$,
  $review_sat_thu$
Sát Thủ Nội Trợ xây dựng xung đột từ hai vai trò vốn khó tồn tại song song. Ở nơi làm việc và trong gia đình, Yoo Bo-na phải giữ hình ảnh của một người bình thường; ở phần đời còn lại, cô là một tay súng có kinh nghiệm và phải đối diện với hậu quả của từng nhiệm vụ. Điểm cốt lõi của câu chuyện không chỉ là việc che giấu nghề nghiệp, mà còn là nguy cơ người chồng làm phóng viên lần theo đúng bí mật cô muốn bảo vệ.

Thông tin chính thức của MBC mô tả đây là cuộc đấu tranh nhiều rủi ro của một người mẹ làm công việc nguy hiểm nhất để giữ cân bằng giữa gia đình và nhiệm vụ. Cách giới thiệu này giúp phân biệt bộ phim với những tác phẩm chỉ tập trung vào hành động: áp lực đến từ cả mục tiêu bên ngoài lẫn khả năng gia đình Bo-na tan vỡ khi sự thật lộ ra. Những chi tiết về Kingfisher, người chồng phóng viên và tổ chức bí mật đều thuộc tiền đề đã được công bố; các diễn biến của từng tập không được suy đoán trước trên trang.

Gong Hyo-jin đảm nhận Yoo Bo-na, bên cạnh Jung Jun-won, Lee Sang-yi và Sung Dong-il. Yoon Jong-ho là đạo diễn được MBC công bố, còn Kim Eun-hee phụ trách kịch bản. KhoPhim giữ nguyên tên quốc tế A Bona Fide Killer cùng các biến thể tên Việt để người dùng có thể tìm đúng tác phẩm, nhưng không tạo nhiều URL trùng nhau cho cùng một phim.

Với người đang theo dõi phim, phần hữu ích nhất của trang là trạng thái tập và nguồn phát được kiểm tra trước khi hiển thị. Tại thời điểm biên tập, hệ thống đã ghi nhận các tập đang phát hành và sẽ tiếp tục đối chiếu số tập thực sự xem được. Nội dung giới thiệu không thay thế phần xem phim và không cam kết một tập mới trước khi nguồn hợp lệ xuất hiện.

Trang không tự chấm điểm hoặc khẳng định chất lượng phim bằng nhận xét cảm tính. Thay vào đó, hồ sơ tập trung vào tiền đề, ê-kíp, diễn viên, tiến độ tập và liên kết tới các cụm phim Hàn Quốc, hành động, hình sự có liên quan. Cách tổ chức này giúp người xem quyết định liệu chủ đề đời sống hai mặt, gia đình và truy đuổi tội phạm có phù hợp với nhu cầu của mình hay không.
$review_sat_thu$,
  '[{"question":"Sát Thủ Nội Trợ còn có tên nào khác?","answer":"Tên quốc tế của phim là A Bona Fide Killer. Trên KhoPhim, phim cũng được nhận diện bằng tên Việt Vợ Tôi Là Sát Thủ để người xem tìm đúng cùng một trang."},{"question":"Ai đạo diễn và đóng chính Sát Thủ Nội Trợ?","answer":"MBC công bố Yoon Jong-ho là đạo diễn, Kim Eun-hee là biên kịch; dàn diễn viên chính gồm Gong Hyo-jin, Jung Jun-won, Lee Sang-yi và Sung Dong-il."},{"question":"Nội dung A Bona Fide Killer nói về điều gì?","answer":"Phim theo chân Yoo Bo-na, một người mẹ có vẻ ngoài bình thường nhưng bí mật là tay súng Kingfisher. Cô phải che giấu danh tính trong khi người chồng làm phóng viên ngày càng tiến gần sự thật."},{"question":"KhoPhim cập nhật tập mới của Sát Thủ Nội Trợ như thế nào?","answer":"Tập mới chỉ được hiển thị sau khi hệ thống xác nhận có nguồn phát hợp lệ. Số tập và trạng thái nguồn được cập nhật trên URL hiện tại, không tạo trang phim trùng lặp."}]'::jsonb,
  '[{"title":"Phim Hàn Quốc","url":"/phim-han-quoc","anchor":"phim Hàn Quốc","description":"Xem các phim Hàn Quốc có thông tin và tập mới trên KhoPhim."},{"title":"Phim hành động","url":"/the-loai/hanh-dong","anchor":"phim hành động","description":"Khám phá các phim hành động và truy đuổi tội phạm liên quan."},{"title":"Phim hình sự","url":"/the-loai/hinh-su","anchor":"phim hình sự","description":"Danh sách phim hình sự có điều tra, tội phạm và luật pháp."},{"title":"Phim tâm lý","url":"/the-loai/tam-ly","anchor":"phim tâm lý","description":"Các phim tập trung vào xung đột gia đình và lựa chọn của nhân vật."}]'::jsonb
),
(
  'phi-phong-quy-mau-rung-thieng',
  'phí phông quỷ máu rừng thiêng',
  array['Phi Phong The Blood Demon','phim Phí Phông','Phí Phông 2026','phim kinh dị Việt Nam','Kiều Minh Tuấn Phí Phông','quỷ máu rừng thiêng'],
  'Phí Phông: Quỷ Máu Rừng Thiêng (2026) | KhoPhim',
  'Phí Phông: Quỷ Máu Rừng Thiêng – nội dung, truyền thuyết dân gian, đạo diễn Đỗ Quốc Trung, dàn diễn viên và nguồn xem tại KhoPhim.',
  $intro_phi_phong$
Phí Phông: Quỷ Máu Rừng Thiêng (Phi Phong: The Blood Demon) là phim kinh dị Việt Nam năm 2026, lấy cảm hứng từ truyền thuyết dân gian về một thực thể khát máu có thể ẩn mình giữa con người. Câu chuyện theo chân Còn và Dương, hai pháp sư trẻ đi vào một bản làng miền núi để cứu người mẹ đang bị thương nặng. Khi nhiều cái chết bất thường xảy ra, sự nghi ngờ hướng về Mon và con gái Lua, nhưng hành trình truy tìm Phí Phông còn che giấu những bí mật khác của cộng đồng trong rừng sâu.

Hồ sơ của cơ quan phân loại phim Indonesia ghi nhận tác phẩm do Đỗ Quốc Trung đạo diễn, Mỹ Triệu biên kịch và có Kiều Minh Tuấn, Đoàn Minh Anh, Diệp Bảo Ngọc, Nina Nutthacha cùng Nghệ sĩ Ưu tú Hạnh Thúy tham gia. Trang KhoPhim này tổng hợp phần giới thiệu, trailer, ê-kíp và nguồn xem đã được hệ thống xác minh, đồng thời giữ một URL ổn định cho các lần cập nhật sau.
$intro_phi_phong$,
  $review_phi_phong$
Phí Phông: Quỷ Máu Rừng Thiêng đặt câu chuyện kinh dị trong không gian bản làng và rừng núi, nơi thông tin truyền miệng, nỗi sợ và sự nghi ngờ có thể tác động đến cách các nhân vật nhìn nhau. Tiền đề về thực thể Phí Phông tạo ra hai lớp nguy hiểm: mối đe dọa siêu nhiên vào ban đêm và khả năng kẻ bị nghi ngờ vẫn sinh hoạt như một người bình thường vào ban ngày. Vì vậy, câu hỏi của câu chuyện không chỉ là ai đang gây ra những cái chết, mà còn là liệu các nhân vật có thể nhận diện đúng mối nguy hay không.

Còn và Dương bước vào bản với mục tiêu cứu mẹ, nhưng nhanh chóng bị cuốn vào chuỗi sự kiện lớn hơn. Mon và Lua mang những dấu hiệu khiến dân làng liên hệ họ với Phí Phông, trong khi các bí mật cũ chưa được giải thích làm cho cuộc truy tìm trở nên phức tạp. Trang này chỉ trình bày tiền đề và dữ kiện đã được công bố, không tiết lộ kết quả điều tra hoặc dùng tin đồn để lấp phần nội dung chưa xác minh.

Đỗ Quốc Trung là đạo diễn của phim; Mỹ Triệu được ghi nhận ở vị trí biên kịch. Dàn diễn viên gồm Kiều Minh Tuấn, Đoàn Minh Anh, Diệp Bảo Ngọc, Nina Nutthacha và Nghệ sĩ Ưu tú Hạnh Thúy. Việc ghi rõ ê-kíp và tên quốc tế Phi Phong: The Blood Demon giúp người xem phân biệt tác phẩm với các phim kinh dị có tiêu đề gần giống, đồng thời tạo thêm ngữ cảnh tìm kiếm ngoài từ khóa thương hiệu KhoPhim.

Về chủ đề, bộ phim khai thác chất liệu kinh dị dân gian Việt Nam thay vì đặt toàn bộ mâu thuẫn trong một bối cảnh đô thị hiện đại. Người xem quan tâm đến truyền thuyết địa phương, nghi lễ và không khí rừng núi có thể dùng phần giới thiệu này để xác định đúng thể loại trước khi xem. Những nhận xét về mức độ hay, độ đáng sợ hoặc điểm số không được coi là dữ kiện và không được đưa vào FAQ.

KhoPhim hiện liên kết trang với các cụm phim Việt Nam, phim kinh dị, phim bí ẩn và phim chiếu rạp. Nguồn phát chỉ được giữ hoạt động khi hệ thống kiểm tra thấy tập hoặc bản phim có thể truy cập. Nếu nguồn thay đổi, canonical và URL phim vẫn được giữ nguyên để Google và người xem không phải chuyển sang một bản ghi trùng lặp.
$review_phi_phong$,
  '[{"question":"Phí Phông: Quỷ Máu Rừng Thiêng là phim nước nào?","answer":"Đây là phim kinh dị Việt Nam sản xuất năm 2026, có tên quốc tế Phi Phong: The Blood Demon và lấy cảm hứng từ truyền thuyết dân gian miền núi."},{"question":"Ai đạo diễn và tham gia phim Phí Phông?","answer":"Phim do Đỗ Quốc Trung đạo diễn. Dàn diễn viên được ghi nhận gồm Kiều Minh Tuấn, Đoàn Minh Anh, Diệp Bảo Ngọc, Nina Nutthacha và Nghệ sĩ Ưu tú Hạnh Thúy."},{"question":"Phí Phông: Quỷ Máu Rừng Thiêng kể về điều gì?","answer":"Còn và Dương vào một bản làng miền núi để cứu mẹ rồi vướng vào chuỗi cái chết bí ẩn. Nghi ngờ hướng về Mon và Lua trong khi danh tính thực sự của Phí Phông vẫn chưa rõ."},{"question":"Nguồn xem Phí Phông trên KhoPhim có được kiểm tra không?","answer":"Có. Nguồn phát chỉ được hiển thị khi hệ thống xác nhận có thể truy cập; trang phim và canonical vẫn được giữ nguyên nếu nguồn cần thay thế."}]'::jsonb,
  '[{"title":"Phim Việt Nam","url":"/phim-viet-nam","anchor":"phim Việt Nam","description":"Xem các phim Việt Nam đang có thông tin và nguồn phát trên KhoPhim."},{"title":"Phim kinh dị","url":"/the-loai/kinh-di","anchor":"phim kinh dị","description":"Khám phá các phim kinh dị và chuyện kể siêu nhiên liên quan."},{"title":"Phim bí ẩn","url":"/the-loai/bi-an","anchor":"phim bí ẩn","description":"Danh sách phim có điều tra, bí mật và danh tính chưa được hé lộ."},{"title":"Phim chiếu rạp","url":"/phim-chieu-rap","anchor":"phim chiếu rạp","description":"Các phim điện ảnh đang được quan tâm trên KhoPhim."}]'::jsonb
),
(
  'the-air-4-elements',
  'the air 4 elements gió thoảng tình theo',
  array['The Air 4 Elements','Gió Thoảng Tình Theo','The Air vietsub','phim Freen Becky','Sarocha Chankimha The Air','phim Thái Lan 2026'],
  'The Air 4 Elements: Gió Thoảng Tình Theo | KhoPhim',
  'The Air 4 Elements: Gió Thoảng Tình Theo – nội dung 8 tập, đạo diễn Kittisak Cheewasatjasakun, Freen và Becky tại KhoPhim.',
  $intro_the_air$
The Air 4 Elements: Gió Thoảng Tình Theo là phim truyền hình Thái Lan năm 2026 gồm 8 tập. Theo trang chương trình chính thức của iQIYI, câu chuyện bắt đầu khi Công chúa Blew trở thành mục tiêu truy sát trong một cuộc nổi loạn. Lom, một nữ cảnh sát, được giao bảo vệ cô và phải đưa công chúa rời khỏi vùng nguy hiểm. Hành trình trốn chạy có những cuộc truy đuổi, đấu súng và âm mưu, đồng thời đặt hai nhân vật vào một mối quan hệ bị cản trở bởi thân phận và trách nhiệm.

Phim do Kittisak Cheewasatjasakun đạo diễn, với Freen Sarocha Chankimha và Becky Rebecca Patricia Armstrong trong hai vai trung tâm. Dàn diễn viên được iQIYI công bố còn có Looknam Orntara Poonsak, Bird Wanchana Sawasdee, Kim Thitisarn Goodburn, Renita Veronica Pagano và Justin Angus Moir. KhoPhim dùng tên Việt chính thức cùng tên quốc tế trên một URL duy nhất, cập nhật đủ 8 tập theo nguồn phát đã xác minh.
$intro_the_air$,
  $review_the_air$
The Air 4 Elements kết hợp câu chuyện bảo vệ nhân vật hoàng gia với mối quan hệ giữa hai phụ nữ ở hai vị trí rất khác nhau. Blew phải trở về với trách nhiệm của một công chúa, còn Lom là cảnh sát có nhiệm vụ đặt an toàn của người được bảo vệ lên trước cảm xúc cá nhân. Mâu thuẫn vì thế không chỉ đến từ lực lượng truy đuổi mà còn đến từ giới hạn về quyền lực, bổn phận và khả năng lựa chọn cuộc sống riêng.

Phần giới thiệu chính thức của iQIYI xác định rõ cuộc chạy trốn là hành trình sinh tồn, có truy đuổi, tiếng súng và những lớp lừa dối. Tình cảm hình thành trong hoàn cảnh hai nhân vật phụ thuộc vào nhau để sống sót, nhưng càng gần nhau thì rủi ro mất mát càng lớn. Đây là tiền đề đã được nền tảng phát hành công bố; trang KhoPhim không thêm suy đoán về kết thúc hoặc biến tin đồn của người hâm mộ thành nội dung chính thức.

Freen Sarocha Chankimha và Becky Rebecca Patricia Armstrong đảm nhận hai vai trung tâm. Kittisak Cheewasatjasakun là đạo diễn được iQIYI ghi nhận. Dữ liệu cũ trên website từng hiển thị tổng một tập dù nguồn phát có đủ tám tập; con số này đã được sửa về 8 để khớp với danh sách tập chính thức và tồn kho phát thực tế. Canonical cũ vẫn được giữ nhằm bảo toàn lịch sử Google đã crawl.

Người tìm kiếm bằng các cụm “The Air 4 Elements”, “Gió Thoảng Tình Theo”, “The Air Vietsub” hoặc tên Freen và Becky đều được dẫn về cùng hồ sơ. Việc thống nhất tên giúp tránh nhiều trang mỏng cạnh tranh lẫn nhau. Các liên kết nội bộ đưa người xem tới cụm phim Thái Lan, tình cảm, hành động và chính kịch thay vì chèn những đường dẫn không liên quan chỉ để tăng số lượng liên kết.

KhoPhim không sử dụng điểm xếp hạng do nền tảng khác hiển thị làm nhận xét biên tập của mình. Hồ sơ tập trung vào nội dung, ê-kíp, số tập và tình trạng nguồn. Tập phim chỉ được hiển thị khi có nguồn hợp lệ; nếu một nguồn hỏng, hệ thống có thể thay nguồn mà không đổi URL chính của bộ phim.
$review_the_air$,
  '[{"question":"The Air 4 Elements: Gió Thoảng Tình Theo có bao nhiêu tập?","answer":"iQIYI công bố phim gồm 8 tập. KhoPhim đã đối chiếu danh sách nguồn phát và cập nhật tổng số tập về 8 trên cùng URL phim."},{"question":"Ai đóng chính The Air 4 Elements?","answer":"Hai vai trung tâm do Freen Sarocha Chankimha và Becky Rebecca Patricia Armstrong đảm nhận; phim do Kittisak Cheewasatjasakun đạo diễn."},{"question":"Gió Thoảng Tình Theo kể về điều gì?","answer":"Công chúa Blew bị truy sát giữa một cuộc nổi loạn và nữ cảnh sát Lom trở thành người bảo vệ cô. Cuộc chạy trốn đặt họ trước nguy hiểm, bổn phận và một mối quan hệ khó lựa chọn."},{"question":"The Air và Gió Thoảng Tình Theo có phải cùng một phim không?","answer":"Có. The Air 4 Elements là tên quốc tế, còn Gió Thoảng Tình Theo là tên tiếng Việt trên iQIYI. KhoPhim gom các tên này về một trang để tránh trùng lặp."}]'::jsonb,
  '[{"title":"Phim Thái Lan","url":"/phim-thai-lan","anchor":"phim Thái Lan","description":"Xem các phim Thái Lan đang có tập và thông tin trên KhoPhim."},{"title":"Phim tình cảm","url":"/the-loai/tinh-cam","anchor":"phim tình cảm","description":"Khám phá các phim tập trung vào quan hệ và lựa chọn của nhân vật."},{"title":"Phim hành động","url":"/the-loai/hanh-dong","anchor":"phim hành động","description":"Danh sách phim có truy đuổi, bảo vệ và xung đột hành động."},{"title":"Phim chính kịch","url":"/the-loai/chinh-kich","anchor":"phim chính kịch","description":"Các phim khai thác trách nhiệm, thân phận và mâu thuẫn xã hội."}]'::jsonb
),
(
  'silo-2023',
  'silo 2023',
  array['Silo series','Silo vietsub','Silo Apple TV','phim Silo Rebecca Ferguson','Silo Hugh Howey','phim khoa học viễn tưởng Silo'],
  'Silo (2023) – Nội Dung Và Các Tập Vietsub | KhoPhim',
  'Silo (2023) – nội dung xã hội sống dưới lòng đất, Rebecca Ferguson, Graham Yost, Morten Tyldum và các tập đang có trên KhoPhim.',
  $intro_silo$
Silo là loạt phim khoa học viễn tưởng ra mắt năm 2023, lấy bối cảnh một xã hội sống trong công trình khổng lồ nằm sâu dưới lòng đất. Khoảng mười nghìn người tuân theo hệ thống quy định mà họ tin là cần thiết để tránh thế giới bên ngoài độc hại. Khi những câu hỏi về lịch sử, môi trường và cách cộng đồng được quản lý xuất hiện, kỹ sư Juliette Nichols bắt đầu lần theo các dấu vết có thể làm thay đổi hiểu biết của mọi người về nơi họ đang sống.

Apple TV xác nhận Silo được phát triển từ bộ tiểu thuyết của Hugh Howey, do Graham Yost sáng tạo cho truyền hình. Rebecca Ferguson đóng vai Juliette và đồng thời tham gia sản xuất điều hành; dàn diễn viên có Common, Harriet Walter, David Oyelowo, Rashida Jones và Tim Robbins. Morten Tyldum đạo diễn ba tập mở đầu. Trang này giữ thông tin tổng quan, dàn diễn viên, tiến độ tập và nguồn xem đang có trên KhoPhim trong một URL canonical duy nhất.
$intro_silo$,
  $review_silo$
Silo bắt đầu từ một quy tắc đơn giản nhưng có ảnh hưởng tới toàn bộ cộng đồng: con người phải sống dưới lòng đất vì thế giới bên ngoài được cho là không thể sinh tồn. Hệ thống luật, ký ức tập thể và cấu trúc nhiều tầng của silo tạo nên bối cảnh cho các câu hỏi về quyền lực và sự thật. Khi một cá nhân muốn biết điều gì nằm ngoài lời giải thích chính thức, hành động đó có thể ảnh hưởng tới sự an toàn của cả cộng đồng và trật tự mà họ dựa vào.

Juliette Nichols là kỹ sư có kinh nghiệm xử lý các vấn đề thực tế ở khu vực máy móc. Góc nhìn của cô cho phép câu chuyện đi từ hoạt động kỹ thuật hằng ngày đến những bí mật lớn hơn về lịch sử silo. Apple TV mô tả loạt phim dựa trên bộ ba tiểu thuyết bán chạy của Hugh Howey; Graham Yost là người sáng tạo và điều hành nội dung, còn Morten Tyldum đạo diễn ba tập đầu của mùa mở màn.

Dàn diễn viên mùa đầu được Apple công bố gồm Rebecca Ferguson, Common, Harriet Walter, Chinaza Uche, Avi Nash, David Oyelowo, Rashida Jones và Tim Robbins. Việc bổ sung đúng người sáng tạo, đạo diễn và nguồn ảnh đầy đủ giúp hồ sơ này có thể được phân biệt với các tác phẩm điện ảnh khác cũng mang tên Silo. KhoPhim giữ năm 2023 trong title và từ khóa để giảm nhầm lẫn khi người dùng tìm đúng loạt phim Apple TV.

Trang hiện trình bày các tập mà hệ thống đã xác minh có nguồn phát, không coi tổng số tập của toàn bộ loạt phim là số tập chắc chắn đang xem được tại mọi thời điểm. Số tập hiển thị và tình trạng nguồn có thể thay đổi khi nhà cung cấp cập nhật. Canonical không đổi trong quá trình đó, giúp người xem quay lại đúng trang và tránh phân tán tín hiệu tìm kiếm sang nhiều URL.

Hồ sơ SEO này tập trung vào tiền đề, nguồn chuyển thể, ê-kíp, diễn viên và cách theo dõi tập. Nó không sao chép điểm số từ nền tảng khác và không khẳng định chất lượng bằng các cụm từ cảm tính. Người xem có thể dùng các liên kết tới phim Âu Mỹ, khoa học, viễn tưởng và chính kịch để tìm thêm tác phẩm cùng ngữ cảnh, thay vì nhận các đề xuất không liên quan.
$review_silo$,
  '[{"question":"Silo (2023) nói về điều gì?","answer":"Loạt phim theo chân cộng đồng khoảng mười nghìn người sống trong một silo dưới lòng đất vì tin rằng thế giới bên ngoài độc hại. Kỹ sư Juliette Nichols dần điều tra các bí mật về xã hội này."},{"question":"Silo được chuyển thể từ tác phẩm nào?","answer":"Apple TV xác nhận loạt phim dựa trên bộ tiểu thuyết Silo của Hugh Howey và được Graham Yost phát triển cho truyền hình."},{"question":"Ai đóng chính và đạo diễn Silo?","answer":"Rebecca Ferguson đảm nhận vai Juliette Nichols. Morten Tyldum đạo diễn ba tập mở đầu; dàn diễn viên còn có Common, Harriet Walter, David Oyelowo, Rashida Jones và Tim Robbins."},{"question":"Số tập Silo trên KhoPhim được tính như thế nào?","answer":"KhoPhim chỉ hiển thị tập khi hệ thống xác nhận có nguồn phát hợp lệ. Tổng số tập của loạt phim và số tập đang xem được được theo dõi riêng để tránh quảng cáo nhầm nguồn."}]'::jsonb,
  '[{"title":"Phim Âu Mỹ","url":"/phim-au-my","anchor":"phim Âu Mỹ","description":"Xem các phim và series Âu Mỹ có thông tin đầy đủ trên KhoPhim."},{"title":"Phim khoa học","url":"/the-loai/khoa-hoc","anchor":"phim khoa học","description":"Khám phá phim có bối cảnh công nghệ, xã hội và khoa học."},{"title":"Phim viễn tưởng","url":"/the-loai/vien-tuong","anchor":"phim viễn tưởng","description":"Danh sách phim xây dựng thế giới và tương lai giả định."},{"title":"Phim chính kịch","url":"/the-loai/chinh-kich","anchor":"phim chính kịch","description":"Các phim tập trung vào xã hội, nhân vật và lựa chọn đạo đức."}]'::jsonb
);

do $publish_editorial$
declare
  item record;
  movie_row public.movies%rowtype;
  payload jsonb;
  publish_result jsonb;
begin
  for item in select * from seo_editorial_payloads order by slug loop
    select * into movie_row
    from public.movies
    where slug = item.slug
    for update;
    if not found then raise exception 'SEO movie not found: %', item.slug; end if;
    if exists (select 1 from public.movie_seo_profiles where movie_id = movie_row.id) then
      raise exception 'SEO profile already exists: %', item.slug;
    end if;
    if exists (select 1 from public.movie_seo_profile_drafts where movie_id = movie_row.id) then
      raise exception 'SEO draft already exists: %', item.slug;
    end if;

    payload := jsonb_build_object(
      'movie_id', movie_row.id,
      'slug', movie_row.slug,
      'focus_keyword', item.focus_keyword,
      'secondary_keywords', to_jsonb(item.secondary_keywords),
      'seo_title', item.seo_title,
      'meta_description', item.meta_description,
      'canonical_path', '/phim/' || movie_row.slug,
      'og_image_url', movie_row.poster_url,
      'index_mode', 'index',
      'intro_content', item.intro_content,
      'review_content', item.review_content,
      'faq', item.faq,
      'topic_links', item.topic_links,
      'movie_patch', jsonb_build_object(
        'name', movie_row.name,
        'title_vi', movie_row.title_vi,
        'title_en', movie_row.title_en,
        'origin_name', movie_row.origin_name,
        'year', movie_row.year,
        'quality', movie_row.quality,
        'lang', movie_row.lang,
        'trailer_url', movie_row.trailer_url,
        'thumb_url', movie_row.thumb_url,
        'poster_url', movie_row.poster_url,
        'actor', to_jsonb(movie_row.actor),
        'director', to_jsonb(movie_row.director),
        'category', movie_row.category,
        'country', movie_row.country
      )
    );

    insert into public.movie_seo_profile_drafts (
      movie_id, payload, baseline_version, unlocked_fields,
      validation_score, validation_issues, updated_at
    ) values (
      movie_row.id,
      payload,
      0,
      array['movie_patch.name','movie_patch.title_vi','movie_patch.title_en','movie_patch.director','movie_patch.thumb_url','movie_patch.poster_url','intro_content','review_content','faq','topic_links','focus_keyword','secondary_keywords','seo_title','meta_description','og_image_url','index_mode']::text[],
      100,
      '[{"code":"ready","severity":"success","section":"technical","message":"Nội dung đã qua cổng biên tập và đối chiếu nguồn chính thức."}]'::jsonb,
      now()
    );

    publish_result := public.publish_movie_seo_profile(movie_row.id);
    if coalesce((publish_result->>'version')::integer, 0) <> 1 then
      raise exception 'Unexpected SEO publish result for %: %', item.slug, publish_result;
    end if;

    insert into public.seo_static_release_requests (
      movie_id, slug, reason, requested_version, status, requested_at
    )
    select movie_row.id, movie_row.slug, 'google_crawled_not_indexed_editorial_upgrade', 1, 'pending', now()
    where not exists (
      select 1 from public.seo_static_release_requests request
      where request.movie_id = movie_row.id and request.status in ('pending','processing')
    );
  end loop;
end;
$publish_editorial$;

commit;
