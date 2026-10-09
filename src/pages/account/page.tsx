import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import SEO from '@/components/base/SEO';
import { useAuth } from '@/context/AuthContext';
import { ACCOUNT_DATA_CHANGED_EVENT } from '@/services/accountSync';

type FormMode = 'signin' | 'signup' | 'forgot' | 'recovery';

function formMode(value: string | null): FormMode {
  return value === 'signup' || value === 'forgot' || value === 'recovery' ? value : 'signin';
}

function passwordRequirements(password: string) {
  return {
    length: password.length >= 8,
    letter: /[a-z]/i.test(password),
    number: /\d/.test(password),
  };
}

function readLocalCounts() {
  try {
    const favorites = JSON.parse(localStorage.getItem('kp_favorites') || '[]');
    const history = JSON.parse(localStorage.getItem('kp_watch_history') || '[]');
    const comments = Object.keys(localStorage)
      .filter((key) => key.startsWith('khophim_comments_'))
      .reduce((total, key) => {
        try {
          const value = JSON.parse(localStorage.getItem(key) || '[]');
          return total + (Array.isArray(value) ? value.length : 0);
        } catch { return total; }
      }, 0);
    return {
      favorites: Array.isArray(favorites) ? favorites.length : 0,
      history: Array.isArray(history) ? history.length : 0,
      comments,
    };
  } catch {
    return { favorites: 0, history: 0, comments: 0 };
  }
}

export default function AccountPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user, loading, syncStatus, syncError, passwordRecoveryActive, googleAuthEnabled,
    signIn, signUp, resendConfirmation, signInWithGoogle, requestPasswordReset, updatePassword, signOut, syncNow,
  } = useAuth();
  const [mode, setMode] = useState<FormMode>(() => formMode(searchParams.get('mode')));
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [counts, setCounts] = useState(readLocalCounts);

  useEffect(() => {
    setMode(formMode(searchParams.get('mode')));
  }, [searchParams]);

  useEffect(() => {
    if (passwordRecoveryActive) setMode('recovery');
  }, [passwordRecoveryActive]);

  useEffect(() => {
    const refresh = () => setCounts(readLocalCounts());
    window.addEventListener(ACCOUNT_DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ACCOUNT_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const accountName = useMemo(() => String(
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Thành viên KhoPhim'
  ), [user]);
  const requirements = useMemo(() => passwordRequirements(password), [password]);
  const strongPassword = requirements.length && requirements.letter && requirements.number;

  const changeMode = (nextMode: FormMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
    setPasswordVisible(false);
    setAwaitingConfirmation(false);
    const next = nextMode === 'signin' ? '/tai-khoan' : `/tai-khoan?mode=${nextMode}`;
    navigate(next, { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email);
        setMessage('Nếu email đã được đăng ký, KhoPhim đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra cả thư rác.');
      } else if (mode === 'recovery') {
        if (!strongPassword) throw new Error('Mật khẩu cần ít nhất 8 ký tự, gồm chữ và số.');
        if (password !== confirmPassword) throw new Error('Hai mật khẩu chưa trùng nhau.');
        await updatePassword(password);
        setMessage('Đã đổi mật khẩu thành công.');
        window.setTimeout(() => navigate('/tai-khoan', { replace: true }), 900);
      } else if (mode === 'signin') {
        await signIn(email, password);
      } else {
        if (displayName.trim().length < 2) throw new Error('Tên hiển thị cần ít nhất 2 ký tự.');
        if (!strongPassword) throw new Error('Mật khẩu cần ít nhất 8 ký tự, gồm chữ và số.');
        if (password !== confirmPassword) throw new Error('Hai mật khẩu chưa trùng nhau.');
        if (!privacyAccepted) throw new Error('Bạn cần đồng ý với chính sách bảo mật và điều khoản sử dụng.');
        const result = await signUp(email, password, displayName);
        if (result.needsEmailConfirmation) {
          setMessage('Đã tạo tài khoản. Hãy mở email để xác nhận rồi đăng nhập.');
          setAwaitingConfirmation(true);
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể xử lý yêu cầu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setError('');
    try { await signInWithGoogle(); }
    catch (googleError) { setError(googleError instanceof Error ? googleError.message : 'Không thể đăng nhập Google.'); }
    finally { setSubmitting(false); }
  };

  const handleResendConfirmation = async () => {
    setSubmitting(true);
    setError('');
    try {
      await resendConfirmation(email);
      setMessage('Đã gửi lại email xác nhận. Hãy kiểm tra hộp thư đến và thư rác.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Không thể gửi lại email xác nhận.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    setError('');
    try { await signOut(); }
    catch (signOutError) { setError(signOutError instanceof Error ? signOutError.message : 'Không thể đăng xuất.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title="Tài khoản và đồng bộ thiết bị"
        description="Đăng nhập KhoPhim để đồng bộ lịch sử xem, phim yêu thích và bình luận riêng giữa điện thoại và máy tính."
        canonical="/tai-khoan"
        noIndex
      />
      <Navbar />

      <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300">
            <i className="ri-shield-user-line" /> Tài khoản KhoPhim
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Xem tiếp trên mọi thiết bị</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 md:text-base">
            Bạn vẫn có thể xem phim khi chưa đăng nhập. Tài khoản chỉ dùng để giữ dữ liệu cá nhân khi đổi điện thoại, máy tính hoặc trình duyệt.
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-white/[0.07] bg-[#0d0f18]">
            <div className="flex items-center gap-3 text-sm text-white/50">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-red-400" />
              Đang kiểm tra tài khoản...
            </div>
          </div>
        ) : mode === 'recovery' ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-white/[0.07] bg-[#0d0f18] p-5 md:p-8">
            <button type="button" onClick={() => changeMode('signin')} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-white/45 transition hover:text-white">
              <i className="ri-arrow-left-line" /> Quay lại đăng nhập
            </button>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-xl text-red-400"><i className="ri-lock-password-line" /></div>
            <h2 className="mt-4 text-2xl font-black">Đặt mật khẩu mới</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">Liên kết khôi phục chỉ dùng được một lần và sẽ hết hạn vì lý do bảo mật.</p>
            {user ? (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/50">Mật khẩu mới</span>
                  <div className="relative">
                    <input type={passwordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Ít nhất 8 ký tự, gồm chữ và số" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 pr-12 text-sm outline-none transition placeholder:text-white/20 focus:border-red-500/50" />
                    <button type="button" onClick={() => setPasswordVisible((value) => !value)} aria-label={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-white/35 hover:text-white"><i className={passwordVisible ? 'ri-eye-off-line' : 'ri-eye-line'} /></button>
                  </div>
                </label>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  {[['8+ ký tự', requirements.length], ['Có chữ', requirements.letter], ['Có số', requirements.number]].map(([label, valid]) => <span key={String(label)} className={`rounded-lg px-2 py-1.5 text-center ${valid ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/[0.04] text-white/30'}`}>{valid ? '✓ ' : ''}{label}</span>)}
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/50">Nhập lại mật khẩu</span>
                  <input type={passwordVisible ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm outline-none transition placeholder:text-white/20 focus:border-red-500/50" />
                </label>
                {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">{error}</div>}
                {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-200">{message}</div>}
                <button disabled={submitting || !strongPassword || password !== confirmPassword} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-40"><i className="ri-shield-keyhole-line" /> Lưu mật khẩu mới</button>
              </form>
            ) : (
              <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] p-4 text-sm text-amber-100/75">
                Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy gửi một yêu cầu mới.
                <button type="button" onClick={() => changeMode('forgot')} className="mt-3 block font-bold text-amber-200 underline underline-offset-4">Gửi lại liên kết</button>
              </div>
            )}
          </div>
        ) : user ? (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-3xl border border-white/[0.07] bg-[#0d0f18] p-5 md:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-xl font-black shadow-lg shadow-red-950/40">
                    {accountName.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-lg font-bold">{accountName}</p>
                    <p className="mt-0.5 text-sm text-white/40">{user.email}</p>
                  </div>
                </div>
                <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  syncStatus === 'synced'
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                    : syncStatus === 'error'
                      ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                      : 'border-sky-500/25 bg-sky-500/10 text-sky-300'
                }`}>
                  <i className={syncStatus === 'synced' ? 'ri-cloud-fill' : syncStatus === 'error' ? 'ri-cloud-off-line' : 'ri-loader-4-line animate-spin'} />
                  {syncStatus === 'synced' ? 'Đã đồng bộ' : syncStatus === 'error' ? 'Cần thử lại' : 'Đang đồng bộ'}
                </div>
              </div>

              <div className="mt-7 grid grid-cols-3 gap-2.5">
                {[
                  { label: 'Yêu thích', value: counts.favorites, icon: 'ri-heart-3-fill', color: 'text-rose-400' },
                  { label: 'Lịch sử', value: counts.history, icon: 'ri-history-line', color: 'text-sky-400' },
                  { label: 'Bình luận riêng', value: counts.comments, icon: 'ri-chat-3-line', color: 'text-amber-400' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-center md:p-4">
                    <i className={`${item.icon} ${item.color} text-lg`} />
                    <div className="mt-2 text-2xl font-black">{item.value}</div>
                    <div className="mt-1 text-[11px] text-white/35 md:text-xs">{item.label}</div>
                  </div>
                ))}
              </div>

              {syncStatus === 'error' && (
                <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] p-4 text-sm text-amber-100/80">
                  <p className="font-semibold">Dữ liệu trên máy vẫn an toàn.</p>
                  <p className="mt-1 text-xs leading-5 text-amber-100/55">Chưa thể kết nối kho đồng bộ. Bạn có thể thử lại khi mạng ổn định.</p>
                  {import.meta.env.DEV && syncError && <p className="mt-2 break-all font-mono text-[10px] text-amber-200/40">{syncError}</p>}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={syncStatus === 'syncing'}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                >
                  <i className="ri-refresh-line" /> Đồng bộ ngay
                </button>
                <Link to="/yeu-thich" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.09] hover:text-white">
                  <i className="ri-play-list-line" /> Xem dữ liệu của tôi
                </Link>
              </div>
            </section>

            <aside className="rounded-3xl border border-white/[0.07] bg-[#0d0f18] p-5 md:p-7">
              <h2 className="font-bold">Đồng bộ hoạt động thế nào?</h2>
              <div className="mt-5 space-y-4">
                {[
                  ['ri-download-cloud-2-line', 'Nhập dữ liệu đang có', 'Lần đăng nhập đầu, dữ liệu trên trình duyệt được giữ lại và đưa vào tài khoản.'],
                  ['ri-smartphone-line', 'Tiếp tục ở thiết bị khác', 'Đăng nhập cùng email để nhận lại lịch sử, yêu thích và bình luận riêng.'],
                  ['ri-lock-2-line', 'Chỉ bạn đọc được', 'Dữ liệu đồng bộ được bảo vệ theo đúng ID tài khoản.'],
                ].map(([icon, title, detail]) => (
                  <div key={title} className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-red-400"><i className={icon} /></div>
                    <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-white/40">{detail}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-4">
                <button type="button" onClick={() => changeMode('recovery')} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white/50 transition hover:text-white">
                  <i className="ri-lock-password-line" /> Đổi mật khẩu
                </button>
                <button type="button" onClick={() => void handleSignOut()} disabled={submitting} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white/40 transition hover:text-red-300 disabled:opacity-50">
                  <i className="ri-logout-box-r-line" /> Đăng xuất
                </button>
              </div>
              {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
            </aside>
          </div>
        ) : mode === 'forgot' ? (
          <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-3xl border border-white/[0.07] bg-[#0d0f18] p-5 md:p-7">
              <button type="button" onClick={() => changeMode('signin')} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-white/45 transition hover:text-white"><i className="ri-arrow-left-line" /> Quay lại đăng nhập</button>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-xl text-sky-300"><i className="ri-mail-lock-line" /></div>
              <h2 className="mt-4 text-2xl font-black">Quên mật khẩu?</h2>
              <p className="mt-2 text-sm leading-6 text-white/45">Nhập email tài khoản. Chúng tôi sẽ gửi liên kết bảo mật để bạn đặt mật khẩu mới.</p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/50">Email</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="ban@email.com" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm outline-none transition placeholder:text-white/20 focus:border-sky-500/50" />
                </label>
                {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">{error}</div>}
                {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs leading-5 text-emerald-200">{message}</div>}
                {awaitingConfirmation && (
                  <button type="button" onClick={() => void handleResendConfirmation()} disabled={submitting} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-emerald-300 transition hover:text-emerald-200 disabled:opacity-50">
                    <i className="ri-mail-send-line" /> Chưa nhận được email? Gửi lại
                  </button>
                )}
                <button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 text-sm font-black text-white transition hover:bg-sky-600 disabled:opacity-50">{submitting ? 'Đang gửi...' : <><i className="ri-send-plane-fill" /> Gửi liên kết đặt lại</>}</button>
              </form>
            </section>
            <aside className="rounded-3xl border border-white/[0.07] bg-gradient-to-br from-[#0c151d] to-[#0d0f18] p-6 md:p-8">
              <h3 className="text-lg font-black">Bảo vệ tài khoản của bạn</h3>
              <div className="mt-5 space-y-4 text-sm leading-6 text-white/48">
                <p><i className="ri-checkbox-circle-fill mr-2 text-emerald-400" />Liên kết chỉ dùng được một lần.</p>
                <p><i className="ri-checkbox-circle-fill mr-2 text-emerald-400" />Không chia sẻ email khôi phục cho người khác.</p>
                <p><i className="ri-checkbox-circle-fill mr-2 text-emerald-400" />Kiểm tra thư rác nếu chưa thấy email.</p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-3xl border border-white/[0.07] bg-[#0d0f18] p-5 md:p-7">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/20 p-1.5">
                {(['signin', 'signup'] as const).map((item) => (
                  <button key={item} type="button" onClick={() => changeMode(item)} className={`min-h-11 rounded-xl text-sm font-bold transition ${mode === item ? 'bg-red-500 text-white shadow-lg shadow-red-950/30' : 'text-white/40 hover:text-white/70'}`}>
                    {item === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'}
                  </button>
                ))}
              </div>

              {googleAuthEnabled && (
                <>
                  <button type="button" onClick={() => void handleGoogleSignIn()} disabled={submitting} className="mt-5 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.055] text-sm font-bold text-white/80 transition hover:bg-white/[0.09] hover:text-white disabled:opacity-50">
                    <i className="ri-google-fill text-lg" /> Tiếp tục với Google
                  </button>
                  <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/20"><span className="h-px flex-1 bg-white/[0.07]" />hoặc email<span className="h-px flex-1 bg-white/[0.07]" /></div>
                </>
              )}

              <form onSubmit={handleSubmit} className={`${googleAuthEnabled ? '' : 'mt-6'} space-y-4`}>
                {mode === 'signup' && (
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/50">Tên hiển thị</span>
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={40} autoComplete="name" placeholder="Tên của bạn" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm outline-none transition placeholder:text-white/20 focus:border-red-500/50 focus:bg-white/[0.065]" />
                  </label>
                )}
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/50">Email</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="ban@email.com" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm outline-none transition placeholder:text-white/20 focus:border-red-500/50 focus:bg-white/[0.065]" />
                </label>
                <label className="block">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-white/50">Mật khẩu</span>
                    {mode === 'signin' && <button type="button" onClick={() => changeMode('forgot')} className="text-[11px] font-semibold text-red-300/75 hover:text-red-300">Quên mật khẩu?</button>}
                  </div>
                  <div className="relative">
                    <input type={passwordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === 'signup' ? 8 : 6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'Ít nhất 8 ký tự, gồm chữ và số' : 'Mật khẩu của bạn'} className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 pr-12 text-sm outline-none transition placeholder:text-white/20 focus:border-red-500/50 focus:bg-white/[0.065]" />
                    <button type="button" onClick={() => setPasswordVisible((value) => !value)} aria-label={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-white/35 hover:text-white"><i className={passwordVisible ? 'ri-eye-off-line' : 'ri-eye-line'} /></button>
                  </div>
                </label>
                {mode === 'signup' && (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      {[['8+ ký tự', requirements.length], ['Có chữ', requirements.letter], ['Có số', requirements.number]].map(([label, valid]) => <span key={String(label)} className={`rounded-lg px-2 py-1.5 text-center ${valid ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/[0.04] text-white/30'}`}>{valid ? '✓ ' : ''}{label}</span>)}
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-white/50">Nhập lại mật khẩu</span>
                      <input type={passwordVisible ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Nhập lại mật khẩu" className={`h-12 w-full rounded-xl border bg-white/[0.045] px-4 text-sm outline-none transition placeholder:text-white/20 ${confirmPassword && confirmPassword !== password ? 'border-red-500/50' : 'border-white/10 focus:border-red-500/50'}`} />
                      {confirmPassword && confirmPassword !== password && <span className="mt-1.5 block text-[10px] text-red-300">Hai mật khẩu chưa trùng nhau.</span>}
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-white/45">
                      <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} required className="mt-1 h-4 w-4 accent-red-500" />
                      <span>Tôi đồng ý với <Link to="/policy?tab=privacy" className="font-semibold text-red-300 hover:underline">Chính sách bảo mật</Link> và <Link to="/policy?tab=terms" className="font-semibold text-red-300 hover:underline">Điều khoản sử dụng</Link>.</span>
                    </label>
                  </>
                )}
                {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">{error}</div>}
                {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs leading-5 text-emerald-200">{message}</div>}
                <button disabled={submitting || (mode === 'signup' && (!strongPassword || password !== confirmPassword || !privacyAccepted))} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-black text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Đang xử lý...</> : <><i className={mode === 'signin' ? 'ri-login-box-line' : 'ri-user-add-line'} /> {mode === 'signin' ? 'Đăng nhập và đồng bộ' : 'Tạo tài khoản'}</>}
                </button>
              </form>
              <p className="mt-4 text-center text-[11px] leading-5 text-white/25">Không bắt buộc đăng nhập để xem phim. Không có gói trả phí.</p>
            </section>

            <aside className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-[#16101a] via-[#0d0f18] to-[#0b121b] p-6 md:p-8">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-red-500/10 blur-3xl" />
              <h2 className="relative text-xl font-black md:text-2xl">Dữ liệu đang có trên thiết bị</h2>
              <p className="relative mt-2 text-sm leading-6 text-white/45">Sau khi đăng nhập, KhoPhim sẽ nhập các mục này vào tài khoản thay vì xóa hoặc ghi đè.</p>
              <div className="relative mt-6 grid grid-cols-3 gap-2.5">
                {[
                  ['ri-heart-3-fill', counts.favorites, 'Yêu thích', 'text-rose-400'],
                  ['ri-history-line', counts.history, 'Lịch sử', 'text-sky-400'],
                  ['ri-chat-3-line', counts.comments, 'Bình luận', 'text-amber-400'],
                ].map(([icon, value, label, color]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/[0.07] bg-black/20 p-3 text-center md:p-4">
                    <i className={`${icon} ${color} text-lg`} />
                    <div className="mt-2 text-2xl font-black">{value}</div>
                    <div className="mt-1 text-[11px] text-white/35">{label}</div>
                  </div>
                ))}
              </div>
              <div className="relative mt-7 space-y-3">
                {['Giữ nguyên trải nghiệm xem không cần tài khoản', 'Tự nhập dữ liệu cũ ở lần đăng nhập đầu', 'Đồng bộ thay đổi mới giữa điện thoại và máy tính'].map((text) => (
                  <div key={text} className="flex items-center gap-3 text-sm text-white/60"><i className="ri-checkbox-circle-fill text-emerald-400" /> {text}</div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
