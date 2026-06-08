import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

let offsetMs = 0;
let offsetPromise: Promise<number> | null = null;

async function loadServerOffset(): Promise<number> {
  if (!offsetPromise) {
    offsetPromise = Promise.resolve(supabase.rpc('get_server_now'))
      .then(({ data, error }) => {
        if (error || !data) return 0;
        const serverMs = new Date(String(data)).getTime();
        return Number.isFinite(serverMs) ? serverMs - Date.now() : 0;
      })
      .catch(() => 0);
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
