/**
 * useResumeWatch
 * Lưu & đọc thời gian xem dở theo từng tập phim (slug + epSlug).
 * Dùng localStorage với key riêng để không ảnh hưởng lịch sử xem.
 *
 * Cấu trúc lưu:
 *   kp_resume_v1 = {
 *     "[movieSlug]__[epSlug]": { time: number, duration: number, savedAt: number }
 *   }
 */

import { useCallback } from 'react';

const STORAGE_KEY = 'kp_resume_v1';
const MAX_ENTRIES = 200;
/** Không lưu nếu còn < 5% hoặc > 95% (coi như đã xem xong / chưa xem) */
const MIN_PCT = 0.05;
const MAX_PCT = 0.95;
/** Không lưu nếu thời gian < 30 giây */
const MIN_SECONDS = 30;

interface ResumeEntry {
  time: number;
  duration: number;
  savedAt: number;
}

type ResumeStore = Record<string, ResumeEntry>;

function loadStore(): ResumeStore {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveStore(store: ResumeStore): void {
  // Giới hạn số entry — xóa entry cũ nhất nếu vượt quá
  const entries = Object.entries(store).sort((a, b) => b[1].savedAt - a[1].savedAt);
  const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
}

function makeKey(movieSlug: string, epSlug: string): string {
  return `${movieSlug}__${epSlug || 'full'}`;
}

export interface ResumeInfo {
  /** Thời gian cần seek đến (giây), 0 nếu không có */
  time: number;
  /** Tổng thời lượng đã biết (giây) */
  duration: number;
  /** Phần trăm đã xem (0–1) */
  progress: number;
  /** Có nên hiện banner "Tiếp tục xem" không */
  shouldResume: boolean;
}

export function useResumeWatch() {
  /** Lấy thông tin tiếp tục xem cho 1 tập */
  const getResume = useCallback((movieSlug: string, epSlug: string): ResumeInfo => {
    const store = loadStore();
    const entry = store[makeKey(movieSlug, epSlug)];
    if (!entry || entry.time < MIN_SECONDS) {
      return { time: 0, duration: 0, progress: 0, shouldResume: false };
    }
    const pct = entry.duration > 0 ? entry.time / entry.duration : 0;
    return {
      time: entry.time,
      duration: entry.duration,
      progress: pct,
      shouldResume: pct >= MIN_PCT && pct <= MAX_PCT,
    };
  }, []);

  /** Lưu tiến độ xem (gọi mỗi 5–10 giây) */
  const saveProgress = useCallback((
    movieSlug: string,
    epSlug: string,
    time: number,
    duration: number,
  ): void => {
    if (!movieSlug || time < MIN_SECONDS || duration <= 0) return;
    const pct = time / duration;
    // Không lưu nếu gần hết phim (coi như đã xem xong)
    if (pct > MAX_PCT) {
      // Xóa entry nếu đã xem xong
      const store = loadStore();
      delete store[makeKey(movieSlug, epSlug)];
      saveStore(store);
      return;
    }
    const store = loadStore();
    store[makeKey(movieSlug, epSlug)] = { time, duration, savedAt: Date.now() };
    saveStore(store);
  }, []);

  /** Xóa tiến độ của 1 tập (khi user chọn xem lại từ đầu) */
  const clearProgress = useCallback((movieSlug: string, epSlug: string): void => {
    const store = loadStore();
    delete store[makeKey(movieSlug, epSlug)];
    saveStore(store);
  }, []);

  /** Xóa toàn bộ tiến độ của 1 phim */
  const clearMovieProgress = useCallback((movieSlug: string): void => {
    const store = loadStore();
    const prefix = `${movieSlug}__`;
    Object.keys(store).forEach((k) => { if (k.startsWith(prefix)) delete store[k]; });
    saveStore(store);
  }, []);

  return {
    getResume,
    saveProgress,
    clearProgress,
    clearMovieProgress,
    /** Lấy tất cả progress đang có, trả về map slug -> { progress, time, duration, epSlug } */
    getAllProgress: useCallback((): Record<string, ResumeInfo & { epSlug: string }> => {
      const store = loadStore();
      const result: Record<string, ResumeInfo & { epSlug: string }> = {};
      for (const [key, entry] of Object.entries(store)) {
        const [movieSlug, epSlug] = key.split('__');
        if (!movieSlug || !epSlug) continue;
        const pct = entry.duration > 0 ? entry.time / entry.duration : 0;
        result[movieSlug] = {
          time: entry.time,
          duration: entry.duration,
          progress: pct,
          shouldResume: pct >= MIN_PCT && pct <= MAX_PCT,
          epSlug,
        };
      }
      return result;
    }, []),
  };
}
