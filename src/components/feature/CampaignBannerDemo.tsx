import { useState } from 'react';

const DESKTOP_BANNER = '/banner-demo/assets/728x90.gif';
const MOBILE_BANNER = '/banner-demo/assets/320x50.gif';
const CAMPAIGN_URL = 'https://154.82.109.139/2138110.html';

export function CampaignTopBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div
      data-testid="campaign-top-banner"
      className="relative flex min-h-[66px] w-full items-center justify-center border-y border-white/[0.06] bg-[#090b11] px-2 py-2 md:min-h-[106px] md:px-14"
    >
      <div className="relative w-[min(320px,100%)] md:w-full md:max-w-[728px]">
        <div className="relative overflow-hidden rounded-md border border-amber-200/25 bg-black shadow-[0_12px_42px_rgba(0,0,0,0.5)] md:rounded-lg">
          <a
            href={CAMPAIGN_URL}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            aria-label="Mở trang quảng cáo 9922"
            className="block transition-transform active:scale-[0.995]"
          >
            <picture>
              <source media="(max-width: 767px)" srcSet={MOBILE_BANNER} />
              <img
                src={DESKTOP_BANNER}
                alt="Banner quảng cáo 9922"
                width={728}
                height={90}
                className="block h-auto w-full object-contain"
                decoding="async"
                fetchPriority="low"
              />
            </picture>
          </a>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Đóng banner đầu trang"
          title="Đóng banner"
          className="absolute -right-2 -top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/90 text-white/80 shadow-lg transition-colors hover:bg-black hover:text-white md:-right-4 md:-top-3"
        >
          <i className="ri-close-line text-sm" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function CampaignCatfishBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <aside
      data-testid="campaign-catfish"
      aria-label="Banner catfish"
      className="fixed left-1/2 z-[80] w-[min(320px,calc(100vw-16px))] -translate-x-1/2 [bottom:max(8px,env(safe-area-inset-bottom))] md:w-[min(728px,calc(100vw-40px))] md:[bottom:max(12px,env(safe-area-inset-bottom))]"
    >
        <div className="relative overflow-hidden rounded-lg border border-amber-200/25 bg-black shadow-[0_12px_42px_rgba(0,0,0,0.62)]">
          <a
            href={CAMPAIGN_URL}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            aria-label="Mở trang quảng cáo 9922"
            className="block transition-transform active:scale-[0.995]"
          >
            <picture>
              <source media="(max-width: 767px)" srcSet={MOBILE_BANNER} />
              <img
                src={DESKTOP_BANNER}
                alt="Banner quảng cáo 9922"
                width={728}
                height={90}
                className="block h-auto w-full object-contain"
                decoding="async"
                fetchPriority="low"
              />
            </picture>
          </a>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Đóng banner catfish"
          title="Đóng banner"
          className="absolute -right-2 -top-5 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-[#080a0f]/95 text-white/80 shadow-lg transition-colors hover:bg-black hover:text-white"
        >
          <i className="ri-close-line text-sm" aria-hidden="true" />
        </button>
    </aside>
  );
}
