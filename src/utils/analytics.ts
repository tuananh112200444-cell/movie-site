/**
 * Google Analytics 4 tracking utilities for KhoPhim
 * Provides type-safe event tracking and page view logging
 */

// GA4 Measurement ID — sẽ được thay bằng ID thực tế của bạn
const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';

// Kiểm tra GA đã load chưa
function isGALoaded(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.gtag === 'function' &&
    typeof window.dataLayer !== 'undefined';
}

/**
 * Track một page view trong SPA
 * Gọi khi route thay đổi
 */
export function trackPageView(
  pagePath: string,
  pageTitle?: string,
  pageType?: string
): void {
  if (!isGALoaded()) return;

  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_title: pageTitle || document.title,
    page_location: window.location.href,
    send_to: GA_MEASUREMENT_ID,
    ...(pageType && { page_type: pageType }),
  });
}

/**
 * Track custom event
 */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (!isGALoaded()) return;

  window.gtag('event', eventName, {
    send_to: GA_MEASUREMENT_ID,
    ...params,
  });
}

/**
 * Track khi user click vào một movie card
 */
export function trackMovieClick(
  movieSlug: string,
  movieName: string,
  source: 'home' | 'search' | 'category' | 'related' | 'favorites' | 'actor' | 'seo-landing'
): void {
  trackEvent('movie_click', {
    movie_slug: movieSlug,
    movie_name: movieName,
    click_source: source,
  });
}

/**
 * Track khi user bắt đầu xem phim
 */
export function trackMoviePlay(
  movieSlug: string,
  movieName: string,
  episode?: number,
  server?: string
): void {
  trackEvent('movie_play', {
    movie_slug: movieSlug,
    movie_name: movieName,
    episode: episode ?? 1,
    server: server || 'default',
  });
}

/**
 * Track search query
 */
export function trackSearch(query: string, resultCount: number): void {
  trackEvent('search', {
    search_term: query,
    result_count: resultCount,
  });
}

/**
 * Track filter usage
 */
export function trackFilter(
  category?: string,
  country?: string,
  year?: string,
  genre?: string
): void {
  trackEvent('filter_use', {
    filter_category: category || 'none',
    filter_country: country || 'none',
    filter_year: year || 'none',
    filter_genre: genre || 'none',
  });
}

/**
 * Track user engagement: scroll depth
 */
export function trackScrollDepth(depthPercent: number): void {
  trackEvent('scroll_depth', {
    depth_percent: depthPercent,
    page_path: window.location.pathname,
  });
}

/**
 * Track time on page (gọi khi user rời trang)
 */
export function trackTimeOnPage(seconds: number): void {
  trackEvent('time_on_page', {
    duration_seconds: Math.round(seconds),
    page_path: window.location.pathname,
  });
}

/**
 * Track error
 */
export function trackError(
  errorType: string,
  errorMessage: string,
  pagePath?: string
): void {
  trackEvent('exception', {
    description: `${errorType}: ${errorMessage}`,
    fatal: false,
    page_path: pagePath || window.location.pathname,
  });
}

/**
 * Track outbound link click
 */
export function trackOutboundLink(url: string, label?: string): void {
  trackEvent('outbound_click', {
    link_url: url,
    link_label: label || url,
  });
}

/**
 * Track social share
 */
export function trackShare(platform: string, contentUrl: string): void {
  trackEvent('share', {
    method: platform,
    content_type: 'movie',
    item_id: contentUrl,
  });
}

/**
 * Track add to favorites
 */
export function trackAddToFavorites(movieSlug: string, movieName: string): void {
  trackEvent('add_to_favorites', {
    movie_slug: movieSlug,
    movie_name: movieName,
  });
}

/**
 * Track remove from favorites
 */
export function trackRemoveFromFavorites(movieSlug: string, movieName: string): void {
  trackEvent('remove_from_favorites', {
    movie_slug: movieSlug,
    movie_name: movieName,
  });
}

/**
 * Track resume watching
 */
export function trackResumeWatch(movieSlug: string, episode: number, progressPercent: number): void {
  trackEvent('resume_watch', {
    movie_slug: movieSlug,
    episode: episode,
    progress_percent: Math.round(progressPercent),
  });
}

/**
 * Track pagination click
 */
export function trackPagination(pageNumber: number, pageType: string): void {
  trackEvent('pagination_click', {
    page_number: pageNumber,
    page_type: pageType,
  });
}

/**
 * Track tab/category switch
 */
export function trackTabSwitch(tabName: string, tabCategory: string): void {
  trackEvent('tab_switch', {
    tab_name: tabName,
    tab_category: tabCategory,
  });
}

/**
 * Track FAQ expand
 */
export function trackFAQExpand(question: string, pageType: string): void {
  trackEvent('faq_expand', {
    question: question.slice(0, 100),
    page_type: pageType,
  });
}

/**
 * Track SEO landing page visit
 */
export function trackSEOLandingVisit(landingType: string, keywords: string): void {
  trackEvent('seo_landing_visit', {
    landing_type: landingType,
    target_keywords: keywords.slice(0, 150),
  });
}

// Type augmentation for window.gtag
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}
