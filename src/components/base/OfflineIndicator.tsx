import { useEffect, useState } from 'react';

type OfflineStatus = 'online' | 'offline';

export default function OfflineIndicator() {
  const [status, setStatus] = useState<OfflineStatus>('online');
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      if (!navigator.onLine) {
        setStatus('offline');
        setVisible(true);
        setDismissed(false);
        return;
      }

      setStatus((previous) => {
        if (previous === 'offline') {
          setVisible(true);
          window.setTimeout(() => setVisible(false), 3000);
        }
        return 'online';
      });
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
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
      text: 'Ban dang ngoai tuyen. Vui long kiem tra ket noi internet roi tai lai trang.',
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
