import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getAdminToken } from '@/services/adminAuth';
import { getMergedEpisodes, evictAllMovieCaches, type FlatEpisode } from '@/services/movieApi';
import { normalizeVideoCdnUrl } from '@/utils/videoCdn';

type MovieEpisode = FlatEpisode;

interface ServerGroup {
  server_name: string;
  episodes: MovieEpisode[];
}

interface SourceSummary {
  key: string;
  label: string;
  count: number;
  maxEpisode: number;
  servers: string[];
  hidden: number;
}

interface Props {
  movieId: string;
  movieSlug: string;
  movieType: string;
  moviePoster?: string;
  movieName?: string;
  onDone: () => void;
}

const DEFAULT_SERVER = 'Vietsub';

function isQueerSourceText(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.includes('admin queer') ||
    normalized.includes('blvietsub') ||
    normalized.includes('vu tru dam my') ||
    normalized.includes('dam my') ||
    normalized.includes('bach hop') ||
    normalized.includes('boy love') ||
    normalized.includes('girl love') ||
    normalized.includes('thai bl') ||
    /\bbl\b/.test(normalized) ||
    /\bgl\b/.test(normalized);
}

function resolveSource(serverName: string, streamUrl: string, embedUrl: string): { source: string; isBackup: boolean } {
  const sn = serverName.toLowerCase();
  const sUrl = streamUrl.toLowerCase();
  const eUrl = embedUrl.toLowerCase();
  if (isQueerSourceText(`${serverName} ${streamUrl} ${embedUrl}`)) {
    return { source: 'admin-queer', isBackup: false };
  }
  if (sn.includes('dailymotion') || sUrl.includes('dailymotion.com') || eUrl.includes('dailymotion.com') || eUrl.includes('dai.ly')) {
    return { source: 'dailymotion', isBackup: true };
  }
  if (sn.includes('ophim')) {
    return { source: 'ophim', isBackup: false };
  }
  if (eUrl && !sUrl) {
    return { source: 'embed', isBackup: false };
  }
  if (/\.(m3u8|mp4|webm|mkv|mov)(?:[?#].*)?$/.test(sUrl)) {
    return { source: 'stream', isBackup: false };
  }
  return { source: 'manual', isBackup: false };
}

function extractEpNumber(text: string): number {
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function slugifyEpisode(name: string): string {
  if (!name.trim()) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
function evictCacheLocal(keyPattern: string): void {
  try {
    const keys = Object.keys(sessionStorage);
    for (const k of keys) {
      if (k.includes(keyPattern) || k.startsWith('detail_')) sessionStorage.removeItem(k);
    }
  } catch { /* quota */ }
}
function isHiddenEpisode(ep: MovieEpisode): boolean {
  return ep.is_hidden === true || ep.source === 'hidden';
}

function getEpisodeSourceKey(ep: MovieEpisode): string {
  if (isHiddenEpisode(ep)) return 'hidden';
  const source = String(ep.source || '').trim().toLowerCase();
  const server = String(ep.server_name || '').trim().toLowerCase();
  if (isQueerSourceText(`${source} ${server}`)) return 'queer';
  if (ep.source_origin === 'admin') return 'admin';
  if (source.includes('ophim') || server.includes('ophim')) return 'ophim';
  if (source.includes('kkphim') || server.includes('kkphim') || server.includes('phimapi')) return 'kkphim';
  return source || 'api';
}

function getEpisodeSourceLabel(key: string): string {
  if (key === 'admin') return 'Admin';
  if (key === 'queer') return 'Vũ trụ đam mỹ';
  if (key === 'ophim') return 'OPhim';
  if (key === 'kkphim') return 'KKPhim';
  if (key === 'hidden') return 'Đang ẩn';
  return key.toUpperCase();
}

function getSourceBadgeClass(key: string): string {
  if (key === 'admin') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (key === 'queer') return 'bg-pink-500/10 text-pink-300 border-pink-500/20';
  if (key === 'ophim') return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
  if (key === 'kkphim') return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
  if (key === 'hidden') return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
  return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
}

export default function EpisodeStreamForm({
  movieId,
  movieSlug,
  movieType,
  moviePoster,
  movieName,
  onDone,
}: Props) {
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState<MovieEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [currentMovieId, setCurrentMovieId] = useState(movieId);
  const [currentMovieSlug, setCurrentMovieSlug] = useState(movieSlug);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [epNumber, setEpNumber] = useState('');
  const [epTitle, setEpTitle] = useState('');
  const [epStream, setEpStream] = useState('');
  const [epEmbed, setEpEmbed] = useState('');
  const [epThumb, setEpThumb] = useState('');
  const [epDuration, setEpDuration] = useState('');
  const [epServer, setEpServer] = useState(DEFAULT_SERVER);
  const [epSubtitleFile, setEpSubtitleFile] = useState<File | null>(null);
  const [epSubtitleUrl, setEpSubtitleUrl] = useState('');
  const isSingle = movieType === 'phim-le' || movieType === 'phim-chieu-rap';

  useEffect(() => {
    setCurrentMovieId(movieId);
    setCurrentMovieSlug(movieSlug);
  }, [movieId, movieSlug]);

  const nextEpNumber = useMemo(() => {
    let max = 0;
    for (const ep of episodes) {
      if (isHiddenEpisode(ep)) continue;
      if (ep.episode_number > max) max = ep.episode_number;
    }
    return isSingle ? 0 : max + 1;
  }, [episodes, isSingle]);

  const visibleEpisodes = useMemo(() => episodes.filter((ep) => !isHiddenEpisode(ep)), [episodes]);

  const sourceSummaries = useMemo<SourceSummary[]>(() => {
    const map = new Map<string, SourceSummary>();
    for (const ep of episodes) {
      const key = getEpisodeSourceKey(ep);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: getEpisodeSourceLabel(key),
          count: 0,
          maxEpisode: 0,
          servers: [],
          hidden: 0,
        });
      }
      const summary = map.get(key)!;
      if (isHiddenEpisode(ep)) {
        summary.hidden += 1;
      } else {
        summary.count += 1;
        summary.maxEpisode = Math.max(summary.maxEpisode, Number(ep.episode_number || 0));
      }
      const serverName = ep.server_name || DEFAULT_SERVER;
      if (!summary.servers.includes(serverName)) summary.servers.push(serverName);
    }

    const priority = ['queer', 'admin', 'ophim', 'kkphim', 'api', 'hidden'];
    return Array.from(map.values()).sort((a, b) => {
      const ai = priority.includes(a.key) ? priority.indexOf(a.key) : priority.indexOf('api');
      const bi = priority.includes(b.key) ? priority.indexOf(b.key) : priority.indexOf('api');
      if (ai !== bi) return ai - bi;
      return b.count - a.count;
    });
  }, [episodes]);

  const apiMaxEpisode = useMemo(() => {
    return visibleEpisodes
      .filter((ep) => ep.source_origin !== 'admin')
      .reduce((max, ep) => Math.max(max, Number(ep.episode_number || 0)), 0);
  }, [visibleEpisodes]);

  const adminMaxEpisode = useMemo(() => {
    return visibleEpisodes
      .filter((ep) => ep.source_origin === 'admin')
      .reduce((max, ep) => Math.max(max, Number(ep.episode_number || 0)), 0);
  }, [visibleEpisodes]);


  const loadExisting = useCallback(async () => {
    setLoading(true);
    try {
      const { flatEpisodes } = await getMergedEpisodes(currentMovieId);
      setEpisodes(flatEpisodes);
      if (import.meta.env.DEV) console.log('[EpisodeStreamForm] Loaded merged episodes:', flatEpisodes.length, '(admin:', flatEpisodes.filter(e => e.source_origin === 'admin').length, ', ophim:', flatEpisodes.filter(e => e.source_origin === 'ophim').length, ')');
    } catch (e) {
      console.error('[EpisodeStreamForm] Load error:', e);
      setError('Lỗi tải danh sách tập hiện có');
    } finally {
      setLoading(false);
    }
  }, [currentMovieId]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const serverGroups = useMemo<ServerGroup[]>(() => {
    const groups = new Map<string, MovieEpisode[]>();
    for (const ep of episodes) {
      const name = ep.server_name || DEFAULT_SERVER;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(ep);
    }
    return Array.from(groups.entries()).map(([server_name, eps]) => ({ server_name, episodes: eps }));
  }, [episodes]);

  const handleDone = useCallback(async () => {
    // Evict ALL caches for this movie so detail page fetches fresh data
    evictAllMovieCaches(movieSlug);
    if (currentMovieSlug !== movieSlug) evictAllMovieCaches(currentMovieSlug);
    if (import.meta.env.DEV) console.log('[EpisodeStreamForm] Cache cleared, navigating to movie detail...');
    // Navigate directly to movie detail with forceRefresh flag
    navigate(`/phim/${currentMovieSlug}?fresh=${Date.now()}`, { replace: false });
  }, [currentMovieSlug, movieSlug, navigate]);

  const resetForm = () => {
    setEditingId(null);
    setEpNumber('');
    setEpTitle('');
    setEpStream('');
    setEpEmbed('');
    setEpThumb('');
    setEpDuration('');
    setEpServer(DEFAULT_SERVER);
    setShowForm(false);
    setError('');
    setEpSubtitleFile(null);
    setEpSubtitleUrl('');
  };

  const openNewEpisodeForm = (episodeNumber = nextEpNumber) => {
    setShowForm(true);
    setEditingId(null);
    setEpNumber(String(episodeNumber));
    setEpTitle(episodeNumber > 0 ? `Tap ${episodeNumber}` : 'Full');
    setEpStream('');
    setEpEmbed('');
    setEpThumb('');
    setEpDuration('');
    setEpServer(DEFAULT_SERVER);
    setEpSubtitleFile(null);
    setEpSubtitleUrl('');
    setError('');
    setSaveMsg('');
  };

  const handleEdit = (ep: MovieEpisode) => {
    if (isHiddenEpisode(ep)) return;
    setEditingId(ep.source_origin === 'admin' ? ep.id : null);
    setEpNumber(String(ep.episode_number));
    setEpTitle(ep.episode_name);
    setEpStream(ep.link_m3u8);
    setEpEmbed(ep.link_embed);
    setEpThumb(ep.thumbnail_url);
    setEpDuration(ep.duration);
    setEpSubtitleFile(null);
    setEpSubtitleUrl(ep.subtitle_url || '');
    setEpServer(ep.server_name || DEFAULT_SERVER);
    setShowForm(true);
    setError('');
    setSaveMsg(ep.source_origin === 'admin' ? '' : 'Đang tạo bản ghi đè trong Supabase. Link API gốc sẽ không bị sửa.');
  };

  const handleHideExternalEpisode = async (ep: MovieEpisode) => {
    if (isHiddenEpisode(ep)) return;
    let targetMovieId = currentMovieId;
    let targetMovieSlug = currentMovieSlug;
    if (!window.confirm(`Ẩn tập "${ep.episode_name}" khỏi server "${ep.server_name}"?`)) return;

    const token = getAdminToken();
    if (!token) {
      setError('Phiên đăng nhập admin đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSaving(true);
    setError('');
    setSaveMsg('');
    try {
      const payload: Record<string, unknown> = {
        movie_id: currentMovieId,
        episode_number: ep.episode_number,
        episode_name: ep.episode_name || (isSingle ? 'Full' : `Tập ${ep.episode_number}`),
        slug: ep.slug || (isSingle ? 'full' : `tap-${ep.episode_number}`),
        server_name: ep.server_name || DEFAULT_SERVER,
        link_m3u8: '',
        link_embed: '',
        thumbnail_url: ep.thumbnail_url || '',
        duration: ep.duration || '',
        source: 'hidden',
        is_backup: false,
        updated_at: new Date().toISOString(),
      };

      const res = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-episode-upsert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'insert', episode: payload }),
        }
      );
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        canonical_movie_id?: string;
        canonical_movie_slug?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi ẩn tập');
      }
      if (data.canonical_movie_id) targetMovieId = data.canonical_movie_id;
      if (data.canonical_movie_slug) targetMovieSlug = data.canonical_movie_slug;

      evictAllMovieCaches(movieSlug);
      if (targetMovieSlug && targetMovieSlug !== movieSlug) evictAllMovieCaches(targetMovieSlug);
      setCurrentMovieId(targetMovieId);
      setCurrentMovieSlug(targetMovieSlug);
      setSaveMsg(`Đã ẩn ${ep.episode_name}`);
      await loadExisting();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi ẩn tập');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSaveMsg('');
    let targetMovieId = currentMovieId;
    let targetMovieSlug = currentMovieSlug;

    if (!isSingle && !epNumber.trim()) {
      setError('Số tập không được để trống');
      return;
    }
    if (!epStream.trim() && !epEmbed.trim()) {
      setError('Vui lòng nhập ít nhất Stream URL hoặc Embed URL');
      return;
    }

    const num = isSingle ? 0 : (parseInt(epNumber.trim(), 10) || 0);
    const rawTitle = epTitle.trim();
    const slug = isSingle ? 'full' : (slugifyEpisode(rawTitle || `Tập ${num}`) || `tap-${num}`);
    const title = rawTitle || (isSingle ? 'Full' : `Tập ${num}`);
    const server = epServer.trim() || DEFAULT_SERVER;
    const { source, isBackup } = resolveSource(server, epStream.trim(), epEmbed.trim());
    if (epSubtitleFile) {
      const ext = epSubtitleFile.name.toLowerCase().split('.').pop();
      if (ext !== 'vtt' && ext !== 'srt') {
        setError('Chi ho tro phu de .vtt hoac .srt');
        return;
      }
      if (epSubtitleFile.size > 5 * 1024 * 1024) {
        setError('File phu de toi da 5MB');
        return;
      }
    }
    setSaving(true);
    if (import.meta.env.DEV) console.log('[EpisodeStreamForm] Saving episode', { movieId: currentMovieId, num, slug, title, server, source, isBackup });

    try {
      const payload: Record<string, unknown> = {
        movie_id: currentMovieId,
        episode_number: num,
        episode_name: title,
        slug,
        server_name: server,
        link_m3u8: normalizeVideoCdnUrl(epStream),
        link_embed: epEmbed.trim(),
        subtitle_url: epSubtitleUrl.trim(),
        thumbnail_url: epThumb.trim(),
        duration: epDuration.trim(),
        source,
        is_backup: isBackup,
        updated_at: new Date().toISOString(),
      };
      if (epSubtitleFile) {
        payload.subtitle_file_name = epSubtitleFile.name;
        payload.subtitle_file_type = epSubtitleFile.type || (epSubtitleFile.name.toLowerCase().endsWith('.vtt') ? 'text/vtt' : 'application/x-subrip');
        payload.subtitle_file_base64 = await fileToBase64(epSubtitleFile);
      }
      if (editingId) {
        const token = getAdminToken();
        if (!token) {
          setError('Phiên đăng nhập admin đã hết hạn. Vui lòng đăng nhập lại.');
          setSaving(false);
          return;
        }
        const res = await fetch(
          `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-episode-upsert`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'update', id: editingId, episode: payload }),
          }
        );
        const data = (await res.json()) as {
          success?: boolean;
          error?: string;
          canonical_movie_id?: string;
          canonical_movie_slug?: string;
        };
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Lỗi cập nhật tập');
        }
        if (data.canonical_movie_id) targetMovieId = data.canonical_movie_id;
        if (data.canonical_movie_slug) targetMovieSlug = data.canonical_movie_slug;
        if (import.meta.env.DEV) console.log('[EpisodeStreamForm] Updated episode id:', editingId);
      } else {
        // The Edge Function owns dedup/upsert with the service role. Avoid client-side
        // reads here because RLS or Supabase timeouts can block a valid admin save.
        const token = getAdminToken();
        if (!token) {
          setError('Phiên đăng nhập admin đã hết hạn. Vui lòng đăng nhập lại.');
          setSaving(false);
          return;
        }

        const res = await fetch(
          `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-episode-upsert`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'insert', episode: payload }),
          }
        );
        const data = (await res.json()) as {
          success?: boolean;
          error?: string;
          action?: string;
          canonical_movie_id?: string;
          canonical_movie_slug?: string;
        };
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Lỗi thêm tập');
        }
        if (data.canonical_movie_id) targetMovieId = data.canonical_movie_id;
        if (data.canonical_movie_slug) targetMovieSlug = data.canonical_movie_slug;
        if (import.meta.env.DEV) console.log('[EpisodeStreamForm] Saved episode via admin upsert:', data.action || 'insert');
      }

      // Update movie row with latest episode count from all sources
      try {
        const [{ data: allManual }, { data: allOphEps }, { data: allOphStr }, { data: scheduleMovie }] = await Promise.all([
          supabase.from('movie_episodes').select('episode_number, source').eq('movie_id', targetMovieId),
          supabase.from('episodes').select('server_data').eq('movie_id', targetMovieId),
          supabase.from('streams').select('episode_slug').eq('movie_id', targetMovieId).eq('is_active', true),
          supabase.from('movies').select('next_episode_name').eq('id', targetMovieId).maybeSingle(),
        ]);

        let maxEp = 0;

        for (const e of allManual ?? []) {
          if (e.source === 'hidden') continue;
          maxEp = Math.max(maxEp, e.episode_number);
        }
        for (const row of allOphEps ?? []) {
          for (const ep of (row.server_data ?? []) as Array<{ name?: string }>) {
            maxEp = Math.max(maxEp, extractEpNumber(ep.name || ''));
          }
        }
        for (const s of allOphStr ?? []) {
          maxEp = Math.max(maxEp, extractEpNumber(String(s.episode_slug || '')));
        }

        const updatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (isSingle) {
          updatePayload.episode_current = 'Full';
          updatePayload.episode_total = 'Full';
          updatePayload.current_episode = null;
          updatePayload.total_episodes = null;
          updatePayload.schedule_type = null;
          updatePayload.release_time = null;
          updatePayload.release_day = null;
          updatePayload.release_at = null;
          updatePayload.next_episode_at = null;
          updatePayload.next_episode_name = null;
          updatePayload.schedule_note = null;
        } else if (maxEp > 0) {
          updatePayload.episode_current = `Tập ${maxEp}`;
          updatePayload.episode_total = String(maxEp);
          updatePayload.current_episode = maxEp;
          updatePayload.total_episodes = maxEp;
          const scheduledEp = extractEpNumber(String((scheduleMovie as { next_episode_name?: string } | null)?.next_episode_name || ''));
          if (scheduledEp > 0 && maxEp >= scheduledEp) {
            updatePayload.next_episode_at = null;
            updatePayload.next_episode_name = null;
            updatePayload.schedule_note = null;
          }
        }

        const token = getAdminToken();
        if (token) {
          await fetch(
            `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-movie-upsert`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, action: 'update', id: targetMovieId, movie: updatePayload }),
            }
          );
        }
        if (import.meta.env.DEV) console.log('[EpisodeStreamForm] Updated movie episode_current to:', updatePayload.episode_current);
      } catch (updateErr) {
        console.warn('[EpisodeStreamForm] Failed to update movie episode count:', updateErr);
      }

      evictAllMovieCaches(movieSlug);
      if (targetMovieSlug && targetMovieSlug !== movieSlug) evictAllMovieCaches(targetMovieSlug);
      setCurrentMovieId(targetMovieId);
      setCurrentMovieSlug(targetMovieSlug);

      setSaveMsg(`Đã lưu ${title} (${slug}) — source: ${source}, backup: ${isBackup ? 'có' : 'không'} — cache đã xóa.`);
      resetForm();
      if (targetMovieId !== currentMovieId && targetMovieSlug) {
        navigate(`/phim/${targetMovieSlug}?fresh=${Date.now()}`, { replace: false });
        return;
      }
      await loadExisting();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
      console.error('[EpisodeStreamForm] Save error:', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEpisode = async (episodeId: number | string) => {
    const ep = episodes.find((e) => String(e.id) === String(episodeId) && e.source_origin === 'admin');
    if (!ep) {
      console.warn('[handleDeleteEpisode] Episode not found for id:', episodeId, 'available admin ids:', episodes.filter(e => e.source_origin === 'admin').map(e => ({ id: e.id, name: e.episode_name })));
      setError('Không tìm thấy tập để xóa — có thể đã bị xóa trước đó hoặc là tập OPhim.');
      return;
    }
    const isHidden = isHiddenEpisode(ep);
    const confirmText = isHidden
      ? `Bỏ ẩn tập "${ep.episode_name}" trên server "${ep.server_name}"?`
      : `Xóa tập "${ep.episode_name}" khỏi server "${ep.server_name}"?`;
    if (!window.confirm(confirmText)) return;

    setSaving(true);
    setError('');
    try {
      const token = getAdminToken();
      if (!token) {
        setError('Phiên đăng nhập admin đã hết hạn. Vui lòng đăng nhập lại.');
        setSaving(false);
        return;
      }
      const res = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-episode-upsert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'delete', id: episodeId }),
        }
      );
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi xóa tập');
      }

      setSaveMsg(isHidden ? `Đã bỏ ẩn ${ep.episode_name}` : `Đã xóa ${ep.episode_name}`);

      // Recalculate max episode from all sources after deletion
      try {
        const [{ data: allManual }, { data: allOphEps }, { data: allOphStr }] = await Promise.all([
          supabase.from('movie_episodes').select('episode_number, source').eq('movie_id', currentMovieId),
          supabase.from('episodes').select('server_data').eq('movie_id', currentMovieId),
          supabase.from('streams').select('episode_slug').eq('movie_id', currentMovieId).eq('is_active', true),
        ]);

        let maxEp = 0;
        for (const e of allManual ?? []) {
          if (e.source === 'hidden') continue;
          maxEp = Math.max(maxEp, e.episode_number);
        }
        for (const row of allOphEps ?? []) {
          for (const epItem of (row.server_data ?? []) as Array<{ name?: string }>) {
            maxEp = Math.max(maxEp, extractEpNumber(epItem.name || ''));
          }
        }
        for (const s of allOphStr ?? []) {
          maxEp = Math.max(maxEp, extractEpNumber(String(s.episode_slug || '')));
        }

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (isSingle) {
          updatePayload.episode_current = 'Full';
          updatePayload.episode_total = 'Full';
          updatePayload.current_episode = null;
          updatePayload.total_episodes = null;
          updatePayload.schedule_type = null;
          updatePayload.release_time = null;
          updatePayload.release_day = null;
        } else if (maxEp > 0) {
          updatePayload.episode_current = `Tập ${maxEp}`;
          updatePayload.episode_total = String(maxEp);
          updatePayload.current_episode = maxEp;
          updatePayload.total_episodes = maxEp;
        } else {
          updatePayload.episode_current = 'Trailer';
          updatePayload.episode_total = '0';
          updatePayload.current_episode = 0;
          updatePayload.total_episodes = 0;
        }

        const token = getAdminToken();
        if (token) {
          await fetch(
            `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-movie-upsert`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, action: 'update', id: currentMovieId, movie: updatePayload }),
            }
          );
        }
        if (import.meta.env.DEV) console.log('[handleDeleteEpisode] Updated movie episode_current to:', updatePayload.episode_current);
      } catch (updateErr) {
        console.warn('[handleDeleteEpisode] Failed to update movie episode count:', updateErr);
      }

      evictAllMovieCaches(movieSlug);
      if (currentMovieSlug !== movieSlug) evictAllMovieCaches(currentMovieSlug);
      await loadExisting();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi xóa tập');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full bg-white/[0.04] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-red-500/40 placeholder-white/15';
  const labelCls = 'text-white/40 text-[11px] mb-1.5 block';

  return (
    <div className="space-y-5">
      {movieName && (
        <div className="flex items-center gap-3 bg-[#131521] border border-white/[0.06] rounded-xl p-3">
          {moviePoster && (
            <div className="w-12 h-[72px] rounded-lg overflow-hidden bg-white/[0.03] flex-shrink-0">
              <img src={moviePoster} alt="poster" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">{movieName}</p>
            <p className="text-white/30 text-xs">ID: <span className="font-mono text-white/50">{movieId}</span></p>
            <p className="text-white/30 text-xs">Slug: <span className="font-mono text-white/50">{movieSlug}</span></p>
          </div>
          <Link
            to={`/phim/${movieSlug}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-external-link-line" /> Xem trên web
          </Link>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1 h-4 bg-red-500 rounded-full" />
            <p className="text-white/60 text-xs font-semibold">Danh sách tập hiện có</p>
            <span className="text-white/30 text-[11px]">({episodes.length} tập / {serverGroups.length} server)</span>
          </div>
          <button
            onClick={() => {
              if (showForm) {
                resetForm();
              } else {
                openNewEpisodeForm(nextEpNumber);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium transition-all cursor-pointer whitespace-nowrap"
          >
            <i className={showForm ? 'ri-subtract-line' : 'ri-add-line'} />
            {showForm ? 'Đóng form' : 'Thêm tập mới'}
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-white/30 py-4">
            <i className="ri-loader-4-line animate-spin text-sm" />
            <span className="text-xs">Đang tải danh sách tập...</span>
          </div>
        )}

        {!loading && episodes.length > 0 && (
          <div className="bg-[#131521] border border-white/[0.06] rounded-xl p-4 mb-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
              <div>
                <p className="text-white/70 text-xs font-bold flex items-center gap-2">
                  <i className="ri-dashboard-3-line text-red-400" />
                  Tổng quan tập phim
                </p>
                <p className="text-white/30 text-[11px] mt-1">
                  API cao nhất: {apiMaxEpisode ? `Tập ${apiMaxEpisode}` : 'chưa có'} · Admin cao nhất: {adminMaxEpisode ? `Tập ${adminMaxEpisode}` : 'chưa có'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openNewEpisodeForm(nextEpNumber)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 rounded-lg text-red-400 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line" />
                  {isSingle ? 'Thêm link Full' : `Thêm Tập ${nextEpNumber}`}
                </button>
                {!isSingle && apiMaxEpisode > 0 && apiMaxEpisode + 1 !== nextEpNumber && (
                  <button
                    onClick={() => openNewEpisodeForm(apiMaxEpisode + 1)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg text-sky-400 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-links-line" />
                    Thêm sau API: Tập {apiMaxEpisode + 1}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {sourceSummaries.map((summary) => (
                <div key={summary.key} className={`border rounded-lg p-3 ${getSourceBadgeClass(summary.key)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{summary.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20">
                      {summary.count} tập
                    </span>
                  </div>
                  <p className="text-[11px] mt-2 opacity-80">
                    Cao nhất: {summary.maxEpisode ? `Tập ${summary.maxEpisode}` : '-'}
                  </p>
                  <p className="text-[10px] mt-1 opacity-60 truncate" title={summary.servers.join(', ')}>
                    {summary.servers.join(', ') || 'Không có server'}
                  </p>
                  {summary.hidden > 0 && (
                    <p className="text-[10px] mt-1 opacity-80">{summary.hidden} tập đang ẩn</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && episodes.length === 0 && (
          <div className="bg-[#131521] border border-white/[0.06] rounded-xl p-5 text-center">
            <i className="ri-stack-line text-white/10 text-3xl mb-2" />
            <p className="text-white/30 text-xs">Chưa có tập nào. Nhấn "Thêm tập mới" để bắt đầu.</p>
          </div>
        )}

        {!loading && serverGroups.map((group) => (
          <div key={group.server_name} className="bg-[#131521] border border-white/[0.06] rounded-xl p-4 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <i className="ri-server-line text-white/30 text-sm" />
              <p className="text-white/50 text-xs font-semibold">{group.server_name}</p>
              <span className="text-white/20 text-[10px]">({group.episodes.length} tập)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {group.episodes.map((ep) => {
                const hidden = isHiddenEpisode(ep);
                const isExternal = ep.source_origin !== 'admin';
                return (
                  <div
                    key={`${ep.source_origin}-${ep.server_name}-${ep.slug}-${ep.episode_number}-${ep.id}`}
                    className={`flex items-center gap-2 bg-[#0d0f18] border rounded-lg px-3 py-2 ${
                      hidden ? 'border-orange-500/20 opacity-75' : 'border-white/[0.06]'
                    }`}
                  >
                    <div className="w-6 h-6 flex items-center justify-center rounded bg-white/[0.05] flex-shrink-0">
                      <span className="text-white/40 text-[10px] font-mono">{ep.episode_number || '-'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate ${hidden ? 'text-white/40 line-through' : 'text-white/80'}`}>{ep.episode_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {hidden && (
                          <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded">Đang ẩn</span>
                        )}
                        {ep.source && !hidden && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            ep.source === 'ophim' ? 'bg-sky-500/10 text-sky-400' :
                            ep.source === 'dailymotion' ? 'bg-pink-500/10 text-pink-400' :
                            ep.source === 'embed' ? 'bg-violet-500/10 text-violet-400' :
                            'bg-amber-500/10 text-amber-400'
                          }`}>
                            {ep.source}
                          </span>
                        )}
                        {isExternal && !hidden && (
                          <span className="text-[10px] bg-white/[0.06] text-white/30 px-1.5 py-0.5 rounded">API</span>
                        )}
                        {ep.is_backup && !hidden && (
                          <span className="text-[10px] bg-white/[0.06] text-white/30 px-1.5 py-0.5 rounded">backup</span>
                        )}
                        {ep.link_m3u8 && !hidden && (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">{ep.link_m3u8.toLowerCase().endsWith('.m3u8') ? 'HLS' : 'MP4'}</span>
                        )}
                        {ep.link_embed && !hidden && (
                          <span className="text-[10px] bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded">Embed</span>
                        )}
                        {ep.subtitle_url && !hidden && (
                          <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded">CC VI</span>
                        )}
                        {ep.duration && !hidden && (
                          <span className="text-[10px] bg-white/[0.06] text-white/40 px-1.5 py-0.5 rounded">{ep.duration}</span>
                        )}
                      </div>
                    </div>
                  {hidden ? (
                      <button
                        onClick={() => handleDeleteEpisode(ep.id)}
                        className="w-6 h-6 flex items-center justify-center rounded text-white/15 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all cursor-pointer flex-shrink-0"
                        title="Bỏ ẩn tập"
                      >
                        <i className="ri-eye-line text-xs" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleEdit(ep)}
                          className="w-6 h-6 flex items-center justify-center rounded text-white/15 hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer flex-shrink-0"
                          title={isExternal ? 'Sửa bằng bản ghi đè' : 'Sửa tập'}
                        >
                          <i className="ri-pencil-line text-xs" />
                        </button>
                        {isExternal ? (
                          <button
                            onClick={() => handleHideExternalEpisode(ep)}
                            className="w-6 h-6 flex items-center justify-center rounded text-white/15 hover:text-orange-400 hover:bg-orange-500/10 transition-all cursor-pointer flex-shrink-0"
                            title="Ẩn tập API"
                          >
                            <i className="ri-eye-off-line text-xs" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteEpisode(ep.id)}
                            className="w-6 h-6 flex items-center justify-center rounded text-white/15 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer flex-shrink-0"
                            title="Xóa tập"
                          >
                            <i className="ri-delete-bin-line text-xs" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-[#131521] border border-red-500/15 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/15 flex-shrink-0">
              <i className={`${editingId ? 'ri-pencil-line' : 'ri-add-line'} text-red-400 text-sm`} />
            </div>
            <p className="text-white/60 text-xs font-semibold">
              {editingId ? 'Sửa tập phim' : 'Thêm tập mới'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Số tập <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={epNumber}
                onChange={(e) => setEpNumber(e.target.value)}
                placeholder={isSingle ? '0' : '1'}
                disabled={isSingle}
                className={`${inputCls} ${isSingle ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>
            <div>
              <label className={labelCls}>Tên tập</label>
              <input
                type="text"
                value={epTitle}
                onChange={(e) => setEpTitle(e.target.value)}
                placeholder={isSingle ? 'Full' : 'Tập 1'}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Server name (nguồn)</label>
            <input
              type="text"
              value={epServer}
              onChange={(e) => setEpServer(e.target.value)}
              placeholder="Vietsub / Thuyết minh / Dailymotion..."
              className={inputCls}
            />
            <p className="text-white/20 text-[10px] mt-1">Mặc định "Vietsub". Nếu chứa "dailymotion" sẽ tự động gán source = dailymotion</p>
          </div>

          <div>
            <label className={labelCls}>
              Stream URL (.m3u8 / .mp4) <span className="text-red-400">*</span>{' '}
              <span className="text-white/20">hoặc Embed URL</span>
            </label>
            <input
              type="text"
              value={epStream}
              onChange={(e) => setEpStream(e.target.value)}
              placeholder="https://domain.com/playlist.m3u8"
              className={inputCls}
            />
            {epStream.trim().toLowerCase().endsWith('.m3u8') && (
              <p className="text-emerald-400/70 text-[10px] mt-1 flex items-center gap-1">
                <i className="ri-checkbox-circle-line" /> Phát bằng HLS.js (adaptive bitrate)
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>Embed URL (fallback)</label>
            <input
              type="text"
              value={epEmbed}
              onChange={(e) => setEpEmbed(e.target.value)}
              placeholder="https://domain.com/embed/xxx"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phu de tieng Viet (.vtt / .srt)</label>
              <input
                type="file"
                accept=".vtt,.srt,text/vtt,application/x-subrip,text/plain"
                onChange={(e) => setEpSubtitleFile(e.target.files?.[0] ?? null)}
                className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white/70 file:text-xs`}
              />
              {epSubtitleFile && (
                <p className="text-cyan-400/70 text-[10px] mt-1 flex items-center gap-1">
                  <i className="ri-closed-captioning-line" /> Upload: {epSubtitleFile.name}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>URL phu de da luu</label>
              <input
                type="text"
                value={epSubtitleUrl}
                onChange={(e) => setEpSubtitleUrl(e.target.value)}
                placeholder="Tu dong dien sau khi upload phu de"
                className={inputCls}
              />
              {epSubtitleUrl && !epSubtitleFile && (
                <p className="text-white/25 text-[10px] mt-1">Dang dung phu de da luu cho tap nay.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Thumbnail URL (tùy chọn)</label>
              <input
                type="text"
                value={epThumb}
                onChange={(e) => setEpThumb(e.target.value)}
                placeholder="https://..."
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Thời lượng (tùy chọn)</label>
              <input
                type="text"
                value={epDuration}
                onChange={(e) => setEpDuration(e.target.value)}
                placeholder="45 phút / 1h 30m"
                className={inputCls}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <i className="ri-error-warning-line" /> {error}
            </div>
          )}

          {saveMsg && (
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
              <i className="ri-checkbox-circle-line" /> {saveMsg}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              {saving ? (
                <><i className="ri-loader-4-line animate-spin" /> Đang lưu...</>
              ) : (
                <><i className={editingId ? 'ri-save-line' : 'ri-add-line'} /> {editingId ? 'Cập nhật tập' : 'Lưu tập mới'}</>
              )}
            </button>
            <button
              onClick={resetForm}
              disabled={saving}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/50 hover:text-white text-sm transition-all cursor-pointer whitespace-nowrap"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleDone}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 rounded-xl text-emerald-400 text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-check-line" /> Hoàn tất
          </button>
          <button
            onClick={() => loadExisting()}
            className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/50 hover:text-white text-sm transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line" /> Tải lại
          </button>
        </div>
      )}
    </div>
  );
}
