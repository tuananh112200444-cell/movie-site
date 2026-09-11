type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type IOSFullscreenVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

export type PlayerViewportRect = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
};

function getOrientationApi(): LockableOrientation | undefined {
  return (window.screen as Screen & { orientation?: LockableOrientation }).orientation;
}

export function isPortraitPhoneViewport(): boolean {
  // Do not force-rotate tablets. iPad portrait widths commonly start around
  // 744 CSS px; treating them as phones rotates the whole cross-origin player
  // and can leave the provider's centre control looking like a broken square.
  const viewport = getPlayerViewportRect();
  return viewport.height > viewport.width && viewport.width <= 600;
}

export function getPlayerViewportRect(): PlayerViewportRect {
  const viewport = window.visualViewport;
  return {
    width: Math.max(1, Math.round(viewport?.width || window.innerWidth)),
    height: Math.max(1, Math.round(viewport?.height || window.innerHeight)),
    offsetLeft: Math.round(viewport?.offsetLeft || 0),
    offsetTop: Math.round(viewport?.offsetTop || 0),
  };
}

export function syncPlayerPseudoFullscreenLayout(element: HTMLElement, rotateToLandscape: boolean): void {
  const viewport = getPlayerViewportRect();
  const targetWidth = rotateToLandscape ? viewport.height : viewport.width;
  const targetHeight = rotateToLandscape ? viewport.width : viewport.height;
  const targetLeft = rotateToLandscape ? viewport.offsetLeft + viewport.width / 2 : viewport.offsetLeft;
  const targetTop = rotateToLandscape ? viewport.offsetTop + viewport.height / 2 : viewport.offsetTop;

  element.dataset.rotated = String(rotateToLandscape);
  element.style.setProperty('--kp-fullscreen-width', `${viewport.width}px`);
  element.style.setProperty('--kp-fullscreen-height', `${viewport.height}px`);
  element.style.setProperty('--kp-fullscreen-left', `${targetLeft}px`);
  element.style.setProperty('--kp-fullscreen-top', `${targetTop}px`);
  element.style.position = 'fixed';
  element.style.zIndex = '9999';
  element.style.borderRadius = '0';
  element.style.left = `${targetLeft}px`;
  element.style.top = `${targetTop}px`;
  element.style.width = `${targetWidth}px`;
  element.style.height = `${targetHeight}px`;
  element.style.transform = rotateToLandscape ? 'translate(-50%, -50%) rotate(90deg)' : 'none';

  // Fixed descendants can still be offset by a transformed ancestor. Correct
  // against the visual viewport so Safari, in-app browsers and tablets cover
  // the screen without a clipped strip on either edge.
  const rect = element.getBoundingClientRect();
  const deltaLeft = viewport.offsetLeft - rect.left;
  const deltaTop = viewport.offsetTop - rect.top;
  if (Math.abs(deltaLeft) > 0.5) {
    element.style.left = `${targetLeft + deltaLeft}px`;
    element.style.setProperty('--kp-fullscreen-left', `${targetLeft + deltaLeft}px`);
  }
  if (Math.abs(deltaTop) > 0.5) {
    element.style.top = `${targetTop + deltaTop}px`;
    element.style.setProperty('--kp-fullscreen-top', `${targetTop + deltaTop}px`);
  }
}

export function clearPlayerPseudoFullscreenLayout(element: HTMLElement | null): void {
  if (!element) return;
  delete element.dataset.rotated;
  element.style.removeProperty('--kp-fullscreen-width');
  element.style.removeProperty('--kp-fullscreen-height');
  element.style.removeProperty('--kp-fullscreen-left');
  element.style.removeProperty('--kp-fullscreen-top');
  element.style.position = '';
  element.style.top = '';
  element.style.left = '';
  element.style.width = '';
  element.style.height = '';
  element.style.transform = '';
  element.style.zIndex = '';
  element.style.borderRadius = '';
}

export async function tryLockPlayerLandscape(): Promise<boolean> {
  const orientation = getOrientationApi();
  if (!orientation?.lock) return false;
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

export function unlockPlayerOrientation(): void {
  try {
    getOrientationApi()?.unlock?.();
  } catch {
    // Orientation unlock is best-effort across mobile browsers.
  }
}

export function getPlayerFullscreenElement(): Element | null {
  const webkitDocument = document as WebkitFullscreenDocument;
  return document.fullscreenElement || webkitDocument.webkitFullscreenElement || null;
}

export async function requestPlayerFullscreen(element: HTMLElement): Promise<boolean> {
  const webkitDocument = document as WebkitFullscreenDocument;
  const webkitElement = element as WebkitFullscreenElement;
  if (typeof element.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
    try {
      await element.requestFullscreen();
      return true;
    } catch {
      // Safari/WebViews may expose the standard method but only permit WebKit fullscreen.
    }
  }
  if (typeof webkitElement.webkitRequestFullscreen === 'function' && webkitDocument.webkitFullscreenEnabled !== false) {
    try {
      await Promise.resolve(webkitElement.webkitRequestFullscreen());
      return true;
    } catch {
      // The caller will use viewport fullscreen when both native APIs fail.
    }
  }
  return false;
}

export async function exitPlayerFullscreen(): Promise<void> {
  const webkitDocument = document as WebkitFullscreenDocument;
  if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
    try {
      await document.exitFullscreen();
      return;
    } catch {
      // Continue to the WebKit exit path when the standard state is stale.
    }
  }
  if (webkitDocument.webkitFullscreenElement && typeof webkitDocument.webkitExitFullscreen === 'function') {
    try {
      await Promise.resolve(webkitDocument.webkitExitFullscreen());
      return;
    } catch {
      // A browser may already be leaving fullscreen through Escape or a gesture.
    }
  }
  try {
    await document.exitFullscreen?.();
  } catch {
    try { await Promise.resolve(webkitDocument.webkitExitFullscreen?.()); } catch { /* best effort */ }
  }
}

export function requestPlayerVideoFullscreen(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  const iosVideo = video as IOSFullscreenVideo;
  if (typeof iosVideo.webkitEnterFullscreen !== 'function') return false;
  try {
    // iPhone Safari only offers native fullscreen on the video element. This
    // is preferable to leaving browser chrome visible around a CSS fallback.
    iosVideo.webkitEnterFullscreen();
    return true;
  } catch {
    return false;
  }
}

export function exitPlayerVideoFullscreen(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  const iosVideo = video as IOSFullscreenVideo;
  if (!iosVideo.webkitDisplayingFullscreen || typeof iosVideo.webkitExitFullscreen !== 'function') return false;
  try {
    iosVideo.webkitExitFullscreen();
    return true;
  } catch {
    return false;
  }
}
