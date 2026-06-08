import { Component, type ErrorInfo, type ReactNode } from 'react';

const RECOVERY_KEY = 'kp_chunk_recovery_v1';

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i.test(message);
}

async function clearBrowserCaches() {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('khophim-')).map((name) => caches.delete(name)));
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
      <main className="min-h-screen bg-[#080a10] text-white flex items-center justify-center px-6">
        <section className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-3">KhoPhim dang cap nhat</h1>
          <p className="text-white/70 text-sm leading-6 mb-6">
            Trinh duyet cua ban co the dang giu phien ban cu. Bam thu lai de tai phien ban moi nhat.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            Thu lai
          </button>
        </section>
      </main>
    );
  }
}
