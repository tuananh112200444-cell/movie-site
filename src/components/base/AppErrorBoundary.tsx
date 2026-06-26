import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientIssue } from '@/services/playerDiagnostics';

const RECOVERY_KEY = 'kp_chunk_recovery_v1';

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i.test(message);
}

async function clearBrowserCaches() {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => /^khophim|workbox/i.test(name))
          .map((name) => caches.delete(name))
      );
    }
  } catch {
    // Cache cleanup is best-effort only.
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[AppErrorBoundary]', error, info);
    }

    reportClientIssue(
      isChunkLoadError(error) ? 'chunk_load_error' : 'app_error',
      error instanceof Error ? error.message : String(error ?? 'unknown app error'),
    );

    if (isChunkLoadError(error) && sessionStorage.getItem(RECOVERY_KEY) !== '1') {
      sessionStorage.setItem(RECOVERY_KEY, '1');
      clearBrowserCaches().finally(() => {
        window.location.reload();
      });
    }
  }

  handleRetry = () => {
    sessionStorage.removeItem(RECOVERY_KEY);
    clearBrowserCaches().finally(() => {
      window.location.reload();
    });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen kp-cinema-page text-white flex items-center justify-center px-6">
        <section className="cinema-empty-state max-w-lg text-center px-6 py-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300 ring-1 ring-red-300/20">
            <i className="ri-refresh-line text-2xl" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold mb-3">KhoPhim dang cap nhat</h1>
          <p className="text-white/70 text-sm leading-6 mb-6">
            Trinh duyet co the dang giu phien ban cu. Bam tai lai de nhan phien ban moi nhat.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              Tai lai phien ban moi
            </button>
            <a
              href="/"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              Ve trang chu
            </a>
          </div>
        </section>
      </main>
    );
  }
}
