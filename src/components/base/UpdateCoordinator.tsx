import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

type ReleaseManifest = {
  release_id?: string;
  generated_at?: string;
};

type SafariDocument = Document & {
  webkitFullscreenElement?: Element | null;
};

const RELEASE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RELEASE_CHECK_COOLDOWN_MS = 60 * 1000;
const RELEASE_FETCH_TIMEOUT_MS = 5000;
const AUTO_RELOAD_DELAY_MS = 1200;
const RELOAD_GUARD_KEY = 'kp_release_reload_target_v1';

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private browsing and embedded browsers may reject storage writes.
  }
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Best-effort guard cleanup only.
  }
}

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return element.matches('input, textarea, select, [contenteditable="true"]');
}

function isUpdateUnsafe(pathname: string): boolean {
  const safariDocument = document as SafariDocument;
  if (document.hidden) return true;
  if (document.fullscreenElement || safariDocument.webkitFullscreenElement) return true;
  if (isEditableElement(document.activeElement)) return true;
  if (document.querySelector('[aria-label="Thoát chế độ Cinema"][aria-pressed="true"]')) return true;

  if (/^\/xem-phim\//.test(pathname)) {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.some((video) => !video.paused && !video.ended)) return true;
    // Playback state inside third-party embeds is intentionally inaccessible.
    // Never reload an iframe player without an explicit user action.
    if (document.querySelector('iframe')) return true;
  }

  return false;
}

function releaseManifestUrl(): string {
  const base = __BASE_PATH__.endsWith('/') ? __BASE_PATH__ : `${__BASE_PATH__}/`;
  return `${base}release.json?kp_check=${Date.now()}`;
}

export default function UpdateCoordinator() {
  const location = useLocation();
  const [targetRelease, setTargetRelease] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const checkingRef = useRef(false);
  const lastCheckedAtRef = useRef(0);
  const reloadTimerRef = useRef<number | null>(null);

  const cancelScheduledReload = useCallback(() => {
    if (reloadTimerRef.current === null) return;
    window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = null;
  }, []);

  const applyUpdate = useCallback((releaseId: string) => {
    if (!releaseId || safeSessionGet(RELOAD_GUARD_KEY) === releaseId) return;
    cancelScheduledReload();
    safeSessionSet(RELOAD_GUARD_KEY, releaseId);
    window.dispatchEvent(new CustomEvent('kp:before-release-reload', {
      detail: { currentRelease: __KP_RELEASE_ID__, targetRelease: releaseId },
    }));
    // Progress writes use localStorage synchronously. A short turn also lets
    // React event handlers flush their pending refs before navigation.
    window.setTimeout(() => window.location.reload(), 120);
  }, [cancelScheduledReload]);

  const scheduleSafeUpdate = useCallback((releaseId: string, delay = AUTO_RELOAD_DELAY_MS) => {
    cancelScheduledReload();
    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = null;
      if (isUpdateUnsafe(window.location.pathname)) {
        setBlocked(true);
        return;
      }
      applyUpdate(releaseId);
    }, delay);
  }, [applyUpdate, cancelScheduledReload]);

  const checkForUpdate = useCallback(async (force = false) => {
    if (checkingRef.current || navigator.onLine === false) return;
    const now = Date.now();
    if (!force && now - lastCheckedAtRef.current < RELEASE_CHECK_COOLDOWN_MS) return;
    checkingRef.current = true;
    lastCheckedAtRef.current = now;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), RELEASE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(releaseManifestUrl(), {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const manifest = await response.json() as ReleaseManifest;
      const remoteRelease = String(manifest.release_id || '').trim();
      if (!remoteRelease) return;

      if (remoteRelease === __KP_RELEASE_ID__) {
        safeSessionRemove(RELOAD_GUARD_KEY);
        setTargetRelease(null);
        setBlocked(false);
        setDismissed(false);
        return;
      }

      setTargetRelease(remoteRelease);
      const unsafe = isUpdateUnsafe(window.location.pathname);
      setBlocked(unsafe);
      if (!unsafe && safeSessionGet(RELOAD_GUARD_KEY) !== remoteRelease) {
        scheduleSafeUpdate(remoteRelease);
      }
    } catch {
      // Offline, captive portals and short Cloudflare propagation windows are
      // retried on the next resume/interval without interrupting the visitor.
    } finally {
      window.clearTimeout(timeoutId);
      checkingRef.current = false;
    }
  }, [scheduleSafeUpdate]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void checkForUpdate(true), 8000);
    const intervalId = window.setInterval(() => void checkForUpdate(true), RELEASE_CHECK_INTERVAL_MS);
    const onResume = () => void checkForUpdate(true);
    const onVisibility = () => {
      if (!document.hidden) void checkForUpdate(true);
    };
    window.addEventListener('pageshow', onResume);
    window.addEventListener('kp:page-resumed', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('kp:page-resumed', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelScheduledReload();
    };
  }, [cancelScheduledReload, checkForUpdate]);

  useEffect(() => {
    if (!targetRelease) return;
    setDismissed(false);
    const unsafe = isUpdateUnsafe(location.pathname);
    setBlocked(unsafe);
    if (!unsafe && safeSessionGet(RELOAD_GUARD_KEY) !== targetRelease) {
      scheduleSafeUpdate(targetRelease, 700);
    }
  }, [location.pathname, scheduleSafeUpdate, targetRelease]);

  useEffect(() => {
    if (!targetRelease) return;
    const reevaluate = () => {
      const unsafe = isUpdateUnsafe(window.location.pathname);
      setBlocked(unsafe);
      if (!unsafe && !dismissed && safeSessionGet(RELOAD_GUARD_KEY) !== targetRelease) {
        scheduleSafeUpdate(targetRelease, 1800);
      }
    };
    document.addEventListener('pause', reevaluate, true);
    document.addEventListener('ended', reevaluate, true);
    document.addEventListener('fullscreenchange', reevaluate);
    document.addEventListener('webkitfullscreenchange', reevaluate);
    return () => {
      document.removeEventListener('pause', reevaluate, true);
      document.removeEventListener('ended', reevaluate, true);
      document.removeEventListener('fullscreenchange', reevaluate);
      document.removeEventListener('webkitfullscreenchange', reevaluate);
    };
  }, [dismissed, scheduleSafeUpdate, targetRelease]);

  if (!targetRelease || dismissed) return null;

  return (
    <section
      data-testid="release-update-notice"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[250] mx-auto max-w-md rounded-2xl border border-white/15 bg-[#111722]/95 p-3 text-white shadow-2xl shadow-black/60 backdrop-blur-xl"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">KhoPhim có phiên bản mới</p>
          <p className="mt-1 text-xs leading-relaxed text-white/65">
            {blocked
              ? 'Bạn đang xem phim. Tiến độ sẽ được lưu trước khi cập nhật.'
              : 'Đang chuẩn bị cập nhật giao diện ở thời điểm an toàn.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {blocked && (
            <button
              type="button"
              onClick={() => {
                cancelScheduledReload();
                setDismissed(true);
              }}
              className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-bold text-white/65"
            >
              Để sau
            </button>
          )}
          <button
            type="button"
            onClick={() => applyUpdate(targetRelease)}
            className="min-h-11 rounded-xl bg-red-500 px-3 text-xs font-black text-white shadow-lg shadow-red-950/30"
          >
            Cập nhật
          </button>
        </div>
      </div>
    </section>
  );
}
