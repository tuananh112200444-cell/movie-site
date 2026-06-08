# Kho Phim - Website Xem Phim Online

## 1. Mô tả dự án
Kho Phim là trang web xem phim trực tuyến miễn phí, giao diện tối chuyên nghiệp tương tự gophim.net, tự động lấy dữ liệu phim từ API của ophim1.com. Hướng đến người dùng Việt Nam muốn tìm kiếm và xem phim online.

## 2. Cấu trúc trang
- `/` - Trang chủ (Hero banner, phim mới, Top 10, phân loại, Top Cinema, Hot 2026)
- `/search` - Tìm kiếm phim
- `/filter` - Lọc phim nâng cao
- `/phim/:slug` - Chi tiết phim + xem phim

## 3. Tính năng cốt lõi
- [x] Lấy dữ liệu phim từ ophim1.com API
- [x] Banner phim nổi bật tự động chuyển
- [x] Danh sách phim mới cập nhật
- [x] Tìm kiếm phim theo tên
- [x] Lọc phim theo thể loại, quốc gia, năm
- [x] Trang chi tiết phim + nhúng player xem phim
- [x] Multi-source phim: OPhim (3 mirror) + KKPhim (3 mirror) + NguonC (1 mirror) = 7 URL tổng cộng
- [x] Auto-pick best server dựa trên chất lượng, bitrate, resolution
- [x] HLS player adaptive bitrate, quality picker, speed control, keyboard shortcuts
- [x] Custom cat cursor với portal fullscreen support
- [x] Auto-update khi reload trang
- [x] Responsive, hiển thị đẹp trên desktop
- [x] Bảo mật RLS — public chỉ đọc được review, không thể INSERT/UPDATE/DELETE
- [x] Edge Functions bảo vệ write operations (save/delete review, read ping logs)

## 6. Bảo mật 3 tầng (Security Hardening)
- [x] **Tầng 1 – Admin PIN Gate**: Tất cả trang admin (/admin/*) được bọc trong `AdminGuard` component. Người dùng phải nhập mã PIN (11220044) để mở khóa, token hết hạn sau 1 giờ, lưu sessionStorage.
- [x] **Tầng 2 – Admin Token Verification**: Các Edge Function nhạy cảm (admin-review-save, admin-review-delete, admin-ping-logs, check-google-credentials, auto-ping-new-movies, ping-static-pages) đều verify Bearer token từ header `Authorization`. Không có token = 401 Unauthorized.
- [x] **Tầng 3 – Rate Limiting**: Mỗi Edge Function có giới hạn request theo IP (phút). Ví dụ: save/delete review 30 req/min, ping logs 60 req/min, auto-ping 10 req/min. Lưu vào bảng `rate_limit_logs` trong Supabase.
- [x] **Tầng 4 – Frontend proxy**: `adminFetch` service tự động gắn admin token vào mọi request từ trang admin. `reviewService` đã chuyển sang dùng `adminFetch`.
- [x] **Supabase Anon Key**: Không thể che giấu hoàn toàn vì frontend cần đọc public data (reviews, logs). RLS đã bật, public chỉ đọc được. Service Role Key chỉ nằm trong Edge Functions.

## 4. Tích hợp API
- API: https://ophim1.com (public, hỗ trợ CORS)
- Image CDN: https://img.ophim.live/uploads/movies/
- Không cần Supabase/Shopify/Stripe

## 5. Kế hoạch phát triển

- **Phase 0: Multi-source Integration** ✅ Đã tăng lên 7 URL mirror (OPhim 3 + KKPhim 3 + NguonC 1), loại bỏ Phim1280.tv do site đã tắt hoàn toàn. Auto-pick server dựa trên chất lượng, bitrate, resolution. HLS player tự động retry + hạ chất lượng khi stream lỗi, hỗ trợ Picture-in-Picture.
### Phase 1: Core UI + API Integration
- Mục tiêu: Xây dựng toàn bộ giao diện và kết nối API thực
- Deliverable: Trang chủ hiển thị phim thật từ API, search, filter, detail