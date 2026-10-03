import { supabase } from '@/lib/supabase';

export type SyncDataType = 'favorite' | 'watch_history' | 'private_comment' | 'followed_movie' | 'notification';

interface SyncRecord {
  user_id: string;
  data_type: SyncDataType;
  item_key: string;
  payload: Record<string, unknown>;
  deleted_at: string | null;
  updated_at: string;
}

interface LocalSyncMeta {
  updatedAt: string;
  deletedAt?: string | null;
}

const FAVORITES_KEY = 'kp_favorites';
const HISTORY_KEY = 'kp_watch_history';
const COMMENT_PREFIX = 'khophim_comments_';
const FOLLOWS_KEY = 'kp_followed_movies';
const NOTIFICATIONS_KEY = 'kp_episode_notifications';
const META_KEY = 'kp_account_sync_meta_v1';
const OWNER_KEY = 'kp_account_sync_owner_v1';
export const ACCOUNT_DATA_CHANGED_EVENT = 'kp:account-data-changed';

let activeUserId: string | null = null;

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function getMeta(): Record<string, LocalSyncMeta> {
  if (typeof window === 'undefined') return {};
  return safeParse<Record<string, LocalSyncMeta>>(localStorage.getItem(META_KEY), {});
}

function saveMeta(meta: Record<string, LocalSyncMeta>): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* storage unavailable */ }
}

function metaKey(dataType: SyncDataType, itemKey: string): string {
  return `${dataType}:${itemKey}`;
}

function dispatchDataChanged(dataType?: SyncDataType): void {
  window.dispatchEvent(new CustomEvent(ACCOUNT_DATA_CHANGED_EVENT, { detail: { dataType } }));
}

function normalizeItemKey(value: unknown): string {
  return String(value ?? '').trim();
}

function listLocalItems(): Map<string, { dataType: SyncDataType; itemKey: string; payload: Record<string, unknown> }> {
  const items = new Map<string, { dataType: SyncDataType; itemKey: string; payload: Record<string, unknown> }>();
  if (typeof window === 'undefined') return items;

  const favorites = safeParse<Record<string, unknown>[]>(localStorage.getItem(FAVORITES_KEY), []);
  favorites.forEach((payload) => {
    const itemKey = normalizeItemKey(payload?._id || payload?.slug);
    if (itemKey) items.set(metaKey('favorite', itemKey), { dataType: 'favorite', itemKey, payload });
  });

  const history = safeParse<Record<string, unknown>[]>(localStorage.getItem(HISTORY_KEY), []);
  history.forEach((payload) => {
    const itemKey = normalizeItemKey(payload?.slug || payload?._id);
    if (itemKey) items.set(metaKey('watch_history', itemKey), { dataType: 'watch_history', itemKey, payload });
  });

  Object.keys(localStorage).filter((key) => key.startsWith(COMMENT_PREFIX)).forEach((storageKey) => {
    const slug = storageKey.slice(COMMENT_PREFIX.length);
    const comments = safeParse<Record<string, unknown>[]>(localStorage.getItem(storageKey), []);
    comments.forEach((payload) => {
      const commentId = normalizeItemKey(payload?.id);
      if (!slug || !commentId) return;
      const itemKey = `${slug}:${commentId}`;
      items.set(metaKey('private_comment', itemKey), { dataType: 'private_comment', itemKey, payload });
    });
  });

  const follows = safeParse<Record<string, unknown>[]>(localStorage.getItem(FOLLOWS_KEY), []);
  follows.forEach((payload) => {
    const itemKey = normalizeItemKey(payload?.slug || payload?._id);
    if (itemKey) items.set(metaKey('followed_movie', itemKey), { dataType: 'followed_movie', itemKey, payload });
  });

  const notifications = safeParse<Record<string, unknown>[]>(localStorage.getItem(NOTIFICATIONS_KEY), []);
  notifications.forEach((payload) => {
    const itemKey = normalizeItemKey(payload?.id);
    if (itemKey) items.set(metaKey('notification', itemKey), { dataType: 'notification', itemKey, payload });
  });

  return items;
}

function writeLocalItems(items: Iterable<{ dataType: SyncDataType; itemKey: string; payload: Record<string, unknown> }>): void {
  const favorites: Record<string, unknown>[] = [];
  const history: Record<string, unknown>[] = [];
  const commentsBySlug = new Map<string, Record<string, unknown>[]>();
  const follows: Record<string, unknown>[] = [];
  const notifications: Record<string, unknown>[] = [];

  for (const item of items) {
    if (item.dataType === 'favorite') favorites.push(item.payload);
    if (item.dataType === 'watch_history') history.push(item.payload);
    if (item.dataType === 'private_comment') {
      const separator = item.itemKey.indexOf(':');
      const slug = separator >= 0 ? item.itemKey.slice(0, separator) : '';
      if (!slug) continue;
      const comments = commentsBySlug.get(slug) ?? [];
      comments.push(item.payload);
      commentsBySlug.set(slug, comments);
    }
    if (item.dataType === 'followed_movie') follows.push(item.payload);
    if (item.dataType === 'notification') notifications.push(item.payload);
  }

  history.sort((a, b) => Number(b.watchedAt || 0) - Number(a.watchedAt || 0));
  favorites.sort((a, b) => Number(b.addedAt || 0) - Number(a.addedAt || 0));
  follows.sort((a, b) => Number(b.followedAt || 0) - Number(a.followedAt || 0));
  notifications.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  const previousCommentKeys = Object.keys(localStorage).filter((key) => key.startsWith(COMMENT_PREFIX));
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  localStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows));
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications.slice(0, 100)));
  previousCommentKeys.forEach((key) => localStorage.removeItem(key));
  commentsBySlug.forEach((comments, slug) => {
    comments.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    localStorage.setItem(`${COMMENT_PREFIX}${slug}`, JSON.stringify(comments));
  });
}

function clearSyncedLocalData(): void {
  localStorage.removeItem(FAVORITES_KEY);
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(META_KEY);
  localStorage.removeItem(FOLLOWS_KEY);
  localStorage.removeItem(NOTIFICATIONS_KEY);
  Object.keys(localStorage)
    .filter((key) => key.startsWith(COMMENT_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
}

function isNewer(left?: string, right?: string): boolean {
  return new Date(left || 0).getTime() > new Date(right || 0).getTime();
}

export function setActiveSyncUser(userId: string | null): void {
  activeUserId = userId;
}

export async function pushSyncItem(
  dataType: SyncDataType,
  itemKey: string,
  payload: Record<string, unknown>,
  deleted = false,
): Promise<void> {
  const normalizedKey = normalizeItemKey(itemKey);
  const now = new Date().toISOString();
  const meta = getMeta();
  meta[metaKey(dataType, normalizedKey)] = { updatedAt: now, deletedAt: deleted ? now : null };
  saveMeta(meta);
  queueMicrotask(() => dispatchDataChanged(dataType));
  if (!activeUserId || !normalizedKey) return;

  const { error } = await supabase.from('user_sync_items').upsert({
    user_id: activeUserId,
    data_type: dataType,
    item_key: normalizedKey,
    payload: deleted ? {} : payload,
    deleted_at: deleted ? now : null,
    updated_at: now,
  }, { onConflict: 'user_id,data_type,item_key' });
  if (error) throw error;
}

export async function syncAllUserData(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const previousOwner = localStorage.getItem(OWNER_KEY);
  if (previousOwner && previousOwner !== userId) clearSyncedLocalData();
  localStorage.setItem(OWNER_KEY, userId);

  const { data, error } = await supabase
    .from('user_sync_items')
    .select('user_id,data_type,item_key,payload,deleted_at,updated_at')
    .eq('user_id', userId);
  if (error) throw error;

  const localItems = listLocalItems();
  const localMeta = getMeta();
  const remoteItems = new Map<string, SyncRecord>();
  (data as SyncRecord[] | null)?.forEach((row) => remoteItems.set(metaKey(row.data_type, row.item_key), row));
  const allKeys = new Set([...localItems.keys(), ...remoteItems.keys(), ...Object.keys(localMeta)]);
  const resolved = new Map(localItems);
  const uploads: SyncRecord[] = [];

  allKeys.forEach((key) => {
    const local = localItems.get(key);
    const meta = localMeta[key];
    const remote = remoteItems.get(key);

    if (!remote) {
      if (local) {
        const updatedAt = meta?.updatedAt || new Date().toISOString();
        uploads.push({ user_id: userId, data_type: local.dataType, item_key: local.itemKey, payload: local.payload, deleted_at: null, updated_at: updatedAt });
        localMeta[key] = { updatedAt, deletedAt: null };
      } else if (meta?.deletedAt) {
        const [dataType, ...itemParts] = key.split(':');
        uploads.push({ user_id: userId, data_type: dataType as SyncDataType, item_key: itemParts.join(':'), payload: {}, deleted_at: meta.deletedAt, updated_at: meta.updatedAt });
      }
      return;
    }

    if (meta && isNewer(meta.updatedAt, remote.updated_at)) {
      uploads.push({
        user_id: userId,
        data_type: remote.data_type,
        item_key: remote.item_key,
        payload: local?.payload ?? {},
        deleted_at: local ? null : (meta.deletedAt || meta.updatedAt),
        updated_at: meta.updatedAt,
      });
      return;
    }

    localMeta[key] = { updatedAt: remote.updated_at, deletedAt: remote.deleted_at };
    if (remote.deleted_at) resolved.delete(key);
    else resolved.set(key, { dataType: remote.data_type, itemKey: remote.item_key, payload: remote.payload || {} });
  });

  if (uploads.length) {
    const { error: uploadError } = await supabase
      .from('user_sync_items')
      .upsert(uploads, { onConflict: 'user_id,data_type,item_key' });
    if (uploadError) throw uploadError;
  }

  writeLocalItems(resolved.values());
  saveMeta(localMeta);
  dispatchDataChanged();
}

export function applyRemoteSyncRecord(row: SyncRecord): void {
  if (typeof window === 'undefined' || row.user_id !== activeUserId) return;
  const items = listLocalItems();
  const key = metaKey(row.data_type, row.item_key);
  const meta = getMeta();
  if (meta[key] && isNewer(meta[key].updatedAt, row.updated_at)) return;

  meta[key] = { updatedAt: row.updated_at, deletedAt: row.deleted_at };
  if (row.deleted_at) items.delete(key);
  else items.set(key, { dataType: row.data_type, itemKey: row.item_key, payload: row.payload || {} });
  writeLocalItems(items.values());
  saveMeta(meta);
  dispatchDataChanged(row.data_type);
}
