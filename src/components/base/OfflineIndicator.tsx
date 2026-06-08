/**
 * ════════════════════════════════════════════
 *  OFFLINE INDICATOR
 *  Hiển thị thông báo khi người dùng đang offline
 *  hoặc đang sử dụng dữ liệu cache cũ
 * ════════════════════════════════════════════
 */
import { useState, useEffect } from 'react';

type OfflineStatus = 'online' | 'offline' | 'cached';

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
      } else {
        // Khi vừa online lại, hiển thị "đã kết nối" 3 giây
        if (status === 'offline') {
          setStatus('online');
          setVisible(true);
          setTimeout(() => setVisible(false), 3000);
        }
      }
    };

    // Kiểm tra cache status từ Service Worker
    const checkCacheStatus = async () => {
      if (!navigator.serviceWorker?.controller) return;
      try {
        const channel = new MessageChannel();
        navigator.serviceWorker.controller.postMessage(
          { type: 'GET_CACHE_STATUS' },
          [channel.port2]
        );
        channel.port1.onmessage = (event) => {
          if (event.data?.fromCache && status === 'online') {
            setStatus('cached');
            setVisible(true);
            setTimeout(() => setVisible(false), 4000);
          }
        };
      } catch {
        // Silent fail
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    // Kiểm tra mỗi 30 giây
    const interval = setInterval(checkCacheStatus, 30000);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      clearInterval(interval);
    };
  }, [status]);

  if (!visible || dismissed) return null;

  const config = {
    online: {
      icon: 'ri-wifi-line',
      text: 'Đã kết nối lại internet',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/30',
      textColor: 'text-emerald-400',
      dotColor: 'bg-emerald-400',
    },
    offline: {
      icon: 'ri-wifi-off-line',
      text: 'Bạn đang ngoại tuyến. Một số phim đã xem trước đó vẫn có thể xem được.',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/30',
      textColor: 'text-amber-400',
      dotColor: 'bg-amber-400',
    },
    cached: {
      icon: 'ri-database-2-line',
      text: 'Đang hiển thị dữ liệu đã lưu. Phim mới sẽ cập nhật khi có kết nối.',
      bg: 'bg-blue-500/15',
      border: 'border-blue-500/30',
      textColor: 'text-blue-400',
      dotColor: 'bg-blue-400',
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
        aria-label="Đóng thông báo"
      >
        <i className="ri-close-line text-sm" />
      </button>
    </div>
  );
}