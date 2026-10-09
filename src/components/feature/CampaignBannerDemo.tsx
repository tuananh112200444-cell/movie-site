import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const DESKTOP_BANNER = '/banner-demo/assets/728x90.gif';
const MOBILE_BANNER = '/banner-demo/assets/320x50.gif';
const V2_BANNER = '/campaign-demo-2/728x90.gif';
const V3_TOP_DESKTOP = '/campaign-demo-shbet/top-desktop-1090x66.gif';
const V3_CATFISH_DESKTOP = '/campaign-demo-shbet/catfish-desktop-728x90.gif?v=20261009';
const V3_MOBILE = '/campaign-demo-shbet/mobile-300x80.gif';
const F8BET_TOP_BANNER = '/campaign-demo-f8bet/top-728x90.gif';
const MB66_BANNER = '/campaign-demo-mb66/mb66-728x90.gif';
const CAMPAIGN_URL = 'https://154.82.109.139/2138110.html';
const F8BET_TOP_URL = 'https://bit.ly/4cCE7SB';
const SHBET_CATFISH_URL = 'https://bit.ly/SH2PP21';
const MB66_URL = 'https://bit.ly/qtqctong2c184';
const TOP_BANNER_DISMISSED_KEY = 'kp_campaign_top_banner_dismissed_v1';
const CATFISH_BANNER_DISMISSED_KEY = 'kp_campaign_catfish_banner_dismissed_v1';

type CampaignStyle = 'current' | 'v2' | 'v3' | 'mix' | 'compact' | 'focus' | 'mb66';

type CampaignAsset = {
  name: '9922' | 'shbet' | 'f8bet' | 'mb66';
  desktop: string;
  mobile: string;
  href?: string;
  alt: string;
  width: number;
  height: number;
};

// Kept as a single switch so the campaign can be restored without touching
// layouts, rotation behavior, or the remaining paid placements.
const PAUSED_CAMPAIGN_NAMES = new Set<CampaignAsset['name']>(['9922']);

function isCampaignEnabled(campaign: CampaignAsset): boolean {
  return !PAUSED_CAMPAIGN_NAMES.has(campaign.name);
}

const ROTATION_INTERVAL_MS = 6000;

function isSessionFlagSet(storageKey: string): boolean {
  try {
    return window.sessionStorage.getItem(storageKey) === '1';
  } catch {
    // Some embedded/private browsers can block storage. Keep the banner usable
    // and fall back to in-memory state for the current mounted page.
    return false;
  }
}

function persistSessionFlag(storageKey: string) {
  try {
    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // Closing must still work even when browser storage is unavailable.
  }
}

function useCampaignStyle(): CampaignStyle {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mb66PreviewHost = typeof window !== 'undefined'
    && window.location.hostname === 'mb66-banner-demo.movie-site-eds.pages.dev';
  if (params.get('banner-current') === '1') return 'current';
  if (params.get('banner-mb66') === '1' || mb66PreviewHost) return 'mb66';
  if (params.get('banner-focus') === '1') return 'focus';
  if (params.get('banner-compact') === '1') return 'compact';
  if (params.get('banner-mix') === '1') return 'mix';
  if (params.get('banner-v3') === '1') return 'v3';
  if (params.get('banner-v2') === '1') return 'v2';
  return 'mb66';
}

function useRotatingIndex(enabled: boolean, initialIndex: 0 | 1) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (!enabled) return undefined;
    const interval = window.setInterval(() => setIndex((current) => (current === 0 ? 1 : 0)), ROTATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [enabled]);

  return index;
}

const topCampaigns: [CampaignAsset, CampaignAsset] = [
  { name: '9922', desktop: DESKTOP_BANNER, mobile: MOBILE_BANNER, href: CAMPAIGN_URL, alt: 'Banner quảng cáo 9922', width: 728, height: 90 },
  { name: 'shbet', desktop: V3_TOP_DESKTOP, mobile: V3_MOBILE, alt: 'Banner SHBET', width: 1090, height: 66 },
];

const catfishCampaigns: [CampaignAsset, CampaignAsset] = [
  { name: '9922', desktop: DESKTOP_BANNER, mobile: MOBILE_BANNER, href: CAMPAIGN_URL, alt: 'Banner quảng cáo 9922', width: 728, height: 90 },
  { name: 'shbet', desktop: V3_CATFISH_DESKTOP, mobile: V3_MOBILE, href: SHBET_CATFISH_URL, alt: 'Banner SHBET', width: 728, height: 90 },
];

// Every paired creative uses the same 728:90 ratio so split-screen and mobile swaps stay aligned.
const mixedTopCampaigns: [CampaignAsset, CampaignAsset] = [
  { name: '9922', desktop: DESKTOP_BANNER, mobile: DESKTOP_BANNER, href: CAMPAIGN_URL, alt: 'Banner quảng cáo 9922', width: 728, height: 90 },
  { name: 'f8bet', desktop: F8BET_TOP_BANNER, mobile: F8BET_TOP_BANNER, href: F8BET_TOP_URL, alt: 'Banner F8BET', width: 728, height: 90 },
];

const mixedCatfishCampaigns: [CampaignAsset, CampaignAsset] = [
  { name: '9922', desktop: DESKTOP_BANNER, mobile: DESKTOP_BANNER, href: CAMPAIGN_URL, alt: 'Banner quảng cáo 9922', width: 728, height: 90 },
  { name: 'shbet', desktop: V3_CATFISH_DESKTOP, mobile: V3_CATFISH_DESKTOP, href: SHBET_CATFISH_URL, alt: 'Banner SHBET', width: 728, height: 90 },
];

const mb66Campaign: CampaignAsset = {
  name: 'mb66',
  desktop: MB66_BANNER,
  mobile: MB66_BANNER,
  href: MB66_URL,
  alt: 'Banner MB66',
  width: 728,
  height: 90,
};

const mb66TopCampaigns: CampaignAsset[] = [...mixedTopCampaigns, mb66Campaign];
const mb66CatfishCampaigns: CampaignAsset[] = [...mixedCatfishCampaigns, mb66Campaign];

function CampaignCreative({ campaign, demo, desktopOnly = false }: { campaign: CampaignAsset; demo: boolean; desktopOnly?: boolean }) {
  if (!isCampaignEnabled(campaign)) return null;

  const disabled = !campaign.href;

  return (
    <a
      href={campaign.href}
      target={disabled ? undefined : '_blank'}
      rel={disabled ? undefined : 'noopener noreferrer nofollow sponsored'}
      aria-label={disabled ? `Banner ${campaign.name.toUpperCase()} bản demo` : `Mở trang quảng cáo ${campaign.name.toUpperCase()}`}
      aria-disabled={disabled || undefined}
      onClick={disabled ? (event) => event.preventDefault() : undefined}
      data-campaign-creative={campaign.name}
      className="campaign-banner-creative block transition-transform active:scale-[0.995]"
    >
      <picture>
        {!desktopOnly && <source media="(max-width: 767px)" srcSet={campaign.mobile} />}
        <img
          src={campaign.desktop}
          alt={campaign.alt}
          width={campaign.width}
          height={campaign.height}
          className={demo ? 'campaign-banner-v2__image' : 'block h-auto w-full object-contain'}
          decoding="async"
          fetchPriority="low"
        />
      </picture>
    </a>
  );
}

export function CampaignTopBanner() {
  const [visible, setVisible] = useState(() => !isSessionFlagSet(TOP_BANNER_DISMISSED_KEY));
  const style = useCampaignStyle();
  const demo = style !== 'current';
  const v3Demo = style === 'v3';
  const mixedDemo = style === 'mix';
  const compactDemo = style === 'compact';
  const focusDemo = style === 'focus';
  const mb66Demo = style === 'mb66';
  const multiCampaignDemo = mixedDemo || mb66Demo;
  const visibleTopCampaigns = (mb66Demo ? mb66TopCampaigns : mixedTopCampaigns).filter(isCampaignEnabled);
  const rotatingIndex = useRotatingIndex(mixedDemo || focusDemo, 0);
  const campaign: CampaignAsset = mb66Demo
    ? mb66Campaign
    : mixedDemo || focusDemo
    ? mixedTopCampaigns[rotatingIndex]
    : v3Demo
      ? topCampaigns[1]
      : { ...topCampaigns[0], desktop: style === 'v2' ? V2_BANNER : DESKTOP_BANNER, mobile: style === 'v2' ? V2_BANNER : MOBILE_BANNER };

  if (!visible || compactDemo || !isCampaignEnabled(campaign)) return null;

  return (
    <div
      data-testid="campaign-top-banner"
      data-campaign-style={style}
      data-campaign-name={mb66Demo ? 'mb66-additive' : campaign.name}
      data-mobile-state={multiCampaignDemo ? 'expanded' : undefined}
      className={demo
        ? `campaign-banner-v2 campaign-banner-v2--top${v3Demo ? ' campaign-banner-v3 campaign-banner-v3--top' : ''}${multiCampaignDemo ? ' campaign-banner-mix campaign-banner-mix--top' : ''}${focusDemo ? ' campaign-banner-focus campaign-banner-focus--top' : ''}${mb66Demo ? ' campaign-banner-mb66' : ''}`
        : 'relative flex min-h-[66px] w-full items-center justify-center border-y border-white/[0.06] bg-[#090b11] px-2 py-2 md:min-h-[106px] md:px-14'}
    >
      <div className={demo ? 'campaign-banner-v2__shell' : 'relative w-[min(320px,100%)] md:w-full md:max-w-[728px]'}>
        <div className={demo ? 'campaign-banner-v2__media' : 'relative overflow-hidden rounded-md border border-amber-200/25 bg-black shadow-[0_12px_42px_rgba(0,0,0,0.5)] md:rounded-lg'}>
          {multiCampaignDemo ? (
            <>
              <div className="campaign-banner-mix__desktop" data-testid="campaign-top-desktop-split">
                {visibleTopCampaigns.map((item) => <CampaignCreative key={item.name} campaign={item} demo desktopOnly />)}
              </div>
              <div className="campaign-banner-mix__mobile">
                <div className="campaign-banner-mix__mobile-stack">
                  {visibleTopCampaigns.map((item) => <CampaignCreative key={item.name} campaign={item} demo />)}
                </div>
              </div>
            </>
          ) : (
            <CampaignCreative campaign={campaign} demo={demo} />
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            persistSessionFlag(TOP_BANNER_DISMISSED_KEY);
            setVisible(false);
          }}
          aria-label="Đóng banner đầu trang"
          title="Đóng banner"
          className={demo
            ? `campaign-banner-v2__close campaign-banner-v2__close--top${multiCampaignDemo ? ' campaign-banner-mix__close' : ''}`
            : 'absolute -right-2 -top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/90 text-white/80 shadow-lg transition-colors hover:bg-black hover:text-white md:-right-4 md:-top-3'}
        >
          <i className="ri-close-line text-sm" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function CampaignCatfishBanner() {
  const [visible, setVisible] = useState(() => !isSessionFlagSet(CATFISH_BANNER_DISMISSED_KEY));
  const style = useCampaignStyle();
  const demo = style !== 'current';
  const v3Demo = style === 'v3';
  const mixedDemo = style === 'mix';
  const compactDemo = style === 'compact';
  const focusDemo = style === 'focus';
  const mb66Demo = style === 'mb66';
  const multiCampaignDemo = mixedDemo || mb66Demo;
  const visibleCatfishCampaigns = (mb66Demo ? mb66CatfishCampaigns : mixedCatfishCampaigns).filter(isCampaignEnabled);
  const rotatingIndex = useRotatingIndex(mixedDemo || compactDemo || focusDemo, 1);
  const campaign: CampaignAsset = mb66Demo
    ? mb66Campaign
    : compactDemo
    ? mixedCatfishCampaigns[rotatingIndex]
    : mixedDemo || focusDemo
    ? mixedCatfishCampaigns[rotatingIndex]
    : v3Demo
      ? catfishCampaigns[1]
      : { ...catfishCampaigns[0], desktop: style === 'v2' ? V2_BANNER : DESKTOP_BANNER, mobile: style === 'v2' ? V2_BANNER : MOBILE_BANNER };

  if (!visible || !isCampaignEnabled(campaign)) return null;

  return (
    <aside
      data-testid="campaign-catfish"
      data-campaign-style={style}
      data-campaign-name={mb66Demo ? 'mb66-additive' : campaign.name}
      data-mobile-state={multiCampaignDemo ? 'expanded' : undefined}
      aria-label="Banner catfish"
      className={demo
        ? `campaign-banner-v2 campaign-banner-v2--catfish${v3Demo ? ' campaign-banner-v3 campaign-banner-v3--catfish' : ''}${multiCampaignDemo ? ' campaign-banner-mix campaign-banner-mix--catfish' : ''}${compactDemo ? ' campaign-banner-compact campaign-banner-compact--catfish' : ''}${focusDemo ? ' campaign-banner-focus campaign-banner-focus--catfish' : ''}${mb66Demo ? ' campaign-banner-mb66' : ''}`
        : 'fixed left-1/2 z-[80] w-[min(320px,calc(100vw-16px))] -translate-x-1/2 [bottom:max(8px,env(safe-area-inset-bottom))] md:w-[min(728px,calc(100vw-40px))] md:[bottom:max(12px,env(safe-area-inset-bottom))]'}
    >
        <div className={demo ? 'campaign-banner-v2__media' : 'relative overflow-hidden rounded-lg border border-amber-200/25 bg-black shadow-[0_12px_42px_rgba(0,0,0,0.62)]'}>
          {multiCampaignDemo ? (
            <>
              <div className="campaign-banner-mix__desktop" data-testid="campaign-catfish-desktop-split">
                {visibleCatfishCampaigns.map((item) => <CampaignCreative key={item.name} campaign={item} demo desktopOnly />)}
              </div>
              <div className="campaign-banner-mix__mobile">
                <div className="campaign-banner-mix__mobile-stack">
                  {visibleCatfishCampaigns.map((item) => <CampaignCreative key={item.name} campaign={item} demo />)}
                </div>
              </div>
            </>
          ) : (
            <CampaignCreative campaign={campaign} demo={demo} />
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            persistSessionFlag(CATFISH_BANNER_DISMISSED_KEY);
            setVisible(false);
          }}
          aria-label="Đóng banner catfish"
          title="Đóng banner"
          className={demo
            ? `campaign-banner-v2__close campaign-banner-v2__close--catfish${multiCampaignDemo ? ' campaign-banner-mix__close' : ''}`
            : 'absolute -right-2 -top-5 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-[#080a0f]/95 text-white/80 shadow-lg transition-colors hover:bg-black hover:text-white'}
        >
          <i className="ri-close-line text-sm" aria-hidden="true" />
        </button>
    </aside>
  );
}

export function CampaignUnderVideoBanner() {
  const style = useCampaignStyle();
  if (style !== 'mb66') return null;

  return (
    <aside
      data-testid="campaign-under-video-banner"
      data-campaign-style="mb66"
      aria-label="Banner MB66 dưới video"
      className="campaign-banner-under-video"
    >
      <CampaignCreative campaign={mb66Campaign} demo />
    </aside>
  );
}
