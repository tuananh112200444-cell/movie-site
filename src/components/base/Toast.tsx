import { createContext, useContext, useState, useCallback, useRef } from 'react';

interface Toast { id: number; msg: string; type: 'success' | 'error' | 'info' }

interface ToastCtx { showToast: (msg: string, type?: Toast['type']) => void }
const Ctx = createContext<ToastCtx>({ showToast: () => {} });

export function useToast() { return useContext(Ctx); }

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((msg: string, type: Toast['type'] = 'success') => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, msg, type }]);
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, 3000);
    timers.current.set(id, t);
  }, []);

  return (
    <Ctx.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm text-white pointer-events-auto max-w-xs transition-all ${
              t.type === 'success' ? 'bg-green-600' :
              t.type === 'error'   ? 'bg-red-600'   : 'bg-[#1a1d27] border border-white/10'
            }`}
          >
            <i className={`text-base ${
              t.type === 'success' ? 'ri-checkbox-circle-line' :
              t.type === 'error'   ? 'ri-error-warning-line'   : 'ri-information-line'
            }`} />
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
