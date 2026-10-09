import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL, supabase } from '@/lib/supabase';
import { applyRemoteSyncRecord, setActiveSyncUser, syncAllUserData } from '@/services/accountSync';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  syncStatus: SyncStatus;
  syncError: string;
  passwordRecoveryActive: boolean;
  googleAuthEnabled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ needsEmailConfirmation: boolean }>;
  resendConfirmation: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu chưa đúng.';
  if (/email not confirmed/i.test(message)) return 'Bạn cần xác nhận email trước khi đăng nhập.';
  if (/user already registered/i.test(message)) return 'Email này đã có tài khoản.';
  if (/email address.*invalid|invalid.*email/i.test(message)) return 'Địa chỉ email chưa hợp lệ.';
  if (/signup.*disabled|signups not allowed/i.test(message)) return 'Hệ thống đăng ký đang tạm khóa.';
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) return 'Bạn thao tác quá nhanh. Vui lòng chờ ít phút rồi thử lại.';
  if (/same password|different from the old password/i.test(message)) return 'Mật khẩu mới cần khác mật khẩu hiện tại.';
  if (/weak password/i.test(message)) return 'Mật khẩu chưa đủ mạnh. Hãy dùng ít nhất 8 ký tự gồm chữ và số.';
  if (/network|failed to fetch|fetch failed/i.test(message)) return 'Không thể kết nối hệ thống tài khoản. Hãy kiểm tra mạng và thử lại.';
  if (/password/i.test(message) && /characters/i.test(message)) return 'Mật khẩu cần ít nhất 6 ký tự.';
  return /[a-z]/i.test(message) && !/[à-ỹ]/i.test(message)
    ? 'Không thể xử lý tài khoản lúc này. Vui lòng thử lại sau.'
    : message || 'Không thể xử lý tài khoản lúc này.';
}

function accountRedirectUrl(mode?: string): string {
  const productionOrigin = /^https?:\/\/(?:www\.)?khophim\.org$/i.test(window.location.origin)
    ? window.location.origin
    : 'https://khophim.org';
  const url = new URL('/tai-khoan', productionOrigin);
  if (mode) url.searchParams.set('mode', mode);
  return url.toString();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState('');
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false);

  const runSync = useCallback(async (userId: string) => {
    setSyncStatus('syncing');
    setSyncError('');
    try {
      await syncAllUserData(userId);
      setSyncStatus('synced');
    } catch (error) {
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'Đồng bộ thất bại.');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setActiveSyncUser(data.session?.user.id ?? null);
      setLoading(false);
      if (data.session?.user.id) void runSync(data.session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setActiveSyncUser(nextSession?.user.id ?? null);
      setLoading(false);
      if (nextSession?.user.id) void runSync(nextSession.user.id);
      else setSyncStatus('idle');
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryActive(true);
      if (event === 'SIGNED_OUT') setPasswordRecoveryActive(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [runSync]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: PUBLIC_SUPABASE_ANON_KEY },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((settings: { external?: { google?: boolean } } | null) => {
        setGoogleAuthEnabled(settings?.external?.google === true);
      })
      .catch(() => { /* Email auth remains available when provider discovery fails. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return undefined;
    const channel = supabase
      .channel(`user-sync-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_sync_items',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Parameters<typeof applyRemoteSyncRecord>[0];
        if (row?.item_key) applyRemoteSyncRecord(row);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return undefined;
    const handleOnline = () => void runSync(session.user.id);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [runSync, session?.user.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: accountRedirectUrl(),
      },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: accountRedirectUrl() },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: accountRedirectUrl() },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: accountRedirectUrl('recovery'),
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(friendlyAuthError(error.message));
    setPasswordRecoveryActive(false);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const syncNow = useCallback(async () => {
    if (session?.user.id) await runSync(session.user.id);
  }, [runSync, session?.user.id]);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    loading,
    syncStatus,
    syncError,
    passwordRecoveryActive,
    googleAuthEnabled,
    signIn,
    signUp,
    resendConfirmation,
    signInWithGoogle,
    requestPasswordReset,
    updatePassword,
    signOut,
    syncNow,
  }), [googleAuthEnabled, loading, passwordRecoveryActive, requestPasswordReset, resendConfirmation, session?.user, signIn, signInWithGoogle, signOut, signUp, syncError, syncNow, syncStatus, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
