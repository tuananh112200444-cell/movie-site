import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '@/services/adminAuth';

const EDGE_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-content-health`;

interface ActionItem {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
}

interface MovieIssue {
  slug: string;
  name: string;
  source_site: string;
  updated_at: string | null;
  advertised?: number;
  playable?: number;
  missing_count?: number;
}

interface ContentHealthResponse {
  ok: boolean;
  generated_at: string;
  score: number;
  checked: {
    movies: number;
    episodes: number;
    admin_episodes: number;
    streams: number;
  };
  home_proxy: {
    ok: boolean;
    elapsed_ms: number;
    source: string;
    counts: Record<string, number>;
    failures: string[];
  };
  search_index: {
    ok: boolean;
    elapsed_ms: number;
    items: number;
    source: string;
    error: string | null;
  };
  missing_images: MovieIssue[];
  no_playable: MovieIssue[];
  episode_mismatches: MovieIssue[];
  action_items: ActionItem[];
  error?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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

function IssueTable({ title, icon, items, empty }: { title: string; icon: string; items: MovieIssue[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <i className={`${icon} text-white/45`} />
        <h2 className="text-sm font-bold text-white/78">{title}</h2>
        <span className="ml-auto rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/35">{items.length}</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-emerald-300/70">{empty}</p>
        ) : (
          items.slice(0, 20).map((movie) => (
            <div key={movie.slug} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[1fr_120px_120px_90px]">
              <div className="min-w-0">
                <Link to={`/phim/${movie.slug}`} className="truncate font-black text-white/78 hover:text-red-300">
                  {movie.name}
                </Link>
                <p className="mt-0.5 truncate text-white/35">{movie.source_site} · {formatDate(movie.updated_at)}</p>
              </div>
              <p className="text-white/45">Ngoai: <span className="text-white/78">{movie.advertised ?? '-'}</span></p>
              <p className="text-white/45">Trong: <span className="text-white/78">{movie.playable ?? '-'}</span></p>
              <Link to={`/phim/${movie.slug}`} className="text-red-300 hover:text-red-200">Mo phim</Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminContentHealthPage() {
  const [data, setData] = useState<ContentHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(EDGE_URL);
      const json = (await res.json()) as ContentHealthResponse;
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
      <title>Content Health - Admin | KhoPhim</title>
      <meta name="robots" content="noindex, nofollow" />

      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
              <i className="ri-arrow-left-line" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-base font-black text-white">
                <i className="ri-database-2-line text-violet-300" />
                Content Health
              </h1>
              <p className="mt-0.5 text-xs text-white/35">Kiem tra section, search index, anh poster va nguon phat local</p>
            </div>
          </div>
          <button onClick={fetchHealth} disabled={loading} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-white/55 transition-all hover:border-white/18 hover:text-white disabled:opacity-40">
            <i className={`${loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`} />
            Lam moi
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {error && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">Khong tai duoc content health: {error}</div>}

        {loading && !data ? (
          <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-8 text-center text-sm text-white/35">
            <i className="ri-loader-4-line mr-2 animate-spin" />
            Dang kiem tra du lieu phim...
          </div>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard icon="ri-heart-pulse-line" label="Diem data" value={`${data.score}%`} />
              <StatCard icon="ri-movie-2-line" label="Phim da quet" value={data.checked.movies} />
              <StatCard icon="ri-search-line" label="Search index" value={data.search_index.items} />
              <StatCard icon="ri-stack-line" label="Tap/stream doc" value={data.checked.episodes + data.checked.admin_episodes + data.checked.streams} />
              <StatCard icon="ri-image-line" label="Thieu anh" value={data.missing_images.length} />
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

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-white/78">Home sections</h2>
                  <span className={data.home_proxy.ok ? 'text-xs text-emerald-300' : 'text-xs text-red-300'}>{data.home_proxy.ok ? 'OK' : 'CAN SUA'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.home_proxy.counts).map(([section, count]) => (
                    <div key={section} className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <p className="truncate text-xs font-bold text-white/72">{section}</p>
                      <p className={count >= 6 ? 'text-sm font-black text-emerald-300' : 'text-sm font-black text-red-300'}>{count}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-white/35">source: {data.home_proxy.source} · {data.home_proxy.elapsed_ms}ms</p>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-white/78">Search index</h2>
                  <span className={data.search_index.ok ? 'text-xs text-emerald-300' : 'text-xs text-red-300'}>{data.search_index.ok ? 'OK' : 'CAN WARM'}</span>
                </div>
                <p className="text-3xl font-black text-white">{data.search_index.items}</p>
                <p className="mt-1 text-xs text-white/40">source: {data.search_index.source} · {data.search_index.elapsed_ms}ms</p>
                {data.search_index.error && <p className="mt-3 text-xs text-red-300">{data.search_index.error}</p>}
              </div>
            </div>

            <IssueTable title="Phim nghi hien sai so tap" icon="ri-error-warning-line" items={data.episode_mismatches} empty="Khong thay phim nghi hien sai so tap." />
            <IssueTable title="Phim thieu nguon phat local" icon="ri-play-circle-line" items={data.no_playable} empty="Khong thay phim thieu nguon phat trong mau kiem tra." />
            <IssueTable title="Phim thieu anh poster/thumb" icon="ri-image-line" items={data.missing_images} empty="Khong thay phim thieu anh trong mau kiem tra." />
          </>
        ) : null}
      </main>
    </div>
  );
}
