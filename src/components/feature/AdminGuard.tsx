import { supabase } from '../../lib/supabase';
import { clearAdminAuth, isAdminAuthenticated } from '@/services/adminAuth';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

interface AdminGuardProps {
  children: React.ReactNode;
}

interface LockInfo {
  locked: boolean;
  minutesLeft?: number;
  message: string;
}

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const [auth, setAuth] = useState(false);
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [pin, setPin] = useState('');
  const [setupPin1, setSetupPin1] = useState('');
  const [setupPin2, setSetupPin2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockInfo, setLockInfo] = useState<LockInfo | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [showLogout, setShowLogout] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);

  // Check existing auth on mount + detect setup mode
  useEffect(() => {
    if (isAdminAuthenticated()) {
      setAuth(true);
      return;
    }
    // Probe if setup is required
    checkSetupMode();
  }, []);

  async function checkSetupMode() {
    try {
      const url = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
      const res = await fetch(`${url}/functions/v1/admin-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const data = (await res.json()) as { setup_required?: boolean; error?: string; message?: string };
      if (!res.ok) {
        setMode('login');
        setError(data.message ?? data.error ?? 'Không kiểm tra được trạng thái admin. Vui lòng thử lại.');
        return;
      }

      if (data.setup_required === true) {
        setMode('setup');
        } else {
        setMode('login');
      }
    } catch {
      setMode('login');
      setError('Lỗi kết nối khi kiểm tra trạng thái admin.');
      // silently fallback to login
    }
  }

  // Countdown for lock
  useEffect(() => {
    if (!lockInfo?.locked || !lockInfo.minutesLeft) {
      setCountdown(0);
      return;
    }
    let totalSeconds = lockInfo.minutesLeft * 60;
    setCountdown(totalSeconds);
    const interval = setInterval(() => {
      totalSeconds -= 1;
      setCountdown(totalSeconds);
      if (totalSeconds <= 0) {
        clearInterval(interval);
        setLockInfo(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockInfo]);

  // Strength helper
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

  const strength = getStrength(mode === 'setup' ? setupPin1 : pin);

  const handleLogin = useCallback(async () => {
    if (!pin.trim()) { setError('Vui lòng nhập mật khẩu'); return; }
    if (lockInfo?.locked) return;

    setLoading(true); setError('');
    try {
      const url = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
      const res = await fetch(`${url}/functions/v1/admin-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const data = (await res.json()) as {
        token?: string; expiresAt?: number; setup_required?: boolean;
        locked?: boolean; minutesLeft?: number; message?: string; remaining?: number;
      };

      if (res.ok && data.token) {
        sessionStorage.setItem('kp_admin_token', data.token);
        sessionStorage.setItem('kp_admin_token_exp', String(data.expiresAt ?? 0));
        setAuth(true); setPin(''); setLockInfo(null);
        return;
      }

      if (data.setup_required) {
        setMode('setup'); setPin('');
        return;
      }

      if (data.locked) {
        setLockInfo({ locked: true, minutesLeft: data.minutesLeft, message: data.message ?? 'Tài khoản bị khóa.' });
        return;
      }

      setError(data.message ?? 'Mật khẩu không đúng');
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại');
    } finally { setLoading(false); }
  }, [pin, lockInfo]);

  const handleSetup = useCallback(async () => {
    setError('');
    if (setupPin1.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    if (!/[a-zA-Z]/.test(setupPin1) || !/[0-9]/.test(setupPin1)) {
      setError('Mật khẩu phải chứa cả chữ cái và số'); return;
    }
    if (setupPin1 !== setupPin2) { setError('Mật khẩu xác nhận không khớp'); return; }

    setLoading(true);
    try {
      const url = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
      const res = await fetch(`${url}/functions/v1/admin-change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPin: setupPin1, action: 'setup' }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; message?: string };

      if (res.ok && data.success) {
        setSetupSuccess(true);
        setTimeout(() => {
          clearAdminAuth();
          window.location.reload();
        }, 2500);
      } else if (res.status === 409) {
        setMode('login');
        setSetupPin1('');
        setSetupPin2('');
        setError(data.error ?? data.message ?? 'Mật khẩu admin đã tồn tại. Vui lòng đăng nhập.');  
      } else {
        setError(data.error ?? data.message ?? 'Thất bại');
      }
    } catch {
      setError('Lỗi kết nối');
    } finally { setLoading(false); }
  }, [setupPin1, setupPin2]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'setup') handleSetup();
      else handleLogin();
    }
  }, [mode, handleLogin, handleSetup]);

  const handleLogout = useCallback(() => {
    clearAdminAuth(); setAuth(false); setShowLogout(false); setMode('login');
  }, []);

  // ── RENDER LOGIN / SETUP GATE ──────────────────────────────────
  if (!auth) {
    return (
      <div className="min-h-screen kp-cinema-page flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-rose-500/15">
                <i className="ri-shield-keyhole-fill text-rose-400 text-xl" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base">
                  {mode === 'setup' ? 'Tạo mật khẩu Admin' : 'Khu vực Quản trị'}
                </h1>
                <p className="text-white/30 text-xs">
                  {mode === 'setup'
                    ? 'Thiết lập mật khẩu bảo mật lần đầu'
                    : 'Nhập mật khẩu để tiếp tục'}
                </p>
              </div>
            </div>

            {mode === 'setup' ? (
              <div className="space-y-4">
                {setupSuccess ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="w-14 h-14 flex items-center justify-center rounded-full bg-emerald-500/15">
                      <i className="ri-shield-check-line text-emerald-400 text-2xl" />
                    </div>
                    <p className="text-emerald-400 text-sm font-semibold text-center">Tạo mật khẩu thành công!</p>
                    <p className="text-white/30 text-xs text-center">Tự động chuyển sang đăng nhập...</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-amber-500/8 border border-amber-500/15 rounded-lg px-3 py-2.5">
                      <p className="text-amber-400/80 text-[11px] leading-relaxed">
                        <i className="ri-information-line mr-1" />
                        Chưa có mật khẩu admin. Vui lòng tạo mật khẩu mạnh để bảo vệ trang quản trị.
                      </p>
                    </div>

                    <div>
                      <label className="text-white/40 text-[11px] mb-1.5 block">Mật khẩu mới</label>
                      <input
                        type="password"
                        value={setupPin1}
                        onChange={(e) => { setSetupPin1(e.target.value); setError(''); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Nhập mật khẩu..."
                        maxLength={32}
                        autoFocus
                        className="w-full bg-white/[0.04] border border-white/10 text-white text-sm tracking-[0.15em] rounded-xl px-4 py-3 focus:outline-none focus:border-rose-500/40 placeholder-white/10 font-mono"
                      />
                      {setupPin1 && (
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
                      <label className="text-white/40 text-[11px] mb-1.5 block">Xác nhận mật khẩu</label>
                      <input
                        type="password"
                        value={setupPin2}
                        onChange={(e) => { setSetupPin2(e.target.value); setError(''); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Nhập lại mật khẩu..."
                        maxLength={32}
                        className="w-full bg-white/[0.04] border border-white/10 text-white text-sm tracking-[0.15em] rounded-xl px-4 py-3 focus:outline-none focus:border-rose-500/40 placeholder-white/10 font-mono"
                      />
                    </div>

                    {/* Requirements checklist */}
                    <div className="space-y-1.5">
                      {[
                        { ok: setupPin1.length >= 6, text: 'Ít nhất 6 ký tự' },
                        { ok: /[a-zA-Z]/.test(setupPin1), text: 'Có ít nhất 1 chữ cái' },
                        { ok: /[0-9]/.test(setupPin1), text: 'Có ít nhất 1 chữ số' },
                        { ok: setupPin1 === setupPin2 && setupPin1.length > 0, text: 'Mật khẩu xác nhận khớp' },
                      ].map((req, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <i className={`${req.ok ? 'ri-checkbox-circle-fill text-emerald-400' : 'ri-checkbox-blank-circle-line text-white/15'}`} />
                          <span className={req.ok ? 'text-white/50' : 'text-white/25'}>{req.text}</span>
                        </div>
                      ))}
                    </div>

                    {error && (
                      <div className="flex items-center gap-1.5 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        <i className="ri-error-warning-line" /> {error}
                      </div>
                    )}

                    <button
                      onClick={handleSetup}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
                    >
                      {loading ? (
                        <><i className="ri-loader-4-line animate-spin" /> Đang xử lý...</>
                      ) : (
                        <><i className="ri-shield-check-line" /> Tạo mật khẩu bảo mật</>
                      )}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-white/40 text-[11px] mb-1.5 block">Mật khẩu Admin</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setError(''); if (lockInfo) setLockInfo(null); }}
                    onKeyDown={handleKeyDown}
                    placeholder="••••••"
                    maxLength={32}
                    autoFocus
                    disabled={lockInfo?.locked ?? false}
                    className="w-full bg-white/[0.04] border border-white/10 text-white text-center text-lg tracking-[0.3em] rounded-xl px-4 py-3 focus:outline-none focus:border-rose-500/40 placeholder-white/10 font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>

                {lockInfo?.locked && (
                  <div className="flex flex-col gap-1 text-xs rounded-lg px-3 py-2.5 text-amber-400 bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-1.5">
                      <i className="ri-lock-line" />
                      <span className="font-semibold">Tài khoản tạm khóa</span>
                    </div>
                    <p className="leading-relaxed pl-5">{lockInfo.message}</p>
                    {countdown > 0 && (
                      <p className="text-[11px] pl-5 opacity-60">
                        Còn lại: <span className="font-mono font-semibold">{formatSeconds(countdown)}</span>
                      </p>
                    )}
                  </div>
                )}

                {error && !lockInfo?.locked && (
                  <div className="flex items-center gap-1.5 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <i className="ri-error-warning-line" /> {error}
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  disabled={loading || !pin.trim() || (lockInfo?.locked ?? false)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  {loading ? (
                    <><i className="ri-loader-4-line animate-spin" /> Đang xác thực...</>
                  ) : (
                    <><i className="ri-login-box-line" /> Đăng nhập</>
                  )}
                </button>
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-white/[0.06] text-center">
              <a href="/" className="inline-flex items-center gap-1.5 text-white/30 hover:text-white/60 text-xs transition-colors">
                <i className="ri-arrow-left-line" /> Quay lại trang chủ
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── AUTHENTICATED → render children + admin dropdown ─────────────
  return (
    <>
      <div className="fixed top-3 right-3 z-[200]">
        <button
          onClick={() => setShowLogout(!showLogout)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] rounded-lg text-white/40 hover:text-white text-xs transition-all cursor-pointer whitespace-nowrap"
        >
          <i className="ri-shield-check-line text-emerald-400" />
          <span>Admin</span>
          <i className={`ri-arrow-down-s-line transition-transform ${showLogout ? 'rotate-180' : ''}`} />
        </button>

        {showLogout && (
          <div className="absolute right-0 top-full mt-1 bg-[#0d0f18] border border-white/[0.08] rounded-xl p-1 min-w-[180px] z-[201] shadow-xl">
            <Link to="/admin/add-movie" onClick={() => setShowLogout(false)} className="w-full flex items-center gap-2 px-3 py-2 text-white/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-movie-2-line" /> Add Movie
            </Link>
            <Link to="/admin/banner" onClick={() => setShowLogout(false)} className="w-full flex items-center gap-2 px-3 py-2 text-white/60 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-bar-chart-box-line" /> Banner Stats
            </Link>
            <Link to="/admin/reviews" onClick={() => setShowLogout(false)} className="w-full flex items-center gap-2 px-3 py-2 text-white/60 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-quill-pen-line" /> Reviews
            </Link>
            <Link to="/admin/seo" onClick={() => setShowLogout(false)} className="w-full flex items-center gap-2 px-3 py-2 text-white/60 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-seo-line" /> SEO Tools
            </Link>
            <Link to="/admin/ping" onClick={() => setShowLogout(false)} className="w-full flex items-center gap-2 px-3 py-2 text-white/60 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-radar-line" /> Ping Status
            </Link>
            <div className="my-1 border-t border-white/[0.06]" />
            <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-logout-box-r-line" /> Đăng xuất admin
            </button>
          </div>
        )}
      </div>

      {showLogout && <div className="fixed inset-0 z-[199]" onClick={() => setShowLogout(false)} />}

      {children}
    </>
  );
}