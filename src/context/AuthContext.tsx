import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { applyRemoteSyncRecord, setActiveSyncUser, syncAllUserData } from '@/services/accountSync';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  syncStatus: SyncStatus;
  syncError: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu chưa đúng.';
  if (/email not confirmed/i.test(message)) return 'Bạn cần xác nhận email trước khi đăng nhập.';
  if (/user already registered/i.test(message)) return 'Email này đã có tài khoản.';
  if (/password/i.test(message) && /characters/i.test(message)) return 'Mật khẩu cần ít nhất 6 ký tự.';
  return message || 'Không thể xử lý tài khoản lúc này.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState('');

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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setActiveSyncUser(nextSession?.user.id ?? null);
      setLoading(false);
      if (nextSession?.user.id) void runSync(nextSession.user.id);
      else setSyncStatus('idle');
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [runSync]);

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
        emailRedirectTo: `${window.location.origin}/tai-khoan`,
      },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
    return { needsEmailConfirmation: !data.session };
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
    signIn,
    signUp,
    signOut,
    syncNow,
  }), [loading, session?.user, signIn, signOut, signUp, syncError, syncNow, syncStatus]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
