const DIRECT_SUPABASE_URL =
  (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined)
  || (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  || 'https://ceoxbhsdodllziyxmbqr.supabase.co';

/**
 * Admin screens use the first-party proxy so a visitor's DNS cannot make the
 * control panel unavailable while khophim.org itself is reachable.
 */
export function adminSupabaseBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/supabase`;
  }
  return DIRECT_SUPABASE_URL;
}

export function adminFunctionUrl(name: string): string {
  return `${adminSupabaseBaseUrl()}/functions/v1/${encodeURIComponent(name)}`;
}
