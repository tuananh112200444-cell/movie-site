import { Component, type ErrorInfo, type ReactNode } from 'react';

const RECOVERY_KEY = 'kp_app_recovery_20260705_v1';
const DOM_MUTATION_RECOVERY_KEY = 'kp_dom_mutation_recovery_20260705_v1';

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be blocked in some embedded browsers.
  }
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Best-effort only.
  }
}

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i.test(message);
}

function isExternalDomMutationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to execute '(insertBefore|removeChild)' on 'Node'|node before which the new node is to be inserted is not a child|node to be removed is not a child/i.test(message);
}

function reportClientIssue(eventType: 'chunk_load_error' | 'app_error', errorMessage: string): void {
  void import('@/services/playerDiagnostics')
    .then(({ reportClientIssue: report }) => report(eventType, errorMessage))
    .catch(() => {});
}

async function clearBrowserCaches() {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => /^(khophim|workbox)/i.test(name))
          .map((name) => caches.delete(name))
      );
    }
  } catch {
    // Cache cleanup is best-effort only.
  }
}

async function removeLegacyServiceWorkers() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // Best-effort only.
  }
}

function recoverWithFreshUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('__kp_recover', String(Date.now()));
  window.location.replace(url.toString());
}

function scheduleFreshRecovery(delayMs = 350) {
  window.setTimeout(recoverWithFreshUrl, delayMs);
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

    if (isExternalDomMutationError(error) && safeSessionGet(DOM_MUTATION_RECOVERY_KEY) !== '1') {
      safeSessionSet(DOM_MUTATION_RECOVERY_KEY, '1');
      scheduleFreshRecovery();
      return;
    }

    if (isChunkLoadError(error) && safeSessionGet(RECOVERY_KEY) !== '1') {
      safeSessionSet(RECOVERY_KEY, '1');
      scheduleFreshRecovery();
      Promise.all([clearBrowserCaches(), removeLegacyServiceWorkers()]).catch(() => {});
    }
  }

  handleRetry = () => {
    safeSessionRemove(RECOVERY_KEY);
    safeSessionRemove(DOM_MUTATION_RECOVERY_KEY);
    recoverWithFreshUrl();
    Promise.all([clearBrowserCaches(), removeLegacyServiceWorkers()]).catch(() => {});
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen kp-cinema-page text-white flex items-center justify-center px-6">
        <section className="cinema-empty-state max-w-lg text-center px-6 py-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300 ring-1 ring-red-300/20">
            <i className="ri-refresh-line text-2xl" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold mb-3">
            {isExternalDomMutationError(this.state.error) ? 'KhoPhim can tai lai trang' : 'KhoPhim dang tai lai'}
          </h1>
          <p className="text-white/70 text-sm leading-6 mb-6">
            {isExternalDomMutationError(this.state.error)
              ? 'Trinh duyet co the vua dich hoac can thiep noi dung trang. Bam mo lai de nap lai giao dien sach.'
              : 'Trinh duyet dang nap lai phien ban moi. Neu man hinh nay hien qua lau, bam nut ben duoi de mo lai trang.'}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              Mo lai trang
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
