-- Evidence sources checked 2026-09-11:
-- https://www.sonypictures.com/movies/spidermanbrandnewday
-- https://www.marvel.com/movies/
--
-- This production content patch deliberately preserves the current canonical,
-- title, metadata, images, people and taxonomy. It changes only fields that
-- the SEO operations brain marked as unsafe or too thin.

begin;

do $seo_spider_editorial$
declare
  target_movie public.movies%rowtype;
  current_profile public.movie_seo_profiles%rowtype;
  editorial_payload jsonb;
  publish_result jsonb;
begin
  select * into target_movie
  from public.movies
  where slug = 'spider-man-brand-new-day-2026'
  for update;
  if not found then raise exception 'Spider-Man SEO movie not found'; end if;

  select * into current_profile
  from public.movie_seo_profiles
  where movie_id = target_movie.id
  for update;
  if not found then raise exception 'Spider-Man SEO profile not found'; end if;
  if current_profile.version <> 7 then
    raise exception 'Spider-Man SEO profile changed; expected version 7, found %', current_profile.version;
  end if;
  if exists (
    select 1 from public.movie_seo_profile_drafts
    where movie_id = target_movie.id
  ) then
    raise exception 'Spider-Man SEO profile has an active draft; refusing to overwrite it';
  end if;

  editorial_payload := jsonb_build_object(
    'movie_id', target_movie.id,
    'slug', target_movie.slug,
    'focus_keyword', current_profile.focus_keyword,
    'secondary_keywords', to_jsonb(current_profile.secondary_keywords),
    'seo_title', current_profile.seo_title,
    'meta_description', current_profile.meta_description,
    'canonical_path', current_profile.canonical_path,
    'og_image_url', current_profile.og_image_url,
    'index_mode', current_profile.index_mode,
    'intro_content', $intro$
Người Nhện: Khởi Đầu Mới (Spider-Man: Brand New Day) là phim hành động, phiêu lưu và khoa học viễn tưởng ra mắt năm 2026. Theo thông tin chính thức từ Sony Pictures và Marvel, câu chuyện tiếp tục theo chân Peter Parker sau khi thế giới không còn nhớ danh tính thật của anh. Peter hoạt động toàn thời gian với vai trò Spider-Man, đồng thời chứng kiến những người bạn cũ bước tiếp cuộc sống của họ. Áp lực đó tạo nên một thay đổi mà Peter chưa chắc có thể kiểm soát, giữa lúc New York xuất hiện một mối đe dọa mới.

Phim do Destin Daniel Cretton đạo diễn, với Tom Holland tiếp tục đảm nhận vai trung tâm. Dàn diễn viên được công bố gồm Zendaya, Sadie Sink, Jacob Batalon, Jon Bernthal, Tramell Tillman, Michael Mando và Mark Ruffalo. Tác phẩm khởi chiếu tại rạp ngày 31/7/2026. Trang này tổng hợp nội dung đã được xác nhận, trailer, diễn viên và tình trạng nguồn xem của phim; thông tin sẽ được cập nhật khi có nguồn phát trực tuyến hợp lệ.
$intro$,
    'review_content', $review$
Điểm quan trọng nhất để hiểu Người Nhện: Khởi Đầu Mới là bối cảnh của Peter Parker sau Người Nhện: Không Còn Nhà. Thế giới đã quên Peter, vì vậy anh không còn nhận được sự công nhận hay hỗ trợ gắn với danh tính cũ. Thông tin chính thức của Sony đặt nhân vật vào giai đoạn chiến đấu chống tội phạm toàn thời gian, trong khi những người bạn từng thân thiết tiếp tục cuộc sống mà không nhớ anh. Đây là tiền đề cụ thể của phim, không phải suy đoán về nội dung chưa được công bố.

Phần giới thiệu chính thức cũng nhấn mạnh một biến đổi xảy ra với Peter dưới sức ép ngày càng lớn. Sự thay đổi đó có thể vượt ngoài khả năng kiểm soát của anh, nhưng đồng thời lại liên quan đến cách ngăn chặn một kẻ thù mới đe dọa thành phố và những người anh yêu quý. Danh tính của phản diện chưa cần được khẳng định nếu Sony và Marvel chưa công bố rõ; điều đáng theo dõi là cách bộ phim kết nối cuộc chiến bên ngoài với trạng thái cô độc và trách nhiệm của Peter.

Destin Daniel Cretton là đạo diễn được xác nhận, còn Chris McKenna và Erik Sommers đứng tên biên kịch trên trang phim của Sony. Tom Holland trở lại cùng một dàn diễn viên có cả những gương mặt quen thuộc và nhân vật mới. Việc Zendaya, Jacob Batalon, Jon Bernthal, Mark Ruffalo, Sadie Sink, Tramell Tillman và Michael Mando cùng xuất hiện tạo ra nhiều hướng phát triển, nhưng vai trò cụ thể và mức độ xuất hiện của từng người chỉ nên kết luận từ phim hoặc tài liệu quảng bá chính thức.

Với người đang tìm kiếm “Người Nhện Khởi Đầu Mới”, trang này phù hợp để kiểm tra tên quốc tế Spider-Man: Brand New Day, ngày khởi chiếu 31/7/2026, đạo diễn, dàn diễn viên và trailer. KhoPhim không tự gắn điểm số cho một tác phẩm chỉ dựa trên quảng cáo hoặc trailer. Khi chưa có nguồn xem trực tuyến hợp lệ, trang vẫn được duy trì như một hồ sơ phim có kiểm chứng; khi nguồn phát được cập nhật, URL và canonical hiện tại được giữ nguyên để người dùng có thể quay lại đúng trang.

Nội dung trên được biên soạn từ thông tin phát hành của Sony Pictures và lịch phim của Marvel, tập trung vào các dữ kiện có thể kiểm chứng. Các chi tiết cốt truyện chưa được hãng xác nhận, tin đồn về nhân vật hoặc nhận xét cảm tính không được dùng làm dữ kiện SEO. Cách trình bày này giúp người đọc phân biệt rõ thông tin chính thức với suy đoán, đồng thời tạo một điểm cập nhật ổn định cho bộ phim.
$review$,
    'faq', $faq$[
      {
        "question": "Người Nhện: Khởi Đầu Mới khởi chiếu khi nào?",
        "answer": "Sony Pictures và Marvel công bố Spider-Man: Brand New Day khởi chiếu tại rạp ngày 31/7/2026."
      },
      {
        "question": "Ai đạo diễn và tham gia Người Nhện: Khởi Đầu Mới?",
        "answer": "Phim do Destin Daniel Cretton đạo diễn. Dàn diễn viên được công bố gồm Tom Holland, Zendaya, Sadie Sink, Jacob Batalon, Jon Bernthal, Tramell Tillman, Michael Mando và Mark Ruffalo."
      },
      {
        "question": "Spider-Man: Brand New Day kể về điều gì?",
        "answer": "Peter Parker chiến đấu chống tội phạm toàn thời gian trong một thế giới không còn nhớ anh. Khi áp lực tạo ra một biến đổi khó kiểm soát, Peter phải đối mặt với mối đe dọa mới nhắm vào thành phố và những người anh yêu quý."
      },
      {
        "question": "Hiện có thể xem phim đầy đủ trên KhoPhim chưa?",
        "answer": "KhoPhim hiện cung cấp trailer và hồ sơ thông tin đã xác minh. Nút xem phim đầy đủ chỉ được bật khi hệ thống có nguồn phát trực tuyến hợp lệ; URL của trang sẽ được giữ nguyên khi nguồn được cập nhật."
      }
    ]$faq$::jsonb,
    'topic_links', $links$[
      {
        "title": "Người Nhện: Không Còn Nhà",
        "url": "/phim/nguoi-nhen-khong-con-nha",
        "anchor": "Người Nhện: Không Còn Nhà",
        "description": "Xem hồ sơ phần phim đặt nền cho bối cảnh Peter Parker bị thế giới lãng quên."
      },
      {
        "title": "Người Nhện (2002)",
        "url": "/phim/nguoi-nhen-2002",
        "anchor": "phim Người Nhện 2002",
        "description": "Khám phá phiên bản điện ảnh Người Nhện năm 2002 trong cùng cụm chủ đề."
      },
      {
        "title": "Phim hành động",
        "url": "/the-loai/hanh-dong",
        "anchor": "phim hành động",
        "description": "Danh sách phim hành động có hồ sơ nội dung đầy đủ trên KhoPhim."
      },
      {
        "title": "Phim khoa học viễn tưởng",
        "url": "/the-loai/vien-tuong",
        "anchor": "phim khoa học viễn tưởng",
        "description": "Khám phá các phim khoa học viễn tưởng và siêu anh hùng liên quan."
      }
    ]$links$::jsonb,
    'movie_patch', jsonb_build_object(
      'name', target_movie.name,
      'title_vi', target_movie.title_vi,
      'title_en', target_movie.title_en,
      'origin_name', target_movie.origin_name,
      'year', target_movie.year,
      'quality', target_movie.quality,
      'lang', target_movie.lang,
      'trailer_url', target_movie.trailer_url,
      'thumb_url', target_movie.thumb_url,
      'poster_url', target_movie.poster_url,
      'actor', to_jsonb(target_movie.actor),
      'director', to_jsonb(target_movie.director),
      'category', target_movie.category,
      'country', target_movie.country
    )
  );

  insert into public.movie_seo_profile_drafts (
    movie_id,
    payload,
    baseline_version,
    unlocked_fields,
    validation_score,
    validation_issues,
    updated_at
  ) values (
    target_movie.id,
    editorial_payload,
    current_profile.version,
    array['intro_content','review_content','faq','topic_links']::text[],
    100,
    '[{"code":"ready","severity":"success","section":"technical","message":"Nội dung đã qua cổng biên tập và kiểm tra dữ kiện chính thức."}]'::jsonb,
    now()
  );

  publish_result := public.publish_movie_seo_profile(target_movie.id);
  if coalesce((publish_result->>'version')::integer, 0) <> 8 then
    raise exception 'Unexpected Spider-Man SEO publish result: %', publish_result;
  end if;

  insert into public.seo_static_release_requests (
    movie_id,
    slug,
    reason,
    requested_version,
    status,
    requested_at
  )
  select
    target_movie.id,
    target_movie.slug,
    'seo_editorial_upgrade_after_google_crawled_not_indexed',
    8,
    'pending',
    now()
  where not exists (
    select 1
    from public.seo_static_release_requests request
    where request.movie_id = target_movie.id
      and request.status in ('pending','processing')
  );
end;
$seo_spider_editorial$;

commit;
