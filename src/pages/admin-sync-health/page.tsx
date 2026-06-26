import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '@/services/adminAuth';

const EDGE_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-sync-health`;

interface SyncStatus {
  function_name: string;
  last_run_at: string | null;
  last_run_hours_ago: number | null;
  latest_success: boolean | null;
  latest_scanned: number;
  latest_added: number;
  latest_errors: number;
  latest_elapsed_ms: number;
  recent_runs: number;
  recent_failures: number;
  status: 'ok' | 'missing' | 'stale' | 'unstable' | 'failed';
}

interface EpisodeMismatch {
  slug: string;
  name: string;
  source_site: string;
  expected_episode: number;
  actual_episode: number;
  missing_count: number;
  last_synced_at: string | null;
  updated_at: string | null;
}

interface StaleMovie {
  slug: string;
  name: string;
  source_site: string;
  episode_current: string | null;
  current_episode: number;
  last_synced_at: string | null;
  updated_at: string | null;
}

interface ActionItem {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
}

interface SyncHealthResponse {
  ok: boolean;
  generated_at: string;
  score: number;
  checked: {
    sync_logs: number;
    movies: number;
    episodes: number;
  };
  sync_status: SyncStatus[];
  suspected_episode_mismatches: EpisodeMismatch[];
  stale_movies: StaleMovie[];
  action_items: ActionItem[];
  error?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAge(hours: number | null): string {
  if (hours == null) return 'chua co';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} phut`;
  if (hours < 48) return `${Math.round(hours)} gio`;
  return `${Math.round(hours / 24)} ngay`;
}

function statusTone(status: SyncStatus['status']): string {
  if (status === 'ok') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  if (status === 'unstable') return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  return 'border-red-500/25 bg-red-500/10 text-red-200';
}

function severityTone(severity: ActionItem['severity']): string {
  if (severity === 'critical') return 'border-red-500/25 bg-red-500/10 text-red-100';
  if (severity === 'warning') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  return 'border-sky-500/20 bg-sky-500/10 text-sky-100';
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-white/50">
        <i className={icon} />
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-white/45">{label}</p>
    </div>
  );
}

export default function AdminSyncHealthPage() {
  const [data, setData] = useState<SyncHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(EDGE_URL);
      const json = (await res.json()) as SyncHealthResponse;
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <title>Sync Health - Admin | KhoPhim</title>
      <meta name="robots" content="noindex, nofollow" />

      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
              <i className="ri-arrow-left-line" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-base font-black text-white">
                <i className="ri-loop-left-line text-emerald-300" />
                Sync Health
              </h1>
              <p className="mt-0.5 text-xs text-white/35">Theo doi nguon phim, tap moi va cac phim co nguy co thieu tap</p>
            </div>
          </div>

          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-white/55 transition-all hover:border-white/18 hover:text-white disabled:opacity-40"
          >
            <i className={`${loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`} />
            Lam moi
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {error && (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Khong tai duoc sync health: {error}
          </div>
        )}

        {loading && !data ? (
          <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-8 text-center text-sm text-white/35">
            <i className="ri-loader-4-line mr-2 animate-spin" />
            Dang kiem tra he thong sync...
          </div>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon="ri-heart-pulse-line" label="Diem sync" value={`${data.score}%`} />
              <StatCard icon="ri-database-2-line" label="Log da doc" value={data.checked.sync_logs} />
              <StatCard icon="ri-movie-2-line" label="Phim da quet" value={data.checked.movies} />
              <StatCard icon="ri-stack-line" label="Tap da doi chieu" value={data.checked.episodes} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {data.action_items.map((item, index) => (
                <div key={`${item.title}-${index}`} className={`rounded-2xl border p-4 ${severityTone(item.severity)}`}>
                  <p className="text-sm font-black">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/62">{item.detail}</p>
                  <p className="mt-3 rounded-xl bg-black/18 px-3 py-2 text-xs leading-5 text-white/75">{item.action}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18]">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <i className="ri-timer-flash-line text-white/45" />
                <h2 className="text-sm font-bold text-white/78">Trang thai job sync</h2>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {data.sync_status.map((item) => (
                  <div key={item.function_name} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[1fr_110px_100px_100px_100px]">
                    <div className="min-w-0">
                      <p className="truncate font-black text-white/78">{item.function_name}</p>
                      <p className="mt-0.5 text-white/35">Lan chay cuoi: {formatDate(item.last_run_at)} ({formatAge(item.last_run_hours_ago)})</p>
                    </div>
                    <span className={`inline-flex h-7 w-fit items-center rounded-full border px-2.5 font-black uppercase ${statusTone(item.status)}`}>
                      {item.status}
                    </span>
                    <p className="text-white/45">Scan: <span className="text-white/75">{item.latest_scanned}</span></p>
                    <p className="text-white/45">Them: <span className="text-white/75">{item.latest_added}</span></p>
                    <p className="text-white/45">Loi: <span className="text-white/75">{item.latest_errors}</span></p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18]">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <i className="ri-error-warning-line text-red-300" />
                <h2 className="text-sm font-bold text-white/78">Phim nghi thieu tap</h2>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {data.suspected_episode_mismatches.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-emerald-300/70">Chua thay phim nghi thieu tap trong mau kiem tra.</p>
                ) : (
                  data.suspected_episode_mismatches.slice(0, 20).map((movie) => (
                    <div key={movie.slug} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[1fr_90px_90px_90px_120px]">
                      <div className="min-w-0">
                        <Link to={`/phim/${movie.slug}`} className="truncate font-black text-white/78 hover:text-red-300">
                          {movie.name}
                        </Link>
                        <p className="mt-0.5 text-white/35">{movie.source_site} · sync {formatDate(movie.last_synced_at)}</p>
                      </div>
                      <p className="text-white/45">Ngoai: <span className="text-white/80">{movie.expected_episode}</span></p>
                      <p className="text-white/45">Trong: <span className="text-white/80">{movie.actual_episode}</span></p>
                      <p className="text-red-300">Thieu {movie.missing_count}</p>
                      <Link to={`/phim/${movie.slug}`} className="text-red-300 hover:text-red-200">Mo phim</Link>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18]">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <i className="ri-time-line text-amber-300" />
                <h2 className="text-sm font-bold text-white/78">Phim lau chua sync lai</h2>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {data.stale_movies.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-emerald-300/70">Khong co phim stale trong mau kiem tra.</p>
                ) : (
                  data.stale_movies.slice(0, 20).map((movie) => (
                    <div key={movie.slug} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[1fr_120px_150px_100px]">
                      <div className="min-w-0">
                        <Link to={`/phim/${movie.slug}`} className="truncate font-black text-white/78 hover:text-amber-300">
                          {movie.name}
                        </Link>
                        <p className="mt-0.5 text-white/35">{movie.source_site} · {movie.episode_current || `Tap ${movie.current_episode}`}</p>
                      </div>
                      <p className="text-white/45">Sync: {formatDate(movie.last_synced_at)}</p>
                      <p className="text-white/45">Cap nhat: {formatDate(movie.updated_at)}</p>
                      <Link to={`/phim/${movie.slug}`} className="text-amber-300 hover:text-amber-200">Mo phim</Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
