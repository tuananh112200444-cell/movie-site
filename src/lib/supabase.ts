import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
