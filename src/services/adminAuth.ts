/**
 * Admin Auth Service – Client Side
 * No hardcoded PIN. All verification goes through secure Edge Functions.
 */

const ADMIN_TOKEN_KEY = 'kp_admin_token';
const ADMIN_TOKEN_EXPIRY_KEY = 'kp_admin_token_exp';

function getSupabaseUrl(): string {
  return import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
}

export interface AdminVerifyResult {
  success: boolean;
  token?: string;
  expiresAt?: number;
  locked?: boolean;
  setupRequired?: boolean;
  remaining?: number;
  message?: string;
  minutesLeft?: number;
}

/** Gọi Edge Function verify PIN */
export async function verifyAdminPin(pin: string): Promise<AdminVerifyResult> {
  const res = await fetch(`${getSupabaseUrl()}/functions/v1/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });

  const data = (await res.json()) as {
    token?: string; expiresAt?: number; setup_required?: boolean;
    error?: string; locked?: boolean; remaining?: number; message?: string; minutesLeft?: number;
  };

  if (data.setup_required) {
    return { success: false, setupRequired: true, message: data.message };
  }

  if (res.ok && data.token) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    sessionStorage.setItem(ADMIN_TOKEN_EXPIRY_KEY, String(data.expiresAt ?? 0));
    return { success: true, token: data.token, expiresAt: data.expiresAt ?? 0 };
  }

  if (data.locked) {
    return {
      success: false, locked: true,
      minutesLeft: data.minutesLeft ?? 0,
      message: data.message ?? 'Tài khoản đã bị khóa.',
    };
  }

  return {
    success: false, locked: false,
    remaining: data.remaining ?? 0,
    message: data.message ?? 'Mật khẩu không đúng',
  };
}

/** Đổi mã PIN (cần currentPin nếu đã có) */
export async function adminChangePin(
  currentPin: string, newPin: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${getSupabaseUrl()}/functions/v1/admin-change-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPin, newPin }),
  });

  const data = (await res.json()) as { success?: boolean; message?: string; error?: string };

  if (res.ok && data.success) {
    return { success: true, message: data.message };
  }

  return {
    success: false,
    message: data.error ?? data.message ?? 'Đổi mật khẩu thất bại',
    error: data.error,
  };
}

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function isAdminAuthenticated(): boolean {
  const token = getAdminToken();
  if (!token) return false;
  const expStr = sessionStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY);
  if (!expStr) return false;
  const exp = Number(expStr);
  if (exp > 0 && Date.now() > exp * 1000) {
    clearAdminAuth();
    return false;
  }
  return true;
}

export function clearAdminAuth(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
}

export function adminHeaders(base: Record<string, string> = {}): Record<string, string> {
  const token = getAdminToken();
  if (token) return { ...base, Authorization: `Bearer ${token}` };
  return base;
}

export async function adminFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<Response> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(url, { ...init, headers });
}