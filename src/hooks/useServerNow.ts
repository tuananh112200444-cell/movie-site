import { useEffect, useState } from 'react';

let offsetMs = 0;
let offsetPromise: Promise<number> | null = null;

async function loadServerOffset(): Promise<number> {
  if (!offsetPromise) {
    // Modern devices already synchronize their clocks. Avoid spending one
    // Pages Function invocation on every app load merely to recover a tiny
    // display-only offset for schedule countdowns.
    offsetPromise = Promise.resolve(0);
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
