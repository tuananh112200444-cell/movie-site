import { Link } from 'react-router-dom';

export default function SupportBannerDemo() {
  return (
    <section className="support-banner-demo" aria-labelledby="support-banner-title">
      <div className="support-banner-demo__glow" aria-hidden="true" />

      <picture className="support-banner-demo__portrait support-banner-demo__portrait--bust" aria-hidden="true">
        <source media="(max-width: 639px)" srcSet="/images/support-hostess-v3-460.webp" />
        <img
          src="/images/support-hostess-v3-760.webp"
          alt=""
          width="760"
          height="948"
          loading="lazy"
          decoding="async"
        />
      </picture>

      <div className="support-banner-demo__content">
        <p className="support-banner-demo__eyebrow">
          <span aria-hidden="true" />
          <span className="support-banner-demo__desktop-copy">Cùng KhoPhim đi xa hơn</span>
          <span className="support-banner-demo__mobile-copy">Cùng KhoPhim</span>
        </p>
        <h2 id="support-banner-title">
          <span className="support-banner-demo__desktop-copy">Một chút yêu thương, thêm ngàn bộ phim hay.</span>
          <span className="support-banner-demo__mobile-copy">KhoPhim hay,<br />nhờ có bạn.</span>
        </h2>
        <p>
          <span className="support-banner-demo__desktop-copy">
            Sự ủng hộ của bạn giúp KhoPhim duy trì máy chủ, kiểm tra nguồn phát và cập nhật phim mới mỗi ngày.
          </span>
          <span className="support-banner-demo__mobile-copy">
            Ủng hộ để phim mới luôn được cập nhật.
          </span>
        </p>

        <div className="support-banner-demo__actions">
          <Link to="/tai-khoan" className="support-banner-demo__action support-banner-demo__action--primary">
            <i className="ri-login-box-line" aria-hidden="true" />
            Đăng nhập
          </Link>
          <Link to="/tai-khoan?mode=signup" className="support-banner-demo__action support-banner-demo__action--secondary">
            <i className="ri-user-add-line" aria-hidden="true" />
            Đăng ký
          </Link>
        </div>
      </div>
    </section>
  );
}
