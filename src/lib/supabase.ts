import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL = 'https://dzpddbthdeqbkrcjlzap.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_Mqk6aVxJjetKY8St_20QWA_Wc2zxBd0';

const supabaseUrl =
  (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  FALLBACK_SUPABASE_URL;

const supabaseAnonKey =
  (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  FALLBACK_SUPABASE_ANON_KEY;

const SUPABASE_SINGLETON_KEY = '__khophim_public_supabase_client__';

type KhophimWindow = Window & typeof globalThis & {
  [SUPABASE_SINGLETON_KEY]?: SupabaseClient;
};

function createReadonlyClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'khophim-public-readonly',
    },
  });
}

const browserGlobal = typeof window !== 'undefined' ? (window as KhophimWindow) : null;

export const supabase = browserGlobal
  ? (browserGlobal[SUPABASE_SINGLETON_KEY] ??= createReadonlyClient())
  : createReadonlyClient();
