// ─── Review Service ───────────────────────────────────────────────────────────
// Lưu review lên Supabase (Google crawl được 100%)
// IndexedDB chỉ dùng như local cache để tăng tốc độ đọc

import { adminFetch } from '@/services/adminAuth';
import { supabase } from '@/lib/supabase';

export interface MovieReview {
  slug: string;
  movieName: string;
  originName?: string;
  content: string;
  wordCount: number;
  generatedAt: string;
  updatedAt: string;
}

const EDGE_SAVE_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-review-save`;
const EDGE_DELETE_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-review-delete`;

// ─── Edge Function CRUD ─────────────────────────────────────────────────────

export async function saveReview(review: MovieReview): Promise<void> {
  const res = await adminFetch(EDGE_SAVE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      review: {
        slug: review.slug,
        movie_name: review.movieName,
        origin_name: review.originName ?? null,
        content: review.content,
        word_count: review.wordCount,
        generated_at: review.generatedAt,
        updated_at: review.updatedAt,
      },
    }),
  });

  const data = await res.json().catch(() => ({ error: undefined })) as { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `Save failed: ${res.status}`);

}

export async function deleteReview(slug: string): Promise<void> {
  const res = await adminFetch(EDGE_DELETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });

  const data = await res.json().catch(() => ({ error: undefined })) as { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `Delete failed: ${res.status}`);
}

// ─── Public Supabase reads (SELECT still allowed) ────────────────────────────

export async function getReview(slug: string): Promise<MovieReview | null> {
  const { data, error } = await supabase
    .from('movie_reviews')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

export async function getAllReviews(): Promise<MovieReview[]> {
  const PAGE_SIZE = 1000;
  const results: MovieReview[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('movie_reviews')
      .select('*')
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;
    results.push(...data.map(mapRow));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return results;
}

export async function getReviewCount(): Promise<number> {
  const { count, error } = await supabase
    .from('movie_reviews')
    .select('*', { count: 'exact', head: true });
  if (error) return 0;
  return count ?? 0;
}

function mapRow(row: any): MovieReview {
  return {
    slug: row.slug,
    movieName: row.movie_name,
    originName: row.origin_name ?? undefined,
    content: row.content,
    wordCount: row.word_count,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
  };
}

// ─── Movie Info ───────────────────────────────────────────────────────────────

export interface MovieInfo {
  slug: string;
  name: string;
  origin_name?: string;
  content?: string;
  year?: number;
  quality?: string;
  lang?: string;
  episode_current?: string;
  episode_total?: string;
  time?: string;
  category?: { name: string }[];
  country?: { name: string }[];
  actor?: string[];
  director?: string[];
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt(movie: MovieInfo): string {
  const genres = movie.category?.map((c) => c.name).join(', ') ?? '';
  const countries = movie.country?.map((c) => c.name).join(', ') ?? '';
  const actors = movie.actor?.filter(Boolean).slice(0, 8).join(', ') ?? '';
  const directors = movie.director?.filter(Boolean).join(', ') ?? '';
  const isSeries = movie.episode_total && Number(movie.episode_total) > 1;

  return `Bạn là một nhà phê bình phim chuyên nghiệp người Việt. Hãy viết một bài review phim chi tiết, hấp dẫn và chuyên sâu bằng tiếng Việt cho bộ phim sau:

**Tên phim:** ${movie.name}${movie.origin_name ? ` (${movie.origin_name})` : ''}
**Năm:** ${movie.year ?? 'Chưa rõ'}
**Thể loại:** ${genres || 'Chưa rõ'}
**Quốc gia:** ${countries || 'Chưa rõ'}
**Chất lượng:** ${movie.quality ?? 'HD'}
**Ngôn ngữ:** ${movie.lang ?? 'Vietsub'}
${isSeries ? `**Số tập:** ${movie.episode_total} tập` : ''}
${movie.time ? `**Thời lượng:** ${movie.time}` : ''}
${directors ? `**Đạo diễn:** ${directors}` : ''}
${actors ? `**Diễn viên:** ${actors}` : ''}
${movie.content ? `**Nội dung tóm tắt:** ${movie.content}` : ''}

**Yêu cầu bài review:**
- Độ dài: 700-1000 từ
- Viết bằng tiếng Việt tự nhiên, hấp dẫn
- Cấu trúc: Giới thiệu phim → Nội dung & cốt truyện → Diễn xuất & đạo diễn → Hình ảnh & âm thanh → Đánh giá tổng thể → Kết luận có nên xem không
- Tự nhiên đề cập đến tên phim "${movie.name}" ít nhất 5-7 lần trong bài
- Đề cập đến thể loại "${genres}" và quốc gia "${countries}" một cách tự nhiên
- Cuối bài có 1 đoạn ngắn khuyến khích xem phim tại KhoPhim
- KHÔNG dùng markdown headers (##, ###), chỉ dùng văn xuôi thuần túy
- KHÔNG liệt kê bullet points, viết thành đoạn văn hoàn chỉnh
- Giọng văn chuyên nghiệp nhưng gần gũi, dễ đọc`;
}

// ─── OpenAI Generator ─────────────────────────────────────────────────────────

export async function generateReviewWithOpenAI(
  movie: MovieInfo,
  apiKey: string,
  onProgress?: (text: string) => void
): Promise<string> {
  const prompt = buildPrompt(movie);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.8,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `OpenAI error ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') break;
      try {
        const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          fullText += delta;
          onProgress?.(fullText);
        }
      } catch { /* skip */ }
    }
  }

  return fullText.trim();
}

// ─── Gemini Generator ─────────────────────────────────────────────────────────

export async function generateReviewWithGemini(
  movie: MovieInfo,
  apiKey: string,
  onProgress?: (text: string) => void
): Promise<string> {
  const prompt = buildPrompt(movie);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    const msg = (err as { error?: { message?: string } }).error?.message;
    throw new Error(msg ?? `Gemini error ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) {
          fullText += text;
          onProgress?.(fullText);
        }
      } catch { /* skip */ }
    }
  }

  return fullText.trim();
}

// ─── Unified generator ────────────────────────────────────────────────────────

export type AIProvider = 'openai' | 'gemini';

export async function generateReview(
  movie: MovieInfo,
  provider: AIProvider,
  apiKey: string,
  onProgress?: (text: string) => void
): Promise<string> {
  if (provider === 'gemini') {
    return generateReviewWithGemini(movie, apiKey, onProgress);
  }
  return generateReviewWithOpenAI(movie, apiKey, onProgress);
}

// ─── API Key storage (sessionStorage only) ────────────────────────────────────

const OPENAI_KEY_SESSION = 'kp_openai_key';
const GEMINI_KEY_SESSION = 'kp_gemini_key';
const PROVIDER_SESSION = 'kp_ai_provider';

export function saveApiKey(key: string): void {
  sessionStorage.setItem(OPENAI_KEY_SESSION, key);
}

export function getApiKey(): string {
  return sessionStorage.getItem(OPENAI_KEY_SESSION) ?? '';
}

export function clearApiKey(): void {
  sessionStorage.removeItem(OPENAI_KEY_SESSION);
}

export function saveGeminiKey(key: string): void {
  sessionStorage.setItem(GEMINI_KEY_SESSION, key);
}

export function getGeminiKey(): string {
  return sessionStorage.getItem(GEMINI_KEY_SESSION) ?? '';
}

export function clearGeminiKey(): void {
  sessionStorage.removeItem(GEMINI_KEY_SESSION);
}

export function saveProvider(provider: AIProvider): void {
  sessionStorage.setItem(PROVIDER_SESSION, provider);
}

export function getProvider(): AIProvider {
  return (sessionStorage.getItem(PROVIDER_SESSION) as AIProvider) ?? 'openai';
}

export function getActiveApiKey(): string {
  const provider = getProvider();
  return provider === 'gemini' ? getGeminiKey() : getApiKey();
}
