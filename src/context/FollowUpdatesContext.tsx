import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MovieDetail, MovieItem } from '@/types/movie';
import { supabase } from '@/lib/supabase';
import { ACCOUNT_DATA_CHANGED_EVENT, pushSyncItem } from '@/services/accountSync';

const FOLLOWS_KEY = 'kp_followed_movies';
const NOTIFICATIONS_KEY = 'kp_episode_notifications';
type BrowserNotificationPermission = 'default' | 'denied' | 'granted';

export type FollowedMovie = Pick<MovieItem,
  '_id' | 'slug' | 'name' | 'origin_name' | 'thumb_url' | 'poster_url' | 'year' |
  'episode_current' | 'episode_total' | 'current_episode' | 'total_episodes' |
  'schedule_type' | 'release_time' | 'release_day' | 'schedule_timezone' |
  'next_episode_at' | 'next_episode_name' | 'schedule_note' | 'release_at'
> & {
  followedAt: number;
  checkedAt: number;
};

export interface EpisodeNotification {
  id: string;
  movieSlug: string;
  movieName: string;
  episode: string;
  previousEpisode: string;
  createdAt: number;
  read: boolean;
}

interface FollowUpdatesValue {
  follows: FollowedMovie[];
  notifications: EpisodeNotification[];
  unreadCount: number;
  refreshing: boolean;
  browserPermission: BrowserNotificationPermission | 'unsupported';
  isFollowing: (slug: string) => boolean;
  toggleFollow: (movie: MovieItem | MovieDetail) => boolean;
  markAllRead: () => void;
  refreshUpdates: () => Promise<void>;
  requestBrowserNotifications: () => Promise<BrowserNotificationPermission | 'unsupported'>;
}

const FollowUpdatesContext = createContext<FollowUpdatesValue | null>(null);

function parseList<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function saveList(key: string, value: unknown[]): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function snapshotMovie(movie: MovieItem | MovieDetail): FollowedMovie {
  return {
    _id: movie._id,
    slug: movie.slug,
    name: movie.name,
    origin_name: movie.origin_name || '',
    thumb_url: movie.thumb_url || '',
    poster_url: movie.poster_url || '',
    year: Number(movie.year || 0),
    episode_current: movie.episode_current || '',
    episode_total: movie.episode_total || '',
    current_episode: movie.current_episode,
    total_episodes: movie.total_episodes,
    schedule_type: movie.schedule_type || '',
    release_time: movie.release_time,
    release_day: movie.release_day,
    schedule_timezone: movie.schedule_timezone,
    next_episode_at: movie.next_episode_at,
    next_episode_name: movie.next_episode_name,
    schedule_note: movie.schedule_note,
    release_at: movie.release_at,
    followedAt: Date.now(),
    checkedAt: Date.now(),
  };
}

function episodeNumber(value: string): number {
  return Number(String(value || '').match(/\d+/)?.[0] || 0);
}

function isNewEpisode(previous: string, current: string): boolean {
  const before = String(previous || '').trim().toLowerCase();
  const after = String(current || '').trim().toLowerCase();
  if (!before || !after || before === after) return false;
  const beforeNumber = episodeNumber(before);
  const afterNumber = episodeNumber(after);
  return afterNumber > beforeNumber || (!afterNumber && Boolean(before));
}

function browserPermission(): BrowserNotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export function FollowUpdatesProvider({ children }: { children: React.ReactNode }) {
  const [follows, setFollows] = useState<FollowedMovie[]>(() => parseList(FOLLOWS_KEY));
  const [notifications, setNotifications] = useState<EpisodeNotification[]>(() => parseList(NOTIFICATIONS_KEY));
  const [refreshing, setRefreshing] = useState(false);
  const [permission, setPermission] = useState<BrowserNotificationPermission | 'unsupported'>(browserPermission);
  const refreshInFlight = useRef(false);
  const followsRef = useRef(follows);
  const notificationsRef = useRef(notifications);

  useEffect(() => { followsRef.current = follows; }, [follows]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);

  const reload = useCallback(() => {
    setFollows(parseList(FOLLOWS_KEY));
    setNotifications(parseList(NOTIFICATIONS_KEY));
  }, []);

  useEffect(() => {
    window.addEventListener(ACCOUNT_DATA_CHANGED_EVENT, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(ACCOUNT_DATA_CHANGED_EVENT, reload);
      window.removeEventListener('storage', reload);
    };
  }, [reload]);

  const isFollowing = useCallback((slug: string) => follows.some((item) => item.slug === slug), [follows]);

  const toggleFollow = useCallback((movie: MovieItem | MovieDetail) => {
    const existing = follows.find((item) => item.slug === movie.slug);
    if (existing) {
      const next = follows.filter((item) => item.slug !== movie.slug);
      saveList(FOLLOWS_KEY, next);
      setFollows(next);
      void pushSyncItem('followed_movie', movie.slug, {}, true).catch(() => {});
      return false;
    }
    const item = snapshotMovie(movie);
    const next = [item, ...follows];
    saveList(FOLLOWS_KEY, next);
    setFollows(next);
    void pushSyncItem('followed_movie', item.slug, item as unknown as Record<string, unknown>).catch(() => {});
    return true;
  }, [follows]);

  const refreshUpdates = useCallback(async () => {
    const currentFollows = followsRef.current;
    if (refreshInFlight.current || currentFollows.length === 0) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const slugs = currentFollows.map((item) => item.slug).filter(Boolean);
      const { data, error } = await supabase
        .from('movies')
        .select('id,slug,name,origin_name,thumb_url,poster_url,year,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,next_episode_at,next_episode_name,schedule_note,release_at')
        .in('slug', slugs);
      if (error) throw error;
      const currentBySlug = new Map((data || []).map((row) => [String(row.slug), row]));
      const nextNotifications = [...notificationsRef.current];
      const nextFollows = currentFollows.map((follow) => {
        const currentRow = currentBySlug.get(follow.slug) as Record<string, unknown> | undefined;
        const current = currentRow ? { ...currentRow, _id: String(currentRow.id || follow._id) } as unknown as MovieItem : undefined;
        if (!current) return { ...follow, checkedAt: Date.now() };
        if (isNewEpisode(follow.episode_current, current.episode_current)) {
          const notification: EpisodeNotification = {
            id: `${follow.slug}:${String(current.episode_current).toLowerCase().replace(/\s+/g, '-')}`,
            movieSlug: follow.slug,
            movieName: current.name || follow.name,
            episode: current.episode_current,
            previousEpisode: follow.episode_current,
            createdAt: Date.now(),
            read: false,
          };
          if (!nextNotifications.some((item) => item.id === notification.id)) {
            nextNotifications.unshift(notification);
            void pushSyncItem('notification', notification.id, notification as unknown as Record<string, unknown>).catch(() => {});
            if (permission === 'granted') {
              try {
                new Notification(`${notification.movieName} có tập mới`, {
                  body: `Đã cập nhật ${notification.episode}.`,
                  icon: current.thumb_url || '/favicon.ico',
                  tag: notification.id,
                });
              } catch { /* browser denied a system notification after permission changed */ }
            }
          }
        }
        const updated = { ...snapshotMovie(current), followedAt: follow.followedAt, checkedAt: Date.now() };
        void pushSyncItem('followed_movie', updated.slug, updated as unknown as Record<string, unknown>).catch(() => {});
        return updated;
      });
      saveList(FOLLOWS_KEY, nextFollows);
      saveList(NOTIFICATIONS_KEY, nextNotifications.slice(0, 100));
      setFollows(nextFollows);
      setNotifications(nextNotifications.slice(0, 100));
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [permission]);

  useEffect(() => {
    void refreshUpdates();
    const timer = window.setInterval(() => void refreshUpdates(), 10 * 60 * 1000);
    const onResume = () => void refreshUpdates();
    window.addEventListener('kp:page-resumed', onResume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('kp:page-resumed', onResume);
    };
  }, [refreshUpdates]);

  const markAllRead = useCallback(() => {
    const next = notifications.map((item) => ({ ...item, read: true }));
    saveList(NOTIFICATIONS_KEY, next);
    setNotifications(next);
    next.forEach((item) => void pushSyncItem('notification', item.id, item as unknown as Record<string, unknown>).catch(() => {}));
  }, [notifications]);

  const requestBrowserNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported' as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const value = useMemo<FollowUpdatesValue>(() => ({
    follows,
    notifications,
    unreadCount: notifications.filter((item) => !item.read).length,
    refreshing,
    browserPermission: permission,
    isFollowing,
    toggleFollow,
    markAllRead,
    refreshUpdates,
    requestBrowserNotifications,
  }), [follows, isFollowing, markAllRead, notifications, permission, refreshUpdates, refreshing, requestBrowserNotifications, toggleFollow]);

  return <FollowUpdatesContext.Provider value={value}>{children}</FollowUpdatesContext.Provider>;
}

export function useFollowUpdates(): FollowUpdatesValue {
  const context = useContext(FollowUpdatesContext);
  if (!context) throw new Error('useFollowUpdates must be used inside FollowUpdatesProvider');
  return context;
}
