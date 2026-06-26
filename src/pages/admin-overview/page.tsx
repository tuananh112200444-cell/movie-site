import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '@/services/adminAuth';

type Severity = 'critical' | 'warning' | 'info';

interface ActionItem {
  severity: Severity;
  title: string;
  detail: string;
  action: string;
  metric?: string;
}

interface HealthModule {
  key: 'site' | 'content' | 'sync' | 'player';
  title: string;
  href: string;
  icon: string;
  tone: string;
  score: number | null;
  loading: boolean;
  error: string | null;
  generatedAt: string | null;
  summary: string;
  stats: Array<{ label: string; value: string | number }>;
  actions: ActionItem[];
}

interface SiteHealthResponse {
  generated_at?: string;
  score?: number;
  summary?: {
    total?: number;
    ok?: number;
    failed?: number;
    slow?: number;
    avg_elapsed_ms?: number;
  };
  action_items?: ActionItem[];
  error?: string;
}

interface ContentHealthResponse {
  generated_at?: string;
  score?: number;
  checked?: {
    movies?: number;
    episodes?: number;
    admin_episodes?: number;
    streams?: number;
  };
  search_index?: {
    items?: number;
    elapsed_ms?: number;
  };
  missing_images?: unknown[];
  no_playable?: unknown[];
  episode_mismatches?: unknown[];
  action_items?: ActionItem[];
  error?: string;
}

interface SyncHealthResponse {
  generated_at?: string;
  score?: number;
  sync_status?: Array<{ status?: string }>;
  suspected_episode_mismatches?: unknown[];
  stale_movies?: unknown[];
  action_items?: ActionItem[];
  error?: string;
}

interface DiagnosticsResponse {
  generated_at?: string;
  summary?: {
    health_score?: number;
    total_events?: number;
    critical_events?: number;
    recovery_events?: number;
    window_hours?: number;
    action_items?: ActionItem[];
  };
  error?: string;
}

const ENDPOINTS = {
  site: `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-site-health`,
  content: `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-content-health`,
  sync: `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-sync-health`,
  player: `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-player-diagnostics?hours=24&limit=2000`,
};

const MODULE_META: Record<HealthModule['key'], Pick<HealthModule, 'title' | 'href' | 'icon' | 'tone'>> = {
  site: {
    title: 'Site Health',
    href: '/admin/site-health',
    icon: 'ri-radar-line',
    tone: 'from-sky-500/20 to-cyan-500/8 border-sky-500/20',
  },
  content: {
    title: 'Content Health',
    href: '/admin/content-health',
    icon: 'ri-database-2-line',
    tone: 'from-violet-500/20 to-fuchsia-500/8 border-violet-500/20',
  },
  sync: {
    title: 'Sync Health',
    href: '/admin/sync-health',
    icon: 'ri-loop-left-line',
    tone: 'from-emerald-500/20 to-teal-500/8 border-emerald-500/20',
  },
  player: {
    title: 'Player Diagnostics',
    href: '/admin/diagnostics',
    icon: 'ri-pulse-line',
    tone: 'from-red-500/20 to-orange-500/8 border-red-500/20',
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreTone(score: number | null): string {
  if (score == null) return 'text-white/35';
  if (score >= 90) return 'text-emerald-300';
  if (score >= 75) return 'text-amber-300';
  return 'text-red-300';
}

function healthLabel(score: number | null, error: string | null): string {
  if (error) return 'Can kiem tra';
  if (score == null) return 'Dang tai';
  if (score >= 95) return 'Rat tot';
  if (score >= 85) return 'Tot';
  if (score >= 75) return 'Can theo doi';
  return 'Can sua ngay';
}

function severityWeight(severity: Severity): number {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

function severityTone(severity: Severity): string {
  if (severity === 'critical') return 'border-red-500/25 bg-red-500/10 text-red-100';
  if (severity === 'warning') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  return 'border-sky-500/20 bg-sky-500/10 text-sky-100';
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await adminFetch(url);
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function buildInitialModule(key: HealthModule['key']): HealthModule {
  const meta = MODULE_META[key];
  return {
    key,
    ...meta,
    score: null,
    loading: true,
    error: null,
    generatedAt: null,
    summary: 'Dang kiem tra...',
    stats: [],
    actions: [],
  };
}

function buildSiteModule(data: SiteHealthResponse): HealthModule {
  const summary = data.summary ?? {};
  return {
    ...buildInitialModule('site'),
    loading: false,
    score: data.score ?? null,
    generatedAt: data.generated_at ?? null,
    summary: `${summary.ok ?? 0}/${summary.total ?? 0} endpoint OK, ${summary.failed ?? 0} loi, ${summary.slow ?? 0} cham`,
    stats: [
      { label: 'OK', value: `${summary.ok ?? 0}/${summary.total ?? 0}` },
      { label: 'Loi', value: summary.failed ?? 0 },
      { label: 'Cham', value: summary.slow ?? 0 },
      { label: 'Avg', value: `${summary.avg_elapsed_ms ?? 0}ms` },
    ],
    actions: data.action_items ?? [],
  };
}

function buildContentModule(data: ContentHealthResponse): HealthModule {
  const checked = data.checked ?? {};
  const issueCount = (data.missing_images?.length ?? 0) + (data.no_playable?.length ?? 0) + (data.episode_mismatches?.length ?? 0);
  return {
    ...buildInitialModule('content'),
    loading: false,
    score: data.score ?? null,
    generatedAt: data.generated_at ?? null,
    summary: `${checked.movies ?? 0} phim quet, ${data.search_index?.items ?? 0} phim trong search index`,
    stats: [
      { label: 'Phim', value: checked.movies ?? 0 },
      { label: 'Search', value: data.search_index?.items ?? 0 },
      { label: 'Tap/stream', value: (checked.episodes ?? 0) + (checked.admin_episodes ?? 0) + (checked.streams ?? 0) },
      { label: 'Van de', value: issueCount },
    ],
    actions: data.action_items ?? [],
  };
}

function buildSyncModule(data: SyncHealthResponse): HealthModule {
  const failedJobs = (data.sync_status ?? []).filter((item) => item.status && item.status !== 'ok').length;
  return {
    ...buildInitialModule('sync'),
    loading: false,
    score: data.score ?? null,
    generatedAt: data.generated_at ?? null,
    summary: `${data.sync_status?.length ?? 0} job sync, ${failedJobs} job can theo doi`,
    stats: [
      { label: 'Jobs', value: data.sync_status?.length ?? 0 },
      { label: 'Can theo doi', value: failedJobs },
      { label: 'Lech tap', value: data.suspected_episode_mismatches?.length ?? 0 },
      { label: 'Stale', value: data.stale_movies?.length ?? 0 },
    ],
    actions: data.action_items ?? [],
  };
}

function buildPlayerModule(data: DiagnosticsResponse): HealthModule {
  const summary = data.summary ?? {};
  return {
    ...buildInitialModule('player'),
    loading: false,
    score: summary.health_score ?? null,
    generatedAt: data.generated_at ?? null,
    summary: `${summary.total_events ?? 0} su kien/${summary.window_hours ?? 24}h, ${summary.critical_events ?? 0} loi nghiem trong`,
    stats: [
      { label: 'Events', value: summary.total_events ?? 0 },
      { label: 'Critical', value: summary.critical_events ?? 0 },
      { label: 'Recovery', value: summary.recovery_events ?? 0 },
      { label: 'Window', value: `${summary.window_hours ?? 24}h` },
    ],
    actions: summary.action_items ?? [],
  };
}

function ModuleCard({ module }: { module: HealthModule }) {
  return (
    <Link
      to={module.href}
      className={`group rounded-2xl border bg-gradient-to-br ${module.tone} p-4 transition-transform hover:-translate-y-0.5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/20 text-white/70">
            <i className={`${module.icon} text-xl`} />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">{module.title}</h2>
            <p className="mt-0.5 text-xs text-white/38">{formatDate(module.generatedAt)}</p>
          </div>
        </div>
        <i className="ri-arrow-right-up-line text-white/25 transition-colors group-hover:text-white/60" />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className={`text-4xl font-black leading-none ${scoreTone(module.score)}`}>
            {module.error ? '!' : module.loading ? '...' : `${module.score ?? 0}`}
          </p>
          <p className="mt-1 text-xs font-bold text-white/45">{healthLabel(module.score, module.error)}</p>
        </div>
        <div className="h-16 w-16 rounded-full border border-white/10 p-1">
          <div
            className="h-full rounded-full bg-white/[0.06]"
            style={{ background: `conic-gradient(rgb(52 211 153) ${module.score ?? 0}%, rgba(255,255,255,0.07) 0)` }}
          />
        </div>
      </div>

      <p className="mt-4 min-h-9 text-xs leading-5 text-white/58">
        {module.error ? module.error : module.summary}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {module.stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-black/18 px-3 py-2">
            <p className="text-[11px] text-white/35">{stat.label}</p>
            <p className="mt-0.5 text-sm font-black text-white/82">{stat.value}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}

export default function AdminOverviewPage() {
  const [modules, setModules] = useState<HealthModule[]>([
    buildInitialModule('site'),
    buildInitialModule('content'),
    buildInitialModule('sync'),
    buildInitialModule('player'),
  ]);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setModules([
      buildInitialModule('site'),
      buildInitialModule('content'),
      buildInitialModule('sync'),
      buildInitialModule('player'),
    ]);

    const builders = {
      site: async () => buildSiteModule(await fetchJson<SiteHealthResponse>(ENDPOINTS.site)),
      content: async () => buildContentModule(await fetchJson<ContentHealthResponse>(ENDPOINTS.content)),
      sync: async () => buildSyncModule(await fetchJson<SyncHealthResponse>(ENDPOINTS.sync)),
      player: async () => buildPlayerModule(await fetchJson<DiagnosticsResponse>(ENDPOINTS.player)),
    };

    const results = await Promise.all(
      (Object.keys(builders) as HealthModule['key'][]).map(async (key) => {
        try {
          return await builders[key]();
        } catch (error) {
          return {
            ...buildInitialModule(key),
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            summary: 'Khong tai duoc du lieu kiem tra.',
          };
        }
      }),
    );

    setModules(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const score = useMemo(() => {
    const available = modules.map((module) => module.score).filter((item): item is number => item != null);
    if (available.length === 0) return null;
    return Math.round(available.reduce((sum, item) => sum + item, 0) / available.length);
  }, [modules]);

  const actionItems = useMemo(() => {
    return modules
      .flatMap((module) => module.actions.map((item) => ({ ...item, source: module.title, href: module.href })))
      .sort((a, b) => severityWeight(a.severity) - severityWeight(b.severity))
      .slice(0, 10);
  }, [modules]);

  const failingModules = modules.filter((module) => module.error || (module.score != null && module.score < 85)).length;

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <title>Admin Overview | KhoPhim</title>
      <meta name="robots" content="noindex, nofollow" />

      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
              <i className="ri-arrow-left-line" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-base font-black text-white">
                <i className="ri-dashboard-3-line text-emerald-300" />
                Admin Overview
              </h1>
              <p className="mt-0.5 text-xs text-white/35">Mot man hinh de theo doi web, phim, sync va player</p>
            </div>
          </div>
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-white/55 transition-all hover:border-white/18 hover:text-white disabled:opacity-40"
          >
            <i className={`${loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`} />
            Lam moi
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <section className="rounded-3xl border border-white/[0.06] bg-[#0d0f18] p-5">
          <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/28">Tong quan he thong</p>
              <div className="mt-4 flex items-end gap-3">
                <p className={`text-7xl font-black leading-none ${scoreTone(score)}`}>{score ?? '...'}</p>
                <div className="pb-2">
                  <p className="text-sm font-black text-white">{healthLabel(score, null)}</p>
                  <p className="mt-1 text-xs text-white/40">{failingModules} module can theo doi</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-white/48">
                Diem nay la trung binh cua Site, Content, Sync va Player. Neu co muc can xu ly, no se hien ngay ben duoi.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {modules.map((module) => (
                <div key={module.key} className="rounded-2xl bg-white/[0.035] px-4 py-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-white/55">
                    <i className={module.icon} />
                    {module.title}
                  </div>
                  <p className={`text-2xl font-black ${scoreTone(module.score)}`}>
                    {module.error ? 'Loi' : module.loading ? '...' : `${module.score ?? 0}%`}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-white/32">{module.error || module.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {modules.map((module) => (
            <ModuleCard key={module.key} module={module} />
          ))}
        </section>

        <section className="rounded-2xl border border-white/[0.06] bg-[#0d0f18]">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-black text-white/80">
                <i className="ri-list-check-3 text-amber-300" />
                Viec can uu tien
              </h2>
              <p className="mt-0.5 text-xs text-white/35">Gom tu tat ca man hinh kiem tra de xu ly dung cho nghen.</p>
            </div>
            <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-white/35">
              {actionItems.length} muc
            </span>
          </div>

          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {actionItems.length === 0 ? (
              <div className="lg:col-span-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-5 text-center text-sm text-emerald-200">
                Chua co viec khan cap trong lan kiem tra nay.
              </div>
            ) : (
              actionItems.map((item, index) => (
                <Link
                  key={`${item.source}-${item.title}-${index}`}
                  to={item.href}
                  className={`rounded-xl border p-4 transition-transform hover:-translate-y-0.5 ${severityTone(item.severity)}`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="text-sm font-black">{item.title}</p>
                    <span className="shrink-0 rounded-full bg-black/18 px-2 py-0.5 text-[10px] font-black uppercase text-white/58">
                      {item.source}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-white/62">{item.detail}</p>
                  <p className="mt-3 rounded-lg bg-black/18 px-3 py-2 text-xs leading-5 text-white/72">{item.action}</p>
                </Link>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
