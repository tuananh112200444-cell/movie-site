const AD_FRAME_SRC = 'https://movie-site-eds.pages.dev/_ads/banner-300x250.html';

export default function AdsterraRectangleBanner() {
  return (
    <aside className="adsterra-rectangle-banner" aria-label="Quảng cáo 300 x 250" data-ad-size="300x250">
      <span className="adsterra-rectangle-banner__label">Quảng cáo</span>
      <iframe
        title="Quảng cáo 300 x 250"
        src={AD_FRAME_SRC}
        width="300"
        height="250"
        loading="lazy"
        scrolling="no"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </aside>
  );
}
