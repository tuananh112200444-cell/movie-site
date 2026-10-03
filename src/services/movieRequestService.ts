import { supabase } from '@/lib/supabase';

export type MovieRequestType = 'movie' | 'missing_episode' | 'source';

export interface MovieRequestInput {
  request_type: MovieRequestType;
  movie_name: string;
  movie_url?: string;
  details?: string;
  contact?: string;
}

export async function submitMovieRequest(input: MovieRequestInput): Promise<{ id: string; demo?: boolean }> {
  const { data, error } = await supabase.functions.invoke('submit-movie-request', { body: input });
  if (!error && data?.success) return { id: String(data.request?.id || '') };

  const isLocalDemo = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocalDemo) {
    const id = `demo-${Date.now()}`;
    try {
      const existing = JSON.parse(localStorage.getItem('kp_demo_movie_requests') || '[]');
      localStorage.setItem('kp_demo_movie_requests', JSON.stringify([{ id, ...input, created_at: new Date().toISOString() }, ...(Array.isArray(existing) ? existing : [])]));
    } catch { /* demo storage unavailable */ }
    return { id, demo: true };
  }
  throw new Error(String(data?.error || error?.message || 'Không thể gửi yêu cầu.'));
}
