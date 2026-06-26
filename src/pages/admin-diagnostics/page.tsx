import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '@/services/adminAuth';

const EDGE_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-player-diagnostics`;

interface CountItem {
  key: string;
  count: number;
}

interface CriticalEvent {
  id: number;
  created_at: string;
  movie_slug: string | null;
  movie_title: string | null;
  episode_name: string | null;
  server_name: string | null;
  event_type: string;
  player_mode: string | null;
  source_host: string | null;
  playback_time: number | null;
  buffered_ahead: number | null;
  error_message: string | null;
}

interface ActionItem {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  metric: string;
  action: string;
}

interface DiagnosticsSummary {
  window_hours: number;
  total_events: number;
  critical_events: number;
  recovery_events: number;
  health_score: number;
  top_events: CountItem[];
  top_hosts: CountItem[];
  top_servers: CountItem[];
  top_movies: CountItem[];
  player_modes: CountItem[];
  networks: CountItem[];
  hourly: CountItem[];
  recent_critical: CriticalEvent[];
  action_items?: ActionItem[];
}

interface DiagnosticsResponse {
  ok: boolean;
  generated_at: string;
  since: string;
  limit: number;
  summary: DiagnosticsSummary;
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

function formatPlaybackTime(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-300';
  if (score >= 70) return 'text-amber-300';
  return 'text-red-300';
}

function StatCard({
  icon,
  label,
  value,
  tone = 'white',
}: {
  icon: string;
  label: string;
  value: string | number;
  tone?: 'white' | 'red' | 'emerald' | 'amber' | 'sky';
}) {
  const toneClass = {
    white: 'text-white bg-white/[0.06] border-white/[0.08]',
    red: 'text-red-300 bg-red-500/10 border-red-500/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    sky: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-black/20">
        <i className={`${icon} text-lg`} />
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-white/45">{label}</p>
    </div>
  );
}

function RankingPanel({ title, icon, items }: { title: string; icon: string; items: CountItem[] }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <i className={`${icon} text-white/45`} />
        <h2 className="text-sm font-bold text-white/78">{title}</h2>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-white/28">Chưa có dữ liệu</p>
        ) : (
          items.slice(0, 8).map((item, index) => (
            <div key={`${item.key}-${index}`} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-xs font-black text-white/45">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/68">{item.key}</span>
              <span className="rounded-full bg-red-500/12 px-2 py-0.5 text-[11px] font-bold text-red-300">
                {item.count}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActionItemsPanel({ items }: { items: ActionItem[] }) {
  const tone = {
    critical: {
      icon: 'ri-alarm-warning-line',
      badge: 'bg-red-500/15 text-red-200 border-red-500/25',
      card: 'border-red-500/20 bg-red-500/[0.07]',
    },
    warning: {
      icon: 'ri-error-warning-line',
      badge: 'bg-amber-500/15 text-amber-200 border-amber-500/25',
      card: 'border-amber-500/20 bg-amber-500/[0.07]',
    },
    info: {
      icon: 'ri-information-line',
      badge: 'bg-sky-500/15 text-sky-200 border-sky-500/25',
      card: 'border-sky-500/20 bg-sky-500/[0.07]',
    },
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-white/80">
            <i className="ri-list-check-3 text-emerald-300" />
            Viec can xu ly truoc
          </h2>
          <p className="mt-0.5 text-xs text-white/40">
            He thong tu gom loi phat phim thanh cac hanh dong uu tien.
          </p>
        </div>
        <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-white/35">
          {items.length} muc
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item, index) => {
          const current = tone[item.severity];
          return (
            <div key={`${item.title}-${index}`} className={`rounded-xl border p-3 ${current.card}`}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <i className={`${current.icon} text-base text-white/70`} />
                  <h3 className="truncate text-sm font-black text-white/82">{item.title}</h3>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${current.badge}`}>
                  {item.metric}
                </span>
              </div>
              <p className="text-xs leading-5 text-white/58">{item.detail}</p>
              <p className="mt-2 rounded-lg bg-black/18 px-3 py-2 text-xs leading-5 text-white/72">{item.action}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminDiagnosticsPage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = new URL(EDGE_URL);
      url.searchParams.set('hours', String(hours));
      url.searchParams.set('limit', '2000');
      const res = await adminFetch(url.toString());
      const json = (await res.json()) as DiagnosticsResponse;
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  const summary = data?.summary;
  const maxHourly = useMemo(
    () => Math.max(1, ...(summary?.hourly ?? []).map((item) => item.count)),
    [summary?.hourly],
  );

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <title>Player Diagnostics - Admin | KhoPhim</title>
      <meta name="robots" content="noindex, nofollow" />

      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
              <i className="ri-arrow-left-line" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-base font-black text-white">
                <i className="ri-pulse-line text-red-400" />
                Player Diagnostics
              </h1>
              <p className="mt-0.5 text-xs text-white/35">Theo dõi phim, server và host đang gây đứng/lỗi phát phim</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
              className="h-9 rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 text-xs font-semibold text-white outline-none"
            >
              <option className="bg-[#0d0f18]" value={6}>6 giờ</option>
              <option className="bg-[#0d0f18]" value={24}>24 giờ</option>
              <option className="bg-[#0d0f18]" value={72}>3 ngày</option>
              <option className="bg-[#0d0f18]" value={168}>7 ngày</option>
            </select>
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-white/55 transition-all hover:border-white/18 hover:text-white disabled:opacity-40"
            >
              <i className={`${loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`} />
              Làm mới
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {error && (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Không tải được diagnostics: {error}
          </div>
        )}

        {loading && !summary ? (
          <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-8 text-center text-sm text-white/35">
            <i className="ri-loader-4-line mr-2 animate-spin" />
            Đang tải dữ liệu lỗi phát phim...
          </div>
        ) : summary ? (
          <>
            <ActionItemsPanel items={summary.action_items ?? []} />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard icon="ri-heart-pulse-line" label="Điểm ổn định" value={`${summary.health_score}%`} tone={summary.health_score >= 90 ? 'emerald' : summary.health_score >= 70 ? 'amber' : 'red'} />
              <StatCard icon="ri-bug-line" label={`Tổng sự kiện ${summary.window_hours}h`} value={summary.total_events} />
              <StatCard icon="ri-error-warning-line" label="Lỗi nghiêm trọng" value={summary.critical_events} tone={summary.critical_events > 0 ? 'red' : 'emerald'} />
              <StatCard icon="ri-restart-line" label="Tự hồi phục/retry" value={summary.recovery_events} tone="sky" />
              <StatCard icon="ri-time-line" label="Cập nhật lúc" value={data ? formatDate(data.generated_at) : '-'} tone="amber" />
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white/78">Nhịp lỗi theo giờ</h2>
                  <p className={`mt-0.5 text-xs ${scoreColor(summary.health_score)}`}>
                    Điểm càng cao nghĩa là tỷ lệ lỗi nghiêm trọng càng thấp.
                  </p>
                </div>
                <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/35">
                  Từ {data ? formatDate(data.since) : '-'}
                </span>
              </div>
              <div className="flex h-28 items-end gap-1 overflow-hidden rounded-xl bg-black/20 px-2 py-2">
                {summary.hourly.length === 0 ? (
                  <div className="flex h-full w-full items-center justify-center text-xs text-white/25">Chưa có lỗi trong khoảng này</div>
                ) : (
                  summary.hourly.map((item) => (
                    <div key={item.key} className="flex min-w-5 flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full rounded-t bg-red-500/70"
                        style={{ height: `${Math.max(8, (item.count / maxHourly) * 92)}px` }}
                        title={`${formatDate(item.key)}: ${item.count}`}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <RankingPanel title="Host lỗi nhiều" icon="ri-global-line" items={summary.top_hosts} />
              <RankingPanel title="Phim lỗi nhiều" icon="ri-movie-2-line" items={summary.top_movies} />
              <RankingPanel title="Loại lỗi" icon="ri-alert-line" items={summary.top_events} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <RankingPanel title="Server lỗi nhiều" icon="ri-server-line" items={summary.top_servers} />
              <RankingPanel title="Player mode" icon="ri-play-circle-line" items={summary.player_modes} />
              <RankingPanel title="Mạng khách" icon="ri-wifi-line" items={summary.networks} />
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0d0f18]">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <i className="ri-history-line text-white/45" />
                <h2 className="text-sm font-bold text-white/78">Lỗi nghiêm trọng gần nhất</h2>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {summary.recent_critical.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-emerald-300/70">Không có lỗi nghiêm trọng trong khoảng này.</p>
                ) : (
                  summary.recent_critical.map((event) => (
                    <div key={event.id} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[120px_1fr_160px_140px]">
                      <div className="text-white/35">{formatDate(event.created_at)}</div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white/75">{event.movie_title || event.movie_slug || 'Không rõ phim'}</p>
                        <p className="mt-0.5 truncate text-white/35">
                          {event.episode_name || '-'} · {event.server_name || '-'} · {event.source_host || '-'}
                        </p>
                        {event.error_message && <p className="mt-1 line-clamp-2 text-white/28">{event.error_message}</p>}
                      </div>
                      <div>
                        <span className="rounded-full bg-red-500/12 px-2 py-0.5 font-bold text-red-300">{event.event_type}</span>
                      </div>
                      <div className="text-white/35">
                        <p>Phút: {formatPlaybackTime(event.playback_time)}</p>
                        <p>Buffer: {event.buffered_ahead == null ? '-' : `${Number(event.buffered_ahead).toFixed(1)}s`}</p>
                        {event.movie_slug && (
                          <Link to={`/phim/${event.movie_slug}`} className="mt-1 inline-flex text-red-300 hover:text-red-200">
                            Mở phim
                          </Link>
                        )}
                      </div>
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
