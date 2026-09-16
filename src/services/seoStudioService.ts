import { adminFetch } from '@/services/adminAuth';
import { supabase } from '@/lib/supabase';

const ENDPOINT = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-seo-studio`;

export type SeoIndexMode = 'auto' | 'index' | 'noindex';
export type SeoProfileStatus = 'draft' | 'published';

export interface SeoFaqItem {
  question: string;
  answer: string;
}

export interface SeoTopicLink {
  title: string;
  url: string;
  anchor: string;
  description?: string;
}

export interface SeoIncomingTopicLink {
  source_slug: string;
  title: string;
  anchor: string;
  description?: string;
  target_path: string;
  updated_at?: string;
}

export interface SeoLiveAuditCheck {
  code: string;
  passed: boolean;
  message: string;
  value?: string | number | boolean;
}

export interface SeoLiveAuditResult {
  passed: boolean;
  checked_at: string;
  url: string;
  status: number;
  checks: SeoLiveAuditCheck[];
}

export interface SeoValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'success';
  section: 'movie' | 'search' | 'content' | 'links' | 'technical';
  message: string;
}

export interface SeoValidationResult {
  score: number;
  issues: SeoValidationIssue[];
}

export interface SeoSafeFieldState {
  status: 'protected' | 'needs_attention' | 'optional' | 'immutable';
  protected: boolean;
  reason: string;
}

export interface SeoSafeEditContext {
  baseline: SeoStudioPayload;
  baseline_version: number;
  baseline_validation: SeoValidationResult;
  fields: Record<string, SeoSafeFieldState>;
  draft: {
    payload: SeoStudioPayload;
    baseline_version: number;
    unlocked_fields: string[];
    validation_score: number;
    validation_issues: SeoValidationIssue[];
    updated_at: string;
  } | null;
  history_available: boolean;
}

export interface SeoMoviePatch {
  name: string;
  title_vi: string;
  title_en: string;
  origin_name: string;
  year: number;
  quality: string;
  lang: string;
  trailer_url: string;
  thumb_url: string;
  poster_url: string;
  actor: string[];
  director: string[];
  category: Array<{ id: string; name: string; slug: string }>;
  country: Array<{ id: string; name: string; slug: string }>;
}

export interface SeoStudioPayload {
  movie_id: string;
  slug: string;
  focus_keyword: string;
  secondary_keywords: string[];
  seo_title: string;
  meta_description: string;
  canonical_path: string;
  og_image_url: string;
  index_mode: SeoIndexMode;
  intro_content: string;
  review_content: string;
  faq: SeoFaqItem[];
  topic_links: SeoTopicLink[];
  movie_patch: SeoMoviePatch;
}

export interface PublishedSeoProfile {
  movie_id: string;
  slug: string;
  focus_keyword: string;
  secondary_keywords: string[];
  seo_title: string;
  meta_description: string;
  canonical_path: string;
  og_image_url: string;
  index_mode: SeoIndexMode;
  intro_content: string;
  review_content?: string;
  faq: SeoFaqItem[];
  topic_links: SeoTopicLink[];
  validation_score: number;
  version?: number;
  live_audit?: SeoLiveAuditResult | null;
  last_audited_at?: string;
  published_at?: string;
  updated_at?: string;
}

export interface SeoMovieSearchItem {
  id: string;
  slug: string;
  name: string;
  origin_name?: string;
  title_vi?: string;
  title_en?: string;
  year?: number;
  thumb_url?: string;
  poster_url?: string;
  is_published?: boolean;
  updated_at?: string;
}

interface AdminResult<T> {
  error?: string;
  validation?: SeoValidationResult;
  live_audit?: SeoLiveAuditResult;
  [key: string]: unknown;
  data?: T;
}

export class SeoStudioApiError extends Error {
  validation?: SeoValidationResult;
  liveAudit?: SeoLiveAuditResult;

  constructor(message: string, validation?: SeoValidationResult, liveAudit?: SeoLiveAuditResult) {
    super(message);
    this.name = 'SeoStudioApiError';
    this.validation = validation;
    this.liveAudit = liveAudit;
  }
}

async function callAdmin<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const response = await adminFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const result = await response.json().catch(() => ({})) as AdminResult<T> & T;
  if (!response.ok || result.error) throw new SeoStudioApiError(result.error || `SEO Studio error ${response.status}`, result.validation, result.live_audit);
  return result as T;
}

export async function searchSeoMovies(query: string): Promise<SeoMovieSearchItem[]> {
  const result = await callAdmin<{ items: SeoMovieSearchItem[] }>('search', { query });
  return result.items ?? [];
}

export interface SeoStudioLoadResult {
  movie: Record<string, unknown>;
  ai_available?: boolean;
  ai_provider?: 'gemini' | 'openai' | null;
  worker_status?: { online: boolean; status: number; checked_at: string };
  profile: (PublishedSeoProfile & { review_content?: string; movie_patch?: SeoMoviePatch; status?: SeoProfileStatus; validation_issues?: SeoValidationIssue[] }) | null;
  review: { content?: string; word_count?: number; generated_at?: string; updated_at?: string } | null;
  quality: { eligible_for_index?: boolean; index_tier?: string; quality_score?: number; reasons?: string[]; signals?: string[]; checked_at?: string } | null;
  insights?: {
    work_item?: { task_type?: string; status?: string; priority_score?: number; urgency?: string; reason?: string; required_fields?: string[]; evidence?: Record<string, unknown>; due_at?: string; updated_at?: string } | null;
    inspection?: { verdict?: string; coverage_state?: string; indexing_state?: string; page_fetch_state?: string; user_canonical?: string; google_canonical?: string; last_crawl_time?: string; inspected_at?: string; recommendation?: string } | null;
    search_metric?: { clicks?: number; impressions?: number; ctr?: number; position?: number; date_start?: string; date_end?: string; collected_at?: string } | null;
    search_queries?: Array<{ query?: string; clicks?: number; impressions?: number; ctr?: number; position?: number; date_start?: string; date_end?: string; collected_at?: string }>;
  };
  suggestions: { title: string; description: string; canonical_path: string };
  safe_edit: SeoSafeEditContext;
}

export function loadSeoMovie(movieId: string, slug: string): Promise<SeoStudioLoadResult> {
  return callAdmin<SeoStudioLoadResult>('load', { movie_id: movieId, slug });
}

export function validateSeoDraft(payload: SeoStudioPayload): Promise<SeoValidationResult> {
  return callAdmin<SeoValidationResult>('validate', { payload });
}

export function inspectSeoDraft(payload: SeoStudioPayload): Promise<{ validation: SeoValidationResult; live_audit: SeoLiveAuditResult }> {
  return callAdmin('inspect', { payload });
}

export interface SeoAiEvidence {
  field: 'focus_keyword' | 'secondary_keywords' | 'seo_title' | 'meta_description' | 'intro_content' | 'review_content' | 'faq' | 'topic_links';
  fact: string;
  source_url: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SeoAiSuggestionResult {
  ai_available: boolean;
  provider?: 'gemini' | 'openai' | null;
  model: string | null;
  mode: 'quick' | 'deep';
  summary: string;
  proposed_payload: SeoStudioPayload;
  validation: SeoValidationResult;
  changed_fields: SeoAiEvidence['field'][];
  evidence: SeoAiEvidence[];
  warnings: string[];
  preserved_fields: string[];
  generated_at: string;
}

export function suggestSeoDraft(movieId: string, slug: string, mode: 'quick' | 'deep'): Promise<SeoAiSuggestionResult> {
  return callAdmin<SeoAiSuggestionResult>('suggest', { movie_id: movieId, slug, mode });
}

export function saveSeoDraft(payload: SeoStudioPayload, safeEdit: { baseline_version: number; unlocked_fields: string[] }): Promise<{ success: boolean; status: SeoProfileStatus; validation: SeoValidationResult; published_profile_unchanged?: boolean }> {
  return callAdmin('save', { payload, safe_edit: safeEdit });
}

export function publishSeoDraft(payload: SeoStudioPayload, safeEdit: { baseline_version: number; unlocked_fields: string[] }): Promise<{ success: boolean; status: SeoProfileStatus | 'published-indexable' | 'published-noindex'; validation: SeoValidationResult; result?: Record<string, unknown>; live_audit?: SeoLiveAuditResult; public_discovery?: { indexable: boolean; in_sitemap: boolean; checked_at: string } }> {
  return callAdmin('publish', { payload, safe_edit: safeEdit });
}

export async function getPublishedSeoProfile(slug: string): Promise<PublishedSeoProfile | null> {
  if (!slug) return null;
  const { data, error } = await supabase
    .from('movie_seo_profiles')
    .select('movie_id,slug,focus_keyword,secondary_keywords,seo_title,meta_description,canonical_path,og_image_url,index_mode,intro_content,review_content,faq,topic_links,validation_score,version,live_audit,last_audited_at,published_at,updated_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error || !data) return null;
  return data as PublishedSeoProfile;
}

export async function getIncomingSeoTopicLinks(slug: string): Promise<SeoIncomingTopicLink[]> {
  if (!slug) return [];
  const { data, error } = await supabase
    .from('movie_seo_topic_links')
    .select('source_slug,title,anchor,description,target_path,updated_at')
    .eq('target_path', `/phim/${slug}`)
    .neq('source_slug', slug)
    .order('updated_at', { ascending: false })
    .limit(12);
  if (error || !data) return [];
  return data as SeoIncomingTopicLink[];
}
