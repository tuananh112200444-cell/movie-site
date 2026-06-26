import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '@/services/adminAuth';

const EDGE_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-site-health`;

interface CheckResult {
  key: string;
  label: string;
  url: string;
  group: 'page' | 'seo' | 'api';
  ok: boolean;
  status: number | null;
  elapsed_ms: number;
  error: string | null;
}

interface ActionItem {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
}

interface SiteHealthResponse {
  ok: boolean;
  generated_at: string;
  score: number;
  summary: {
    total: number;
    ok: number;
    failed: number;
    slow: number;
    avg_elapsed_ms: number;
  };
  results: CheckResult[];
  action_items: ActionItem[];
  error?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groupTone(group: CheckResult['group']): string {
  if (group === 'page') return 'bg-red-500/12 text-red-200 border-red-500/20';
  if (group === 'api') return 'bg-sky-500/12 text-sky-200 border-sky-500/20';
  return 'bg-emerald-500/12 text-emerald-200 border-emerald-500/20';
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

export default function AdminSiteHealthPage() {
  const [data, setData] = useState<SiteHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(EDGE_URL);
      const json = (await res.json()) as SiteHealthResponse;
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
      <title>Site Health - Admin | KhoPhim</title>
      <meta name="robots" content="noindex, nofollow" />

      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
              <i className="ri-arrow-left-line" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-base font-black text-white">
                <i className="ri-radar-line text-sky-300" />
                Site Health
              </h1>
              <p className="mt-0.5 text-xs text-white/35">Kiem tra route, sitemap va API quan trong theo thoi gian thuc</p>
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
            Khong tai duoc site health: {error}
          </div>
        )}

        {loading && !data ? (
          <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-8 text-center text-sm text-white/35">
            <i className="ri-loader-4-line mr-2 animate-spin" />
            Dang kiem tra web that...
          </div>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard icon="ri-heart-pulse-line" label="Diem site" value={`${data.score}%`} />
              <StatCard icon="ri-checkbox-circle-line" label="OK" value={`${data.summary.ok}/${data.summary.total}`} />
              <StatCard icon="ri-error-warning-line" label="Loi" value={data.summary.failed} />
              <StatCard icon="ri-timer-flash-line" label="Cham" value={data.summary.slow} />
              <StatCard icon="ri-speed-line" label="Trung binh" value={`${data.summary.avg_elapsed_ms}ms`} />
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
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                <div className="flex items-center gap-2">
                  <i className="ri-list-check-3 text-white/45" />
                  <h2 className="text-sm font-bold text-white/78">Ket qua kiem tra</h2>
                </div>
                <span className="text-[11px] text-white/35">Cap nhat {formatDate(data.generated_at)}</span>
              </div>

              <div className="divide-y divide-white/[0.04]">
                {data.results.map((item) => (
                  <div key={item.key} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[130px_1fr_100px_110px_90px]">
                    <span className={`inline-flex h-7 w-fit items-center rounded-full border px-2.5 font-black uppercase ${groupTone(item.group)}`}>
                      {item.group}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-white/78">{item.label}</p>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-white/30 hover:text-white/60">
                        {item.url}
                      </a>
                    </div>
                    <span className={item.ok ? 'text-emerald-300' : 'text-red-300'}>
                      {item.ok ? 'OK' : 'LOI'}
                    </span>
                    <span className="text-white/50">{item.status ?? '-'}</span>
                    <span className={item.elapsed_ms > 2500 ? 'text-amber-300' : 'text-white/70'}>{item.elapsed_ms}ms</span>
                    {item.error && <p className="md:col-span-5 text-red-300/75">{item.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
