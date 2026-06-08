import { useState, useCallback } from 'react';
import { adminChangePin, clearAdminAuth } from '@/services/adminAuth';

function getStrength(p: string): { label: string; color: string; pct: number } {
  if (!p) return { label: 'Chưa nhập', color: 'text-white/20', pct: 0 };
  let score = 0;
  if (p.length >= 6) score += 1;
  if (p.length >= 10) score += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1;
  if (/[0-9]/.test(p)) score += 1;
  if (/[^a-zA-Z0-9]/.test(p)) score += 1;
  if (score <= 1) return { label: 'Yếu', color: 'text-red-400', pct: 20 };
  if (score <= 2) return { label: 'Trung bình', color: 'text-amber-400', pct: 40 };
  if (score <= 3) return { label: 'Khá', color: 'text-yellow-400', pct: 60 };
  if (score <= 4) return { label: 'Mạnh', color: 'text-emerald-400', pct: 80 };
  return { label: 'Rất mạnh', color: 'text-emerald-500', pct: 100 };
}

export default function ChangePinPanel() {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const strength = getStrength(newPin);

  const reqs = [
    { ok: newPin.length >= 6, text: 'Ít nhất 6 ký tự' },
    { ok: /[a-zA-Z]/.test(newPin), text: 'Có ít nhất 1 chữ cái' },
    { ok: /[0-9]/.test(newPin), text: 'Có ít nhất 1 chữ số' },
    { ok: newPin !== currentPin && newPin.length > 0 && currentPin.length > 0, text: 'Khác mật khẩu hiện tại' },
    { ok: newPin === confirmPin && newPin.length > 0, text: 'Xác nhận khớp' },
  ];
  const allReqsMet = reqs.every((r) => r.ok);

  const handleSubmit = useCallback(async () => {
    setResult(null);
    if (!currentPin.trim()) { setResult({ type: 'error', message: 'Vui lòng nhập mật khẩu hiện tại' }); return; }
    if (newPin.length < 6) { setResult({ type: 'error', message: 'Mật khẩu mới phải có ít nhất 6 ký tự' }); return; }
    if (!/[a-zA-Z]/.test(newPin) || !/[0-9]/.test(newPin)) {
      setResult({ type: 'error', message: 'Mật khẩu phải chứa cả chữ cái và số' }); return;
    }
    if (newPin !== confirmPin) { setResult({ type: 'error', message: 'Mật khẩu xác nhận không khớp' }); return; }

    setLoading(true);
    const res = await adminChangePin(currentPin.trim(), newPin.trim());
    setLoading(false);

    if (res.success) {
      setResult({ type: 'success', message: res.message ?? 'Đổi mật khẩu thành công!' });
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
      setTimeout(() => { clearAdminAuth(); window.location.reload(); }, 2500);
    } else {
      setResult({ type: 'error', message: res.message ?? 'Đổi mật khẩu thất bại' });
    }
  }, [currentPin, newPin, confirmPin]);

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-white/50 hover:text-white text-xs transition-all cursor-pointer whitespace-nowrap"
      >
        <i className="ri-key-2-line" /> Bảo mật tài khoản
      </button>
    );
  }

  return (
    <div className="bg-[#0d0f18] border border-white/[0.06] rounded-xl p-5 w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <i className="ri-shield-keyhole-line text-rose-400" /> Đổi mật khẩu Admin
        </h3>
        <button
          onClick={() => setShowPanel(false)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          <i className="ri-close-line" />
        </button>
      </div>

      <div className="space-y-3.5">
        <div>
          <label className="text-white/40 text-[11px] mb-1.5 block">Mật khẩu hiện tại</label>
          <input
            type="password"
            value={currentPin}
            onChange={(e) => { setCurrentPin(e.target.value); setResult(null); }}
            placeholder="••••••"
            maxLength={32}
            className="w-full bg-white/[0.04] border border-white/10 text-white text-sm tracking-[0.2em] rounded-lg px-3 py-2.5 focus:outline-none focus:border-rose-500/40 placeholder-white/10 font-mono"
          />
        </div>

        <div>
          <label className="text-white/40 text-[11px] mb-1.5 block">Mật khẩu mới</label>
          <input
            type="password"
            value={newPin}
            onChange={(e) => { setNewPin(e.target.value); setResult(null); }}
            placeholder="••••••"
            maxLength={32}
            className="w-full bg-white/[0.04] border border-white/10 text-white text-sm tracking-[0.2em] rounded-lg px-3 py-2.5 focus:outline-none focus:border-rose-500/40 placeholder-white/10 font-mono"
          />
          {newPin && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-medium ${strength.color}`}>{strength.label}</span>
                <span className="text-white/20 text-[10px]">{strength.pct}%</span>
              </div>
              <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${
                  strength.pct <= 20 ? 'bg-red-500' :
                  strength.pct <= 40 ? 'bg-amber-500' :
                  strength.pct <= 60 ? 'bg-yellow-400' :
                  'bg-emerald-500'
                }`} style={{ width: `${strength.pct}%` }} />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-white/40 text-[11px] mb-1.5 block">Xác nhận mật khẩu mới</label>
          <input
            type="password"
            value={confirmPin}
            onChange={(e) => { setConfirmPin(e.target.value); setResult(null); }}
            placeholder="••••••"
            maxLength={32}
            className="w-full bg-white/[0.04] border border-white/10 text-white text-sm tracking-[0.2em] rounded-lg px-3 py-2.5 focus:outline-none focus:border-rose-500/40 placeholder-white/10 font-mono"
          />
        </div>

        {/* Checklist */}
        <div className="grid grid-cols-2 gap-1.5">
          {reqs.map((req, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <i className={`${req.ok ? 'ri-checkbox-circle-fill text-emerald-400' : 'ri-checkbox-blank-circle-line text-white/15'}`} />
              <span className={req.ok ? 'text-white/50' : 'text-white/25'}>{req.text}</span>
            </div>
          ))}
        </div>

        {result && (
          <div className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 ${
            result.type === 'success'
              ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border border-red-500/20'
          }`}>
            <i className={result.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} />
            {result.message}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !allReqsMet}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap"
        >
          {loading ? (
            <><i className="ri-loader-4-line animate-spin" /> Đang xử lý...</>
          ) : (
            <><i className="ri-save-line" /> Lưu mật khẩu mới</>
          )}
        </button>

        <p className="text-white/20 text-[10px] leading-relaxed">
          Sau khi đổi thành công, hệ thống tự động đăng xuất và yêu cầu đăng nhập lại bằng mật khẩu mới.
        </p>
      </div>
    </div>
  );
}