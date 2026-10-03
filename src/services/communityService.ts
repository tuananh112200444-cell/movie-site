import { supabase } from '@/lib/supabase';

export interface PublicMovieComment {
  id: string;
  movie_slug: string;
  author_name: string;
  rating: number;
  body: string;
  created_at: string;
  updated_at: string;
  likes: number;
  liked: boolean;
}

interface CommentEngagement { comment_id: string; likes: number | string; liked: boolean }

function isLocalDemo(): boolean {
  return typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
}

function demoKey(slug: string): string { return `kp_demo_public_comments_${slug}`; }

function readDemoComments(slug: string): PublicMovieComment[] {
  try {
    const value = JSON.parse(localStorage.getItem(demoKey(slug)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export async function fetchMovieComments(movieSlug: string): Promise<PublicMovieComment[]> {
  const { data: comments, error } = await supabase.rpc('get_public_movie_comments', { p_movie_slug: movieSlug });
  if (error) {
    if (isLocalDemo()) return readDemoComments(movieSlug);
    throw error;
  }
  if (!comments?.length) return [];

  const { data: engagement, error: engagementError } = await supabase.rpc('get_movie_comment_engagement', { p_movie_slug: movieSlug });
  if (engagementError) {
    if (isLocalDemo()) return comments.map((comment) => ({ ...comment, likes: 0, liked: false }));
    throw engagementError;
  }
  const engagementById = new Map((engagement as CommentEngagement[] || []).map((item) => [item.comment_id, item]));

  return comments.map((comment) => ({
    ...comment,
    rating: Number(comment.rating),
    likes: Number(engagementById.get(comment.id)?.likes || 0),
    liked: Boolean(engagementById.get(comment.id)?.liked),
  }));
}

export async function submitMovieComment(input: { movieSlug: string; rating: number; body: string; authorName: string }): Promise<void> {
  const { error } = await supabase.rpc('submit_movie_comment', {
    p_movie_slug: input.movieSlug,
    p_rating: input.rating,
    p_body: input.body.trim(),
    p_author_name: input.authorName.trim(),
  });
  if (!error) return;
  if (isLocalDemo()) {
    const comments = readDemoComments(input.movieSlug);
    comments.unshift({
      id: `demo-${Date.now()}`,
      movie_slug: input.movieSlug,
      author_name: input.authorName,
      rating: input.rating,
      body: input.body.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      likes: 0,
      liked: false,
    });
    localStorage.setItem(demoKey(input.movieSlug), JSON.stringify(comments));
    return;
  }
  throw error;
}

export async function setMovieCommentLiked(commentId: string, liked: boolean): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Bạn cần đăng nhập để thích bình luận.');
  if (liked) {
    const { error } = await supabase.from('movie_comment_likes').insert({ comment_id: commentId, user_id: auth.user.id });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('movie_comment_likes').delete().eq('comment_id', commentId).eq('user_id', auth.user.id);
  if (error) throw error;
}
