import { useEffect, useState } from 'react';
import { reportClientIssue } from '@/services/playerDiagnostics';

type OfflineStatus = 'online' | 'offline';

export default function OfflineIndicator() {
  const [status, setStatus] = useState<OfflineStatus>('online');
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let offlineTimer: number | null = null;
    let hideTimer: number | null = null;

    const showRecovered = () => {
      setStatus((previous) => {
        if (previous === 'offline') {
          reportClientIssue('online_recovered', 'browser recovered online');
          setVisible(true);
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = window.setTimeout(() => setVisible(false), 3000);
        }
        return 'online';
      });
    };

    const verifyAndRecover = () => {
      if (disposed) return;
      if (navigator.onLine) showRecovered();
    };

    const updateStatus = () => {
      if (!navigator.onLine) {
        if (offlineTimer) clearTimeout(offlineTimer);
        offlineTimer = window.setTimeout(() => {
          if (disposed || navigator.onLine) return;
          reportClientIssue('offline', 'browser reported offline');
          setStatus('offline');
          setVisible(true);
          setDismissed(false);
        }, 1800);
        return;
      }

      if (offlineTimer) clearTimeout(offlineTimer);
      showRecovered();
    };

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void verifyAndRecover();
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    window.addEventListener('focus', verifyAndRecover);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      disposed = true;
      if (offlineTimer) clearTimeout(offlineTimer);
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      window.removeEventListener('focus', verifyAndRecover);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, []);

  if (!visible || dismissed) return null;

  const config = {
    online: {
      icon: 'ri-wifi-line',
      text: 'Da ket noi lai internet',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/30',
      textColor: 'text-emerald-400',
      dotColor: 'bg-emerald-400',
    },
    offline: {
      icon: 'ri-wifi-off-line',
      text: 'Ket noi dang khong on dinh. Hay kiem tra internet roi tai lai trang neu can.',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/30',
      textColor: 'text-amber-400',
      dotColor: 'bg-amber-400',
    },
  }[status];

  return (
    <div
      className={`fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-[70] max-w-[90vw] sm:max-w-md ${config.bg} ${config.border} border rounded-xl px-4 py-3 flex items-center gap-3 shadow-xl`}
      style={{ animation: 'slideDownFade 0.3s ease-out' }}
      role="status"
      aria-live="polite"
    >
      <div className={`w-2 h-2 rounded-full ${config.dotColor} animate-pulse flex-shrink-0`} />
      <i className={`${config.icon} ${config.textColor} text-sm flex-shrink-0`} />
      <p className={`${config.textColor} text-xs sm:text-sm font-medium leading-snug`}>
        {config.text}
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors cursor-pointer"
        aria-label="Dong thong bao"
      >
        <i className="ri-close-line text-sm" />
      </button>
    </div>
  );
}
