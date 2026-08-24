import { useEffect, useState } from 'react';

let offsetMs = 0;
let offsetPromise: Promise<number> | null = null;

async function loadServerOffset(): Promise<number> {
  if (!offsetPromise) {
    offsetPromise = (async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2_000);
      try {
        const response = await fetch('/api/time', {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return 0;
        const payload = await response.json() as { now?: string };
        const serverMs = new Date(String(payload.now || '')).getTime();
        return Number.isFinite(serverMs) ? serverMs - Date.now() : 0;
      } catch {
        return 0;
      } finally {
        window.clearTimeout(timer);
      }
    })();
  }
  offsetMs = await offsetPromise;
  return offsetMs;
}

export function useServerNow(enabled = true): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadServerOffset().then((offset) => {
      if (alive) setNow(Date.now() + offset);
    });
    const timer = window.setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return now;
}
