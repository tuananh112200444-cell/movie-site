type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

function getOrientationApi(): LockableOrientation | undefined {
  return (window.screen as Screen & { orientation?: LockableOrientation }).orientation;
}

export function isPortraitPhoneViewport(): boolean {
  // Do not force-rotate tablets. iPad portrait widths commonly start around
  // 744 CSS px; treating them as phones rotates the whole cross-origin player
  // and can leave the provider's centre control looking like a broken square.
  return window.innerHeight > window.innerWidth && window.innerWidth <= 600;
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
