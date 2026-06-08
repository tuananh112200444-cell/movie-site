import { useState, useEffect, useCallback } from 'react';

const BANNER_LINK = 'https://www.gg8859.com/?id=558305512';
const BANNER_IMAGE = 'https://static.readdy.ai/image/85988c9764f3464943f9546f02dafd4c/bd454d9c5f6b0d2760bc0605d1192e06.jpeg';
const COOLDOWN_HOURS = 8;
const STORAGE_KEY = 'center_banner_closed_at';

export default function CenterBanner() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const closedAt = localStorage.getItem(STORAGE_KEY);
    if (closedAt) {
      const hoursPassed = (Date.now() - parseInt(closedAt, 10)) / (1000 * 60 * 60);
      if (hoursPassed < COOLDOWN_HOURS) return;
    }
    setVisible(true);
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const closeBanner = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setMounted(false);
    setTimeout(() => setVisible(false), 250);
  }, []);

  const handleBannerClick = useCallback(() => {
    closeBanner();
    window.open(BANNER_LINK, '_blank', 'noopener,noreferrer');
  }, [closeBanner]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-250 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
    >
      <div
        className={`relative w-full max-w-xs sm:max-w-sm md:max-w-md transition-all duration-300 ${mounted ? 'scale-100 translate-y-0' : 'scale-95 translate-y-3'}`}
      >
        {/* Nút tắt cực nhỏ */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            closeBanner();
          }}
          className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-white text-black text-[10px] leading-none hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer shadow-md"
          aria-label="Đóng"
        >
          <i className="ri-close-line" style={{ fontSize: 12 }} />
        </button>

        {/* Banner body — click anywhere to open link */}
        <div
          onClick={handleBannerClick}
          className="cursor-pointer rounded-xl overflow-hidden shadow-2xl hover:brightness-110 active:scale-[0.98] transition-all duration-150"
        >
          <img
            src={BANNER_IMAGE}
            alt="Banner quảng cáo"
            className="w-full h-auto object-contain rounded-xl"
            loading="eager"
            style={{ maxHeight: '70vh' }}
          />
        </div>
      </div>
    </div>
  );
}