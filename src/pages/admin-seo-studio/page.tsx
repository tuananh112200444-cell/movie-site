import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadSeoMovie,
  inspectSeoDraft,
  publishSeoDraft,
  saveSeoDraft,
  searchSeoMovies,
  suggestSeoDraft,
  SeoStudioApiError,
  validateSeoDraft,
  type SeoFaqItem,
  type SeoMoviePatch,
  type SeoMovieSearchItem,
  type SeoStudioLoadResult,
  type SeoStudioPayload,
  type SeoTopicLink,
  type SeoLiveAuditResult,
  type SeoAiSuggestionResult,
  type SeoSafeFieldState,
  type SeoValidationIssue,
  type SeoValidationResult,
} from '@/services/seoStudioService';

type StepKey = 'movie' | 'search' | 'content' | 'links' | 'technical';
type LocalSeoDraft = { savedAt: string; payload: SeoStudioPayload; step: StepKey; unlockedFields?: string[] };
type LocalSeoSession = { movie: SeoMovieSearchItem; step: StepKey };

const LOCAL_DRAFT_PREFIX = 'kp:seo-studio:draft:v2:';
const LOCAL_SESSION_KEY = 'kp:seo-studio:session:v2';

const STEPS: Array<{ key: StepKey; label: string; short: string; icon: string }> = [
  { key: 'movie', label: '1. Dữ liệu phim', short: 'Dữ liệu', icon: 'ri-movie-2-line' },
  { key: 'search', label: '2. Hiển thị Google', short: 'Google', icon: 'ri-google-line' },
  { key: 'content', label: '3. Nội dung hữu ích', short: 'Nội dung', icon: 'ri-article-line' },
  { key: 'links', label: '4. Cụm chủ đề', short: 'Liên kết', icon: 'ri-links-line' },
  { key: 'technical', label: '5. Kiểm tra & xuất bản', short: 'Xuất bản', icon: 'ri-checkbox-circle-line' },
];

const WORKFLOW_STAGES: Array<{ key: 'diagnose' | 'create' | 'verify'; step: StepKey; label: string; description: string; icon: string }> = [
  { key: 'diagnose', step: 'movie', label: '1. Chẩn đoán', description: 'Chỉ xem mục cần sửa', icon: 'ri-pulse-line' },
  { key: 'create', step: 'content', label: '2. AI & biên tập', description: 'Tạo và duyệt bản nháp', icon: 'ri-sparkling-2-line' },
  { key: 'verify', step: 'technical', label: '3. Kiểm tra & xuất bản', description: 'Xác minh trang thật', icon: 'ri-shield-check-line' },
];

const STEP_PRIORITY: StepKey[] = ['movie', 'search', 'content', 'links', 'technical'];
const BLOCKING_STEP_PRIORITY: StepKey[] = ['technical', ...STEP_PRIORITY];

const FIELD_LABELS: Record<string, string> = {
  'movie_patch.name': 'Tên hiển thị',
  'movie_patch.title_vi': 'Tên tiếng Việt',
  'movie_patch.title_en': 'Tên tiếng Anh',
  'movie_patch.origin_name': 'Tên gốc',
  'movie_patch.year': 'Năm phát hành',
  'movie_patch.quality': 'Chất lượng',
  'movie_patch.lang': 'Ngôn ngữ',
  'movie_patch.trailer_url': 'Trailer chính thức',
  'movie_patch.thumb_url': 'Poster dọc',
  'movie_patch.poster_url': 'Backdrop ngang',
  'movie_patch.actor': 'Diễn viên',
  'movie_patch.director': 'Đạo diễn',
  'movie_patch.category': 'Thể loại',
  'movie_patch.country': 'Quốc gia',
  focus_keyword: 'Từ khóa chính',
  secondary_keywords: 'Từ khóa liên quan',
  seo_title: 'SEO Title',
  meta_description: 'Meta Description',
  og_image_url: 'Ảnh chia sẻ',
  intro_content: 'Giới thiệu nguyên bản',
  review_content: 'Bài đánh giá',
  faq: 'Câu hỏi thường gặp',
  topic_links: 'Liên kết nội bộ',
  index_mode: 'Quyền index',
  canonical_path: 'Canonical',
  slug: 'Slug',
};

const STEP_FIELDS: Record<StepKey, string[]> = {
  movie: Object.keys(FIELD_LABELS).filter((field) => field.startsWith('movie_patch.')),
  search: ['focus_keyword', 'secondary_keywords', 'seo_title', 'meta_description', 'og_image_url'],
  content: ['intro_content', 'review_content', 'faq'],
  links: ['topic_links'],
  technical: ['index_mode', 'canonical_path', 'slug'],
};

const inputClass = 'w-full rounded-xl border border-white/10 bg-[#0d1019] px-3.5 py-3 text-sm text-white outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10 placeholder:text-white/20 disabled:cursor-not-allowed disabled:border-emerald-500/10 disabled:bg-emerald-500/[0.035] disabled:text-white/45';
const labelClass = 'mb-1.5 block text-xs font-semibold text-white/60';

function readLocalJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage can be unavailable */ }
}

function removeLocalValue(key: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(key); } catch { /* storage can be unavailable */ }
}

function readNewerLocalDraft(movieId: string, serverUpdatedAt?: string): LocalSeoDraft | null {
  const key = `${LOCAL_DRAFT_PREFIX}${movieId}`;
  const draft = readLocalJson<LocalSeoDraft>(key);
  if (!draft?.payload || draft.payload.movie_id !== movieId || !STEPS.some((item) => item.key === draft.step)) return null;
  const savedAt = Date.parse(draft.savedAt || '');
  const serverTime = Date.parse(serverUpdatedAt || '') || 0;
  if (!Number.isFinite(savedAt) || savedAt <= serverTime) {
    removeLocalValue(key);
    return null;
  }
  return draft;
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function words(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0;
}

function listFromCsv(value: string): string[] {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
}

function taxonomyFromCsv(value: string) {
  return listFromCsv(value).map((name) => ({ id: '', name, slug: slugify(name) }));
}

function movieArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function movieTaxonomy(value: unknown): Array<{ id: string; name: string; slug: string }> {
  return Array.isArray(value) ? value.flatMap((item) => {
    if (typeof item === 'string') return [{ id: '', name: item, slug: slugify(item) }];
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const name = String(row.name || '').trim();
    return name ? [{ id: String(row.id || ''), name, slug: String(row.slug || slugify(name)) }] : [];
  }) : [];
}

function comparableField(value: unknown): string {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  return String(value ?? '').trim();
}

function getPayloadField(payload: SeoStudioPayload, field: string): unknown {
  if (field.startsWith('movie_patch.')) return payload.movie_patch[field.slice('movie_patch.'.length) as keyof SeoMoviePatch];
  return payload[field as keyof SeoStudioPayload];
}

function replacePayloadField(payload: SeoStudioPayload, field: string, value: unknown): SeoStudioPayload {
  if (field.startsWith('movie_patch.')) {
    const key = field.slice('movie_patch.'.length) as keyof SeoMoviePatch;
    return { ...payload, movie_patch: { ...payload.movie_patch, [key]: value } };
  }
  return { ...payload, [field]: value } as SeoStudioPayload;
}

function defaultMoviePatch(movie: Record<string, unknown>): SeoMoviePatch {
  return {
    name: String(movie.name || ''),
    title_vi: String(movie.title_vi || movie.name || ''),
    title_en: String(movie.title_en || movie.origin_name || ''),
    origin_name: String(movie.origin_name || movie.title_en || ''),
    year: Number(movie.year || 0),
    quality: String(movie.quality || ''),
    lang: String(movie.lang || ''),
    trailer_url: String(movie.trailer_url || ''),
    thumb_url: String(movie.thumb_url || ''),
    poster_url: String(movie.poster_url || ''),
    actor: movieArray(movie.actor),
    director: movieArray(movie.director),
    category: movieTaxonomy(movie.category),
    country: movieTaxonomy(movie.country),
  };
}

function payloadFromLoad(result: SeoStudioLoadResult): SeoStudioPayload {
  if (result.safe_edit?.baseline) return result.safe_edit.baseline;
  const movie = result.movie;
  const profile = result.profile;
  const basePatch = defaultMoviePatch(movie);
  const savedPatch = profile?.movie_patch;
  const patch = savedPatch ? { ...basePatch, ...savedPatch } : basePatch;
  return {
    movie_id: String(movie.id || ''),
    slug: String(movie.slug || ''),
    focus_keyword: profile?.focus_keyword || String(movie.name || '').toLowerCase(),
    secondary_keywords: profile?.secondary_keywords ?? [String(movie.origin_name || ''), `${String(movie.name || '')} ${String(movie.year || '')}`].filter(Boolean),
    seo_title: profile?.seo_title || result.suggestions.title,
    meta_description: profile?.meta_description || result.suggestions.description,
    canonical_path: profile?.canonical_path || result.suggestions.canonical_path,
    og_image_url: profile?.og_image_url || String(movie.poster_url || movie.thumb_url || ''),
    index_mode: profile?.index_mode || 'auto',
    intro_content: profile?.intro_content || String(movie.content || ''),
    review_content: profile?.review_content || result.review?.content || '',
    faq: profile?.faq ?? [],
    topic_links: profile?.topic_links ?? [],
    movie_patch: patch,
  };
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function IssueBadge({ issue }: { issue: SeoValidationIssue }) {
  const style = issue.severity === 'error'
    ? 'border-red-500/20 bg-red-500/10 text-red-300'
    : issue.severity === 'warning'
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
      : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  const icon = issue.severity === 'error' ? 'ri-close-circle-line' : issue.severity === 'warning' ? 'ri-error-warning-line' : 'ri-checkbox-circle-line';
  return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5 ${style}`}><i className={`${icon} mt-0.5`} /><span>{issue.message}</span></div>;
}

function Counter({ value, recommended }: { value: string; recommended: string }) {
  return <span className="text-[11px] text-white/30">{value.length} ký tự · {recommended}</span>;
}

function previewValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Chưa có';
    if (typeof value[0] === 'string') return value.join(', ');
    return value.map((item) => {
      const row = item as Record<string, unknown>;
      return String(row.question || row.title || row.anchor || '').trim();
    }).filter(Boolean).join(' · ');
  }
  return String(value || '').trim() || 'Chưa có';
}

function getPriorityAction(validation: SeoValidationResult, workerOnline?: boolean): {
  step: StepKey;
  title: string;
  description: string;
  blocking: boolean;
} {
  if (workerOnline === false) {
    return {
      step: 'technical',
      title: 'Khôi phục kiểm tra trang thật trước',
      description: 'SEO Worker chưa phản hồi. Hệ thống sẽ không xuất bản cho đến khi trang thật kiểm tra được.',
      blocking: true,
    };
  }
  const issues = validation.issues.filter((issue) => issue.severity !== 'success');
  const blockingIssue = BLOCKING_STEP_PRIORITY
    .flatMap((section) => issues.filter((issue) => issue.section === section && issue.severity === 'error'))[0];
  const nextIssue = blockingIssue || STEP_PRIORITY
    .flatMap((section) => issues.filter((issue) => issue.section === section && issue.severity === 'warning'))[0];
  if (!nextIssue) {
    return {
      step: 'technical',
      title: 'Sẵn sàng kiểm tra và xuất bản',
      description: 'Không còn mục bắt buộc cần sửa. Kiểm tra trang thật một lần cuối rồi mới xuất bản.',
      blocking: false,
    };
  }
  return {
    step: nextIssue.section,
    title: blockingIssue ? 'Việc cần làm ngay' : 'Việc nên làm tiếp theo',
    description: nextIssue.message,
    blocking: Boolean(blockingIssue),
  };
}

export default function AdminSeoStudioPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SeoMovieSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SeoMovieSearchItem | null>(null);
  const [loaded, setLoaded] = useState<SeoStudioLoadResult | null>(null);
  const [payload, setPayload] = useState<SeoStudioPayload | null>(null);
  const [step, setStep] = useState<StepKey>('movie');
  const [validation, setValidation] = useState<SeoValidationResult>({ score: 0, issues: [] });
  const [busy, setBusy] = useState<'load' | 'save' | 'publish' | 'inspect' | 'validate' | 'ai' | ''>('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [liveAudit, setLiveAudit] = useState<SeoLiveAuditResult | null>(null);
  const [secondaryText, setSecondaryText] = useState('');
  const [actorText, setActorText] = useState('');
  const [directorText, setDirectorText] = useState('');
  const [categoryText, setCategoryText] = useState('');
  const [countryText, setCountryText] = useState('');
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'restored'>('idle');
  const [baselinePayload, setBaselinePayload] = useState<SeoStudioPayload | null>(null);
  const [baselineValidation, setBaselineValidation] = useState<SeoValidationResult>({ score: 0, issues: [] });
  const [fieldStates, setFieldStates] = useState<Record<string, SeoSafeFieldState>>({});
  const [baselineVersion, setBaselineVersion] = useState(0);
  const [unlockedFields, setUnlockedFields] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState<'quick' | 'deep'>('quick');
  const [aiSuggestion, setAiSuggestion] = useState<SeoAiSuggestionResult | null>(null);
  const [selectedAiFields, setSelectedAiFields] = useState<string[]>([]);
  const [simpleMode, setSimpleMode] = useState(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectMovieRef = useRef<(movie: SeoMovieSearchItem, preferredStep?: StepKey) => Promise<void>>(async () => undefined);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (validationTimer.current) clearTimeout(validationTimer.current);
    if (draftTimer.current) clearTimeout(draftTimer.current);
  }, []);

  const runSearch = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchSeoMovies(value)); }
      catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không tìm được phim.' }); }
      finally { setSearching(false); }
    }, 350);
  };

  const selectMovie = async (movie: SeoMovieSearchItem, preferredStep?: StepKey) => {
    setSelected(movie);
    setResults([]);
    setQuery(movie.name);
    setBusy('load');
    setNotice(null);
    try {
      const result = await loadSeoMovie(movie.id, movie.slug);
      const serverPayload = payloadFromLoad(result);
      const localDraft = readNewerLocalDraft(movie.id, result.profile?.updated_at);
      const serverDraft = result.safe_edit?.draft;
      const localDraftTime = Date.parse(localDraft?.savedAt || '') || 0;
      const serverDraftTime = Date.parse(serverDraft?.updated_at || '') || 0;
      const useLocalDraft = Boolean(localDraft && localDraftTime >= serverDraftTime);
      const nextPayload = useLocalDraft
        ? localDraft!.payload
        : serverDraft?.payload ?? serverPayload;
      const nextUnlockedFields = useLocalDraft
        ? localDraft?.unlockedFields ?? []
        : serverDraft?.unlocked_fields ?? [];
      setLoaded(result);
      setAiSuggestion(null);
      setSelectedAiFields([]);
      setBaselinePayload(result.safe_edit?.baseline ?? serverPayload);
      const initialValidation = await validateSeoDraft(nextPayload);
      setBaselineValidation(result.safe_edit?.baseline_validation ?? await validateSeoDraft(serverPayload));
      setFieldStates(result.safe_edit?.fields ?? {});
      setBaselineVersion(result.safe_edit?.baseline_version ?? Number(result.profile?.version || 0));
      setUnlockedFields(nextUnlockedFields);
      setLiveAudit(result.profile?.live_audit ?? null);
      setPayload(nextPayload);
      setSecondaryText(nextPayload.secondary_keywords.join(', '));
      setActorText(nextPayload.movie_patch.actor.join(', '));
      setDirectorText(nextPayload.movie_patch.director.join(', '));
      setCategoryText(nextPayload.movie_patch.category.map((item) => item.name).join(', '));
      setCountryText(nextPayload.movie_patch.country.map((item) => item.name).join(', '));
      const nextStep = useLocalDraft
        ? localDraft?.step ?? 'movie'
        : preferredStep ?? getPriorityAction(initialValidation, result.worker_status?.online).step;
      setStep(nextStep);
      writeLocalJson(LOCAL_SESSION_KEY, { movie, step: nextStep } satisfies LocalSeoSession);
      if (useLocalDraft || serverDraft) {
        setDraftState('restored');
        setNotice({ type: 'success', text: 'Đã khôi phục bản nháp an toàn; hồ sơ đang chạy vẫn được giữ nguyên.' });
      } else {
        setDraftState('idle');
      }
      setValidation(initialValidation);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không tải được dữ liệu SEO.' });
    } finally { setBusy(''); }
  };
  selectMovieRef.current = selectMovie;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSlug = params.get('movie')?.trim() || '';
    const requestedTask = params.get('task')?.trim() || '';
    if (requestedSlug) {
      const preferredStep: StepKey = requestedTask === 'fix_technical'
        ? 'technical'
        : requestedTask === 'strengthen_discovery'
          ? 'links'
          : requestedTask === 'capture_search_demand'
            ? 'search'
            : 'content';
      searchSeoMovies(requestedSlug)
        .then((items) => {
          const exact = items.find((item) => item.slug === requestedSlug) || items[0];
          if (exact) return selectMovieRef.current(exact, preferredStep);
          setNotice({ type: 'error', text: 'Không tìm thấy phim trong nhiệm vụ SEO này.' });
          return undefined;
        })
        .catch((error) => setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không mở được nhiệm vụ SEO.' }));
      return;
    }
    const session = readLocalJson<LocalSeoSession>(LOCAL_SESSION_KEY);
    if (!session?.movie?.id || !session.movie.slug) return;
    void selectMovieRef.current(session.movie, session.step);
  }, []);

  const updatePayload = <K extends keyof SeoStudioPayload>(key: K, value: SeoStudioPayload[K]) => {
    setPayload((current) => current ? { ...current, [key]: value } : current);
  };

  const updatePatch = <K extends keyof SeoMoviePatch>(key: K, value: SeoMoviePatch[K]) => {
    setPayload((current) => current ? { ...current, movie_patch: { ...current.movie_patch, [key]: value } } : current);
  };

  useEffect(() => {
    if (!payload) return;
    if (validationTimer.current) clearTimeout(validationTimer.current);
    validationTimer.current = setTimeout(() => {
      validateSeoDraft(payload).then(setValidation).catch(() => undefined);
    }, 650);
  }, [payload]);

  useEffect(() => {
    if (!payload || !selected) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    setDraftState('saving');
    draftTimer.current = setTimeout(() => {
      writeLocalJson(`${LOCAL_DRAFT_PREFIX}${payload.movie_id}`, {
        savedAt: new Date().toISOString(),
        payload,
        step,
        unlockedFields,
      } satisfies LocalSeoDraft);
      writeLocalJson(LOCAL_SESSION_KEY, { movie: selected, step } satisfies LocalSeoSession);
      setDraftState('saved');
    }, 450);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [payload, selected, step, unlockedFields]);

  const issuesByStep = useMemo(() => STEPS.reduce((result, item) => {
    result[item.key] = validation.issues.filter((issue) => issue.section === item.key && issue.severity !== 'success');
    return result;
  }, {} as Record<StepKey, SeoValidationIssue[]>), [validation]);

  const changedFields = useMemo(() => {
    if (!payload || !baselinePayload) return [];
    return Object.keys(FIELD_LABELS).filter((field) => comparableField(getPayloadField(payload, field)) !== comparableField(getPayloadField(baselinePayload, field)));
  }, [baselinePayload, payload]);
  const currentErrorCount = validation.issues.filter((issue) => issue.severity === 'error').length;
  const baselineErrorCount = baselineValidation.issues.filter((issue) => issue.severity === 'error').length;
  const hasScoreRegression = Boolean(baselinePayload && (validation.score < baselineValidation.score || currentErrorCount > baselineErrorCount));
  const isFieldLocked = (field: string) => Boolean(fieldStates[field]?.protected && !unlockedFields.includes(field));
  const protectedCount = Object.values(fieldStates).filter((state) => state.protected).length;
  const attentionCount = Object.values(fieldStates).filter((state) => state.status === 'needs_attention').length;
  const canPublish = useMemo(() => !validation.issues.some((issue) => issue.severity === 'error')
    && !hasScoreRegression
    && validation.score >= (payload?.index_mode === 'index' ? 85 : 80), [hasScoreRegression, payload?.index_mode, validation]);

  const unlockField = (field: string) => {
    if (fieldStates[field]?.status === 'immutable') return;
    setUnlockedFields((current) => current.includes(field) ? current : [...current, field]);
  };

  const syncTextFields = (next: SeoStudioPayload) => {
    setSecondaryText(next.secondary_keywords.join(', '));
    setActorText(next.movie_patch.actor.join(', '));
    setDirectorText(next.movie_patch.director.join(', '));
    setCategoryText(next.movie_patch.category.map((item) => item.name).join(', '));
    setCountryText(next.movie_patch.country.map((item) => item.name).join(', '));
  };

  const restoreField = (field: string) => {
    if (!payload || !baselinePayload) return;
    const next = replacePayloadField(payload, field, getPayloadField(baselinePayload, field));
    setPayload(next);
    syncTextFields(next);
    setUnlockedFields((current) => current.filter((item) => item !== field));
  };

  const restorePublishedBaseline = () => {
    if (!baselinePayload) return;
    setPayload(baselinePayload);
    syncTextFields(baselinePayload);
    setUnlockedFields([]);
    setValidation(baselineValidation);
    setLiveAudit(loaded?.profile?.live_audit ?? null);
    if (selected) removeLocalValue(`${LOCAL_DRAFT_PREFIX}${selected.id}`);
    setDraftState('idle');
    setNotice({ type: 'success', text: 'Đã khôi phục toàn bộ biểu mẫu về phiên bản đang chạy; website công khai không bị thay đổi.' });
  };

  const handleAiSuggest = async () => {
    if (!payload) return;
    setBusy('ai');
    setNotice(null);
    try {
      const result = await suggestSeoDraft(payload.movie_id, payload.slug, aiMode);
      setAiSuggestion(result);
      const safeDefaults = result.changed_fields.filter((field) => fieldStates[field]?.status === 'needs_attention');
      setSelectedAiFields(safeDefaults);
      setNotice({
        type: 'success',
        text: result.ai_available
          ? `${result.provider === 'gemini' ? 'Gemini' : 'AI'} đã tạo bản đề xuất có kiểm soát. ${safeDefaults.length} mục còn yếu được chọn sẵn; chưa có gì được xuất bản.`
          : 'Đã tạo gợi ý an toàn từ dữ liệu có sẵn. Muốn AI viết nội dung, máy chủ cần cấu hình khóa OpenAI.',
      });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'AI chưa tạo được bản đề xuất.' });
    } finally { setBusy(''); }
  };

  const applyAiSuggestion = () => {
    if (!payload || !aiSuggestion || selectedAiFields.length === 0) return;
    let next = payload;
    for (const field of selectedAiFields) {
      next = replacePayloadField(next, field, getPayloadField(aiSuggestion.proposed_payload, field));
    }
    setPayload(next);
    syncTextFields(next);
    setUnlockedFields((current) => Array.from(new Set([...current, ...selectedAiFields])));
    setNotice({ type: 'success', text: `Đã áp dụng ${selectedAiFields.length} mục vào bản nháp. Hãy đọc lại, kiểm tra trang thật rồi mới xuất bản.` });
  };

  const handleInspect = async () => {
    if (!payload) return;
    setBusy('inspect');
    setNotice(null);
    try {
      const result = await inspectSeoDraft(payload);
      setValidation(result.validation);
      setLiveAudit(result.live_audit);
      setNotice({
        type: result.validation.issues.some((issue) => issue.severity === 'error') ? 'error' : 'success',
        text: result.validation.issues.some((issue) => issue.severity === 'error')
          ? 'Trang thật hoặc tài nguyên vẫn còn lỗi cần xử lý.'
          : 'Trang thật, canonical, schema, ảnh và liên kết đã qua kiểm tra trước xuất bản.',
      });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không kiểm tra được trang thật.' });
    } finally { setBusy(''); }
  };

  const handleSave = async (publish: boolean) => {
    if (!payload) return;
    setBusy(publish ? 'publish' : 'save');
    setNotice(null);
    try {
      const safeEdit = { baseline_version: baselineVersion, unlocked_fields: unlockedFields };
      const result = publish ? await publishSeoDraft(payload, safeEdit) : await saveSeoDraft(payload, safeEdit);
      setValidation(result.validation);
      const publishedAudit = (result as { live_audit?: SeoLiveAuditResult }).live_audit;
      if (publishedAudit) setLiveAudit(publishedAudit);
      setNotice({ type: 'success', text: publish ? 'Đã xuất bản và xác minh HTML Googlebot, canonical, robots, schema cùng nội dung SEO thành công.' : 'Đã lưu bản nháp riêng; phiên bản SEO đang chạy không bị thay đổi.' });
      if (publish && selected) {
        const refreshed = await loadSeoMovie(selected.id, selected.slug);
        if (refreshed.profile?.status !== 'published' || refreshed.profile.index_mode !== payload.index_mode) {
          throw new Error('Máy chủ chưa xác nhận đúng trạng thái xuất bản. Bản nháp cục bộ vẫn được giữ an toàn.');
        }
        const refreshedPayload = payloadFromLoad(refreshed);
        setLoaded(refreshed);
        setBaselinePayload(refreshed.safe_edit.baseline);
        setBaselineValidation(refreshed.safe_edit.baseline_validation);
        setFieldStates(refreshed.safe_edit.fields);
        setBaselineVersion(refreshed.safe_edit.baseline_version);
        setUnlockedFields([]);
        setPayload(refreshedPayload);
        setLiveAudit(refreshed.profile.live_audit ?? publishedAudit ?? null);
        setSecondaryText(refreshedPayload.secondary_keywords.join(', '));
        setActorText(refreshedPayload.movie_patch.actor.join(', '));
        setDirectorText(refreshedPayload.movie_patch.director.join(', '));
        setCategoryText(refreshedPayload.movie_patch.category.map((item) => item.name).join(', '));
        setCountryText(refreshedPayload.movie_patch.country.map((item) => item.name).join(', '));
        removeLocalValue(`${LOCAL_DRAFT_PREFIX}${payload.movie_id}`);
        setDraftState('saved');
      }
    } catch (error) {
      if (error instanceof SeoStudioApiError && error.validation) setValidation(error.validation);
      if (error instanceof SeoStudioApiError && error.liveAudit) setLiveAudit(error.liveAudit);
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu dữ liệu.' });
    } finally { setBusy(''); }
  };

  const addFaq = () => updatePayload('faq', [...(payload?.faq ?? []), { question: '', answer: '' }]);
  const updateFaq = (index: number, patch: Partial<SeoFaqItem>) => {
    if (!payload) return;
    updatePayload('faq', payload.faq.map((item, position) => position === index ? { ...item, ...patch } : item));
  };
  const removeFaq = (index: number) => payload && updatePayload('faq', payload.faq.filter((_, position) => position !== index));
  const addTopic = () => updatePayload('topic_links', [...(payload?.topic_links ?? []), { title: '', url: '', anchor: '', description: '' }]);
  const updateTopic = (index: number, patch: Partial<SeoTopicLink>) => {
    if (!payload) return;
    updatePayload('topic_links', payload.topic_links.map((item, position) => position === index ? { ...item, ...patch } : item));
  };
  const removeTopic = (index: number) => payload && updatePayload('topic_links', payload.topic_links.filter((_, position) => position !== index));

  const pageTitle = payload?.seo_title || 'SEO Title chưa được đặt';
  const pageDescription = payload?.meta_description || 'Meta Description chưa được đặt.';
  const pageUrl = payload ? `https://khophim.org${payload.canonical_path}` : '';
  const workflowStage = step === 'movie' ? 'diagnose' : step === 'technical' ? 'verify' : 'create';
  const visibleIssues = workflowStage === 'create'
    ? validation.issues.filter((issue) => ['search', 'content', 'links'].includes(issue.section) && issue.severity !== 'success')
    : workflowStage === 'diagnose'
      ? validation.issues.filter((issue) => issue.section === 'movie' && issue.severity !== 'success')
      : validation.issues.filter((issue) => issue.section === 'technical' && issue.severity !== 'success');
  const activeSafeFields = workflowStage === 'create'
    ? [...STEP_FIELDS.search, ...STEP_FIELDS.content, ...STEP_FIELDS.links]
    : workflowStage === 'diagnose' ? STEP_FIELDS.movie : STEP_FIELDS.technical;
  const priorityAction = getPriorityAction(validation, loaded?.worker_status?.online);
  const priorityStep = STEPS.find((item) => item.key === priorityAction.step);

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080a10]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/admin/overview" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-white/50 hover:text-white"><i className="ri-arrow-left-line" /></Link>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-base font-bold"><i className="ri-seo-line text-emerald-400" /> SEO Studio</h1>
              <p className="truncate text-[11px] text-white/35">Một nơi duy nhất để chuẩn bị, kiểm tra và xuất bản SEO phim</p>
              {payload && <p className="mt-0.5 text-[10px] text-emerald-400/70">{draftState === 'saving' ? 'Đang tự lưu bản nháp…' : draftState === 'restored' ? 'Đã khôi phục bản nháp tự động' : draftState === 'saved' ? 'Bản nháp đã tự lưu trên máy này' : 'Bản nháp an toàn'}</p>}
            </div>
          </div>
          {payload && <div className="hidden items-center gap-2 sm:flex"><button onClick={() => setSimpleMode((current) => !current)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65 hover:text-white">{simpleMode ? 'Xem đầy đủ' : 'Chế độ đơn giản'}</button><div className="items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-300 lg:flex"><i className="ri-shield-check-line" /> AI không tự xuất bản</div></div>}
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
        {notice && <div className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}><i className={notice.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} /><span>{notice.text}</span></div>}

        {payload && <section data-kp-safe-edit="true" className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.055] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="flex items-center gap-2 text-sm font-bold text-emerald-300"><i className="ri-shield-check-line" /> Chế độ chỉnh sửa an toàn đang bật</p><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">Mục đã tốt được khóa mặc định. Bạn chỉ cần xử lý mục màu vàng; muốn sửa dữ liệu tốt phải mở khóa rõ ràng và hệ thống vẫn chặn nếu điểm SEO giảm.</p></div>
            <button onClick={restorePublishedBaseline} disabled={!changedFields.length} className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/65 disabled:opacity-30"><i className="ri-history-line" /> Khôi phục bản đang chạy</button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-black/20 px-3 py-2"><p className="text-[10px] uppercase text-white/30">Đang bảo vệ</p><strong className="text-sm text-emerald-300">{protectedCount} mục</strong></div>
            <div className="rounded-xl bg-black/20 px-3 py-2"><p className="text-[10px] uppercase text-white/30">Cần xử lý</p><strong className="text-sm text-amber-300">{attentionCount} mục</strong></div>
            <div className="rounded-xl bg-black/20 px-3 py-2"><p className="text-[10px] uppercase text-white/30">Đã thay đổi</p><strong className="text-sm text-cyan-300">{changedFields.length} mục</strong></div>
            <div className={`rounded-xl px-3 py-2 ${hasScoreRegression ? 'bg-red-500/10' : 'bg-black/20'}`}><p className="text-[10px] uppercase text-white/30">So với bản đang chạy</p><strong className={`text-sm ${hasScoreRegression ? 'text-red-300' : 'text-emerald-300'}`}>{hasScoreRegression ? 'Đang giảm chất lượng' : 'Không suy giảm'}</strong></div>
          </div>
          {!simpleMode && <div className="mt-3 flex flex-wrap gap-2">
            {activeSafeFields.map((field) => {
              const state = fieldStates[field];
              if (!state) return null;
              const changed = changedFields.includes(field);
              const locked = isFieldLocked(field);
              const tone = state.status === 'needs_attention'
                ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                : state.status === 'immutable'
                  ? 'border-violet-500/20 bg-violet-500/10 text-violet-200'
                  : 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-200';
              return <div key={field} title={state.reason} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${tone}`}>
                <i className={state.status === 'needs_attention' ? 'ri-error-warning-line' : state.status === 'immutable' ? 'ri-lock-2-line' : locked ? 'ri-shield-check-line' : 'ri-lock-unlock-line'} />
                <span>{FIELD_LABELS[field]}</span>
                {changed
                  ? <button onClick={() => restoreField(field)} className="font-semibold underline decoration-white/30 underline-offset-2">Hoàn tác</button>
                  : locked && state.status !== 'immutable'
                    ? <button onClick={() => unlockField(field)} className="font-semibold underline decoration-white/30 underline-offset-2">Mở sửa</button>
                    : state.status === 'needs_attention' ? <strong>Cần sửa</strong> : null}
              </div>;
            })}
          </div>}
        </section>}

        <section className="relative mb-5 rounded-2xl border border-white/[0.07] bg-[#10131d] p-4">
          <label className={labelClass}>Tìm phim cần làm SEO</label>
          <div className="relative">
            <i className="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={query} onChange={(event) => runSearch(event.target.value)} placeholder="Nhập tên phim, tên gốc hoặc slug..." className={`${inputClass} pl-10 pr-10`} />
            {(searching || busy === 'load') && <i className="ri-loader-4-line absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-emerald-400" />}
          </div>
          {results.length > 0 && <div className="absolute left-4 right-4 top-[88px] z-30 max-h-[430px] overflow-y-auto rounded-xl border border-white/10 bg-[#151925] p-2 shadow-2xl">
            {results.map((movie) => <button key={movie.id} onClick={() => void selectMovie(movie)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.06]">
              <img src={movie.thumb_url || movie.poster_url || '/images/movie-poster-fallback.svg'} alt="" className="h-14 w-10 rounded object-cover" />
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white/85">{movie.name}</strong><span className="block truncate text-xs text-white/35">{movie.origin_name || movie.slug} {movie.year ? `· ${movie.year}` : ''}</span></span>
              <span className={`rounded-full px-2 py-1 text-[10px] ${movie.is_published ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'}`}>{movie.is_published ? 'Đã đăng' : 'Ẩn'}</span>
            </button>)}
          </div>}
        </section>

        {!payload && <section className="mx-auto mt-20 max-w-xl text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10"><i className="ri-focus-3-line text-3xl text-emerald-400" /></div><h2 className="text-xl font-bold">Chọn một phim để bắt đầu</h2><p className="mt-2 text-sm leading-6 text-white/40">SEO Studio sẽ tải dữ liệu phim, review, trạng thái index và các tín hiệu chất lượng vào cùng một quy trình.</p></section>}

        {payload && loaded && <>
          <section data-kp-seo-next-action="true" className={`mb-5 rounded-2xl border p-4 ${priorityAction.blocking ? 'border-red-500/25 bg-red-500/[0.07]' : 'border-cyan-500/20 bg-cyan-500/[0.06]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${priorityAction.blocking ? 'text-red-300' : 'text-cyan-300'}`}>Hôm nay chỉ cần làm một việc</p><h2 className="mt-1 text-base font-bold">{priorityAction.title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/55">{priorityAction.description}</p></div><button onClick={() => setStep(priorityAction.step)} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${priorityAction.blocking ? 'bg-red-400 text-black' : 'bg-cyan-300 text-black'}`}>Mở {priorityStep?.short || 'việc này'} <i className="ri-arrow-right-line" /></button></div>
            <p className="mt-3 text-[11px] text-white/35">Các phần đang tốt được giữ nguyên. Hoàn thành việc này, Studio sẽ tự chỉ ra bước tiếp theo.</p>
          </section>
          <div className={`grid gap-5 ${simpleMode ? 'mx-auto max-w-4xl' : 'lg:grid-cols-[250px_minmax(0,1fr)_310px]'}`}>
          {!simpleMode && <aside className="space-y-3 lg:sticky lg:top-[82px] lg:self-start">
            <div className="rounded-2xl border border-white/[0.07] bg-[#10131d] p-3">
              <div className="mb-3 flex items-center gap-3 border-b border-white/[0.06] pb-3">
                <img src={payload.movie_patch.thumb_url || payload.movie_patch.poster_url || '/images/movie-poster-fallback.svg'} alt="" className="h-16 w-11 rounded-lg object-cover" />
                <div className="min-w-0"><p className="truncate text-sm font-bold">{payload.movie_patch.name}</p><p className="truncate text-[11px] text-white/35">/{payload.slug}</p><p className="mt-1 text-[10px] text-emerald-400">{loaded.profile?.status === 'published' ? 'SEO đã xuất bản' : 'Đang là bản nháp'}</p></div>
              </div>
              <nav className="space-y-1">
                {WORKFLOW_STAGES.map((item) => {
                  const sections = item.key === 'create' ? ['search', 'content', 'links'] : item.key === 'diagnose' ? ['movie'] : ['technical'];
                  const count = validation.issues.filter((issue) => sections.includes(issue.section) && issue.severity !== 'success').length;
                  return <button key={item.key} onClick={() => setStep(item.step)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs transition ${workflowStage === item.key ? 'bg-emerald-500/15 font-semibold text-emerald-300' : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'}`}><i className={item.icon} /><span className="min-w-0 flex-1"><strong className="block">{item.label}</strong><span className="mt-0.5 block text-[10px] font-normal opacity-60">{item.description}</span></span>{count > 0 ? <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-300">{count}</span> : <i className="ri-checkbox-circle-fill text-emerald-500/70" />}</button>;
                })}
              </nav>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-white/40"><p className="font-semibold text-white/65">Nguyên tắc an toàn</p><p className="mt-1">Bản nháp không thay đổi trang công khai. Chỉ nút “Xuất bản SEO” mới đồng bộ tất cả nội dung.</p></div>
            {loaded.insights?.work_item && <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-3 text-xs leading-5"><p className="font-semibold text-amber-300">Vì sao phim này cần làm?</p><p className="mt-1 text-white/50">{loaded.insights.work_item.reason || 'Bộ não SEO phát hiện tín hiệu còn thiếu.'}</p><p className="mt-2 text-[10px] uppercase text-white/30">Ưu tiên {loaded.insights.work_item.priority_score ?? 0}/100 · {loaded.insights.work_item.urgency || 'chưa xếp mức'}</p></div>}
          </aside>}

          <section className="min-w-0 rounded-2xl border border-white/[0.07] bg-[#10131d] p-4 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-white/[0.06] pb-4"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">{WORKFLOW_STAGES.find((item) => item.key === workflowStage)?.label}</p><h2 className="mt-1 text-lg font-bold">{payload.movie_patch.name}</h2></div>{visibleIssues.length > 0 && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300">{visibleIssues.length} mục cần xem</span>}</div>

            {step === 'movie' && <details open={visibleIssues.length > 0} className="rounded-xl border border-white/[0.07] bg-black/20 p-4"><summary className="cursor-pointer text-sm font-semibold text-white/75">{visibleIssues.length > 0 ? `${visibleIssues.length} mục dữ liệu phim cần xử lý` : 'Dữ liệu phim đang đạt — không cần sửa'} <span className="ml-2 text-xs font-normal text-white/35">Mở chi tiết khi cần</span></summary><div className="mt-5 space-y-5">
              <div className="grid gap-4 md:grid-cols-2"><div><label className={labelClass}>Tên hiển thị *</label><input disabled={isFieldLocked('movie_patch.name')} className={inputClass} value={payload.movie_patch.name} onChange={(event) => updatePatch('name', event.target.value)} /></div><div><label className={labelClass}>Tên tiếng Việt</label><input disabled={isFieldLocked('movie_patch.title_vi')} className={inputClass} value={payload.movie_patch.title_vi} onChange={(event) => updatePatch('title_vi', event.target.value)} /></div><div><label className={labelClass}>Tên tiếng Anh</label><input disabled={isFieldLocked('movie_patch.title_en')} className={inputClass} value={payload.movie_patch.title_en} onChange={(event) => updatePatch('title_en', event.target.value)} /></div><div><label className={labelClass}>Tên gốc</label><input disabled={isFieldLocked('movie_patch.origin_name')} className={inputClass} value={payload.movie_patch.origin_name} onChange={(event) => updatePatch('origin_name', event.target.value)} /></div></div>
              <div className="grid gap-4 sm:grid-cols-3"><div><label className={labelClass}>Năm</label><input disabled={isFieldLocked('movie_patch.year')} type="number" className={inputClass} value={payload.movie_patch.year || ''} onChange={(event) => updatePatch('year', Number(event.target.value || 0))} /></div><div><label className={labelClass}>Ngôn ngữ</label><input disabled={isFieldLocked('movie_patch.lang')} className={inputClass} value={payload.movie_patch.lang} onChange={(event) => updatePatch('lang', event.target.value)} placeholder="Vietsub" /></div><div><label className={labelClass}>Chất lượng</label><input disabled={isFieldLocked('movie_patch.quality')} className={inputClass} value={payload.movie_patch.quality} onChange={(event) => updatePatch('quality', event.target.value)} placeholder="HD" /></div></div>
              <div><label className={labelClass}>Thể loại * <span className="font-normal text-white/25">— cách nhau bằng dấu phẩy</span></label><input disabled={isFieldLocked('movie_patch.category')} className={inputClass} value={categoryText} onChange={(event) => { setCategoryText(event.target.value); updatePatch('category', taxonomyFromCsv(event.target.value)); }} placeholder="Hành động, Phiêu lưu" /></div>
              <div><label className={labelClass}>Quốc gia <span className="font-normal text-white/25">— cách nhau bằng dấu phẩy</span></label><input disabled={isFieldLocked('movie_patch.country')} className={inputClass} value={countryText} onChange={(event) => { setCountryText(event.target.value); updatePatch('country', taxonomyFromCsv(event.target.value)); }} placeholder="Âu Mỹ" /></div>
              <div><label className={labelClass}>Diễn viên <span className="font-normal text-white/25">— chỉ dùng dữ kiện đã xác minh</span></label><input disabled={isFieldLocked('movie_patch.actor')} className={inputClass} value={actorText} onChange={(event) => { setActorText(event.target.value); updatePatch('actor', listFromCsv(event.target.value)); }} /></div>
              <div><label className={labelClass}>Đạo diễn</label><input disabled={isFieldLocked('movie_patch.director')} className={inputClass} value={directorText} onChange={(event) => { setDirectorText(event.target.value); updatePatch('director', listFromCsv(event.target.value)); }} /></div>
              <div className="grid gap-4 md:grid-cols-2"><div><label className={labelClass}>Poster dọc *</label><input disabled={isFieldLocked('movie_patch.thumb_url')} className={inputClass} value={payload.movie_patch.thumb_url} onChange={(event) => updatePatch('thumb_url', event.target.value)} placeholder="https://..." /></div><div><label className={labelClass}>Backdrop ngang</label><input disabled={isFieldLocked('movie_patch.poster_url')} className={inputClass} value={payload.movie_patch.poster_url} onChange={(event) => updatePatch('poster_url', event.target.value)} placeholder="https://..." /></div></div>
              <div><label className={labelClass}>Trailer chính thức</label><input disabled={isFieldLocked('movie_patch.trailer_url')} className={inputClass} value={payload.movie_patch.trailer_url} onChange={(event) => updatePatch('trailer_url', event.target.value)} placeholder="https://www.youtube.com/embed/..." /></div>
            </div></details>}

            {workflowStage === 'create' && <div className="mb-6 space-y-4">
              <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.09] to-cyan-500/[0.04] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl"><p className="flex items-center gap-2 text-sm font-bold text-violet-200"><i className="ri-sparkling-2-line" /> Trợ lý AI SEO có kiểm soát</p><p className="mt-1 text-xs leading-5 text-white/45">AI đọc dữ liệu phim, nhiệm vụ của bộ não SEO và tín hiệu Google đang có để tạo bản nháp. AI không được đổi URL chuẩn, dữ liệu nhận diện, quyền index hoặc tự xuất bản.</p>{loaded.ai_available ? <p className="mt-2 text-[11px] text-emerald-300">Đang dùng {loaded.ai_provider === 'gemini' ? 'Gemini' : 'OpenAI'} ở phía máy chủ; khóa không được gửi xuống trình duyệt.</p> : <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-200">AI viết nội dung chưa được cấu hình trên máy chủ. Bạn vẫn có thể nhận gợi ý liên kết từ dữ liệu phim đang có; hệ thống không tự tạo nội dung giả.</p>}</div>
                  <div className="flex gap-2"><button onClick={() => setAiMode('quick')} className={`rounded-lg px-3 py-2 text-xs ${aiMode === 'quick' ? 'bg-white/10 text-white' : 'text-white/40'}`}>Nhanh</button><button onClick={() => setAiMode('deep')} className={`rounded-lg px-3 py-2 text-xs ${aiMode === 'deep' ? 'bg-white/10 text-white' : 'text-white/40'}`}>Kỹ hơn</button></div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={() => void handleAiSuggest()} disabled={!!busy} className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy === 'ai' ? 'Đang phân tích…' : loaded.ai_available === false ? 'Gợi ý từ dữ liệu có sẵn' : 'AI tạo bản đề xuất'}</button><span className="text-[11px] text-white/35"><i className="ri-shield-check-line text-emerald-400" /> Chỉ tạo nháp · có so sánh trước/sau · vẫn phải kiểm tra cứng</span></div>
              </div>

              {aiSuggestion && <div className="rounded-2xl border border-white/[0.08] bg-[#0b0e16] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-white/85">Bản đề xuất của {aiSuggestion.ai_available ? 'AI' : 'hệ thống dự phòng'}</p><p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">{aiSuggestion.summary}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] ${aiSuggestion.validation.score >= baselineValidation.score ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>Dự kiến {aiSuggestion.validation.score}/100</span></div>
                {aiSuggestion.warnings.length > 0 && <div className="mt-3 space-y-1">{aiSuggestion.warnings.map((warning) => <p key={warning} className="text-[11px] text-amber-300"><i className="ri-error-warning-line" /> {warning}</p>)}</div>}
                <div className="mt-4 space-y-2">{aiSuggestion.changed_fields.length > 0 ? aiSuggestion.changed_fields.map((field) => {
                  const checked = selectedAiFields.includes(field);
                  const protectedField = fieldStates[field]?.protected;
                  return <label key={field} className={`block cursor-pointer rounded-xl border p-3 ${checked ? 'border-violet-400/30 bg-violet-500/[0.08]' : 'border-white/[0.07] bg-white/[0.02]'}`}><div className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={() => setSelectedAiFields((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field])} className="mt-1 accent-violet-500" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-white/80">{FIELD_LABELS[field]}</strong>{protectedField && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-300">Đang tốt · không chọn sẵn</span>}</div><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/35"><span className="text-white/20">Hiện tại:</span> {previewValue(getPayloadField(payload, field))}</p><p className="mt-1 line-clamp-3 text-[11px] leading-5 text-violet-200/70"><span className="text-violet-300">Đề xuất:</span> {previewValue(getPayloadField(aiSuggestion.proposed_payload, field))}</p></div></div></label>;
                }) : <p className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-3 text-xs text-emerald-300">AI không tìm thấy thay đổi an toàn nào tốt hơn bản hiện tại.</p>}</div>
                {aiSuggestion.evidence.length > 0 && <details className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><summary className="cursor-pointer text-xs font-semibold text-white/55">Dữ kiện AI đã dùng ({aiSuggestion.evidence.length})</summary><div className="mt-3 space-y-2">{aiSuggestion.evidence.map((item, index) => <a key={`${item.field}-${index}`} href={item.source_url} target="_blank" rel="noreferrer" className="block text-[11px] leading-5 text-cyan-300/70 hover:text-cyan-200">{item.fact} · {item.confidence === 'high' ? 'tin cậy cao' : item.confidence === 'medium' ? 'tin cậy vừa' : 'cần kiểm tra lại'}</a>)}</div></details>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-white/35">Đã chọn {selectedAiFields.length}/{aiSuggestion.changed_fields.length} mục. Các mục tốt chỉ thay đổi khi bạn tự chọn.</p><button onClick={applyAiSuggestion} disabled={selectedAiFields.length === 0} className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-black disabled:opacity-30">Áp dụng vào bản nháp</button></div>
              </div>}

              <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-1.5">{[
                ['search', 'Hiển thị Google', 'ri-google-line'],
                ['content', 'Nội dung hữu ích', 'ri-article-line'],
                ['links', 'Cụm chủ đề', 'ri-links-line'],
              ].map(([target, label, icon]) => <button key={target} onClick={() => setStep(target as StepKey)} className={`rounded-lg px-2 py-2.5 text-[11px] font-semibold ${step === target ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}><i className={`${icon} mr-1`} /> {label}</button>)}</div>
            </div>}

            {step === 'search' && <div className="space-y-5">
              <div><label className={labelClass}>Từ khóa chính *</label><input disabled={isFieldLocked('focus_keyword')} className={inputClass} value={payload.focus_keyword} onChange={(event) => updatePayload('focus_keyword', event.target.value)} placeholder="spider man khởi đầu mới" /><p className="mt-1.5 text-[11px] text-white/30">Một trang chỉ nên có một ý định tìm kiếm chính.</p></div>
              <div><label className={labelClass}>Từ khóa liên quan</label><input disabled={isFieldLocked('secondary_keywords')} className={inputClass} value={secondaryText} onChange={(event) => { setSecondaryText(event.target.value); updatePayload('secondary_keywords', listFromCsv(event.target.value)); }} placeholder="tên gốc, diễn viên, lịch phát hành" /></div>
              <div><div className="mb-1.5 flex items-center justify-between"><label className="text-xs font-semibold text-white/60">SEO Title *</label><Counter value={payload.seo_title} recommended="khuyến nghị 35–68" /></div><input disabled={isFieldLocked('seo_title')} className={inputClass} value={payload.seo_title} onChange={(event) => updatePayload('seo_title', event.target.value)} /></div>
              <div><div className="mb-1.5 flex items-center justify-between"><label className="text-xs font-semibold text-white/60">Meta Description *</label><Counter value={payload.meta_description} recommended="khuyến nghị 100–160" /></div><textarea disabled={isFieldLocked('meta_description')} rows={4} className={inputClass} value={payload.meta_description} onChange={(event) => updatePayload('meta_description', event.target.value)} /></div>
              <div><label className={labelClass}>Ảnh chia sẻ</label><input disabled={isFieldLocked('og_image_url')} className={inputClass} value={payload.og_image_url} onChange={(event) => updatePayload('og_image_url', event.target.value)} placeholder="https://..." /></div>
              <div className="rounded-xl border border-white/[0.08] bg-white p-4 text-[#202124]"><p className="mb-1 text-sm text-[#202124]">{pageUrl.replace('https://', '')}</p><p className="line-clamp-2 text-xl text-[#1a0dab]">{pageTitle}</p><p className="mt-1 line-clamp-2 text-sm leading-5 text-[#4d5156]">{pageDescription}</p></div>
            </div>}

            {step === 'content' && <div className="space-y-6">
              <div><div className="mb-1.5 flex items-center justify-between"><label className="text-xs font-semibold text-white/60">Giới thiệu nguyên bản *</label><span className="text-[11px] text-white/30">{payload.intro_content.length} ký tự · {words(payload.intro_content)} từ</span></div><textarea disabled={isFieldLocked('intro_content')} rows={9} className={`${inputClass} leading-7`} value={payload.intro_content} onChange={(event) => updatePayload('intro_content', event.target.value)} placeholder="Giới thiệu phim bằng nội dung do bạn biên soạn..." /><p className="mt-1.5 text-[11px] leading-5 text-white/30">Nội dung này đồng bộ với phần “Nội dung phim” và được dùng để tạo snippet/schema.</p></div>
              <div><div className="mb-1.5 flex items-center justify-between"><label className="text-xs font-semibold text-white/60">Bài đánh giá chuyên sâu</label><span className="text-[11px] text-white/30">{words(payload.review_content)} từ</span></div><textarea disabled={isFieldLocked('review_content')} rows={15} className={`${inputClass} leading-7`} value={payload.review_content} onChange={(event) => updatePayload('review_content', event.target.value)} placeholder="Giới thiệu → cốt truyện → diễn xuất → hình ảnh → đánh giá → kết luận..." /></div>
              <div className="border-t border-white/[0.06] pt-5"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold">Câu hỏi thường gặp</h3><p className="mt-1 text-xs text-white/30">Chỉ trả lời dữ kiện đã xác minh.</p></div><button disabled={isFieldLocked('faq')} onClick={addFaq} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-30"><i className="ri-add-line" /> Thêm câu hỏi</button></div><div className="space-y-3">{payload.faq.map((item, index) => <div key={index} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex gap-2"><input disabled={isFieldLocked('faq')} className={inputClass} value={item.question} onChange={(event) => updateFaq(index, { question: event.target.value })} placeholder="Câu hỏi" /><button disabled={isFieldLocked('faq')} onClick={() => removeFaq(index)} className="h-11 w-11 flex-shrink-0 rounded-xl text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30"><i className="ri-delete-bin-line" /></button></div><textarea disabled={isFieldLocked('faq')} rows={3} className={`${inputClass} mt-2`} value={item.answer} onChange={(event) => updateFaq(index, { answer: event.target.value })} placeholder="Câu trả lời chính xác, ngắn gọn" /></div>)}</div></div>
            </div>}

            {step === 'links' && <div className="space-y-5">
              <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.05] p-4 text-xs leading-6 text-cyan-100/70"><strong className="text-cyan-300">Cụm chủ đề:</strong> liên kết tới phim khác sẽ tự tạo liên kết ngược trên trang phim đích. Với bài blog, diễn viên hoặc thể loại, hệ thống kiểm tra URL và hiển thị liên kết đi; chiều ngược cần có liên kết thật từ trang đích.</div>
              <div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">Liên kết nội bộ</h3><p className="mt-1 text-xs text-white/30">Nên có 2–6 liên kết thật sự liên quan.</p></div><button disabled={isFieldLocked('topic_links')} onClick={addTopic} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"><i className="ri-add-line" /> Thêm liên kết</button></div>
              <div className="space-y-3">{payload.topic_links.map((item, index) => <div key={index} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="grid gap-3 md:grid-cols-2"><div><label className={labelClass}>Tên bài/trang</label><input disabled={isFieldLocked('topic_links')} className={inputClass} value={item.title} onChange={(event) => updateTopic(index, { title: event.target.value })} /></div><div><label className={labelClass}>URL nội bộ</label><input disabled={isFieldLocked('topic_links')} className={inputClass} value={item.url} onChange={(event) => updateTopic(index, { url: event.target.value })} placeholder="/blog/..." /></div><div><label className={labelClass}>Anchor text</label><input disabled={isFieldLocked('topic_links')} className={inputClass} value={item.anchor} onChange={(event) => updateTopic(index, { anchor: event.target.value })} /></div><div><label className={labelClass}>Mô tả ngắn</label><input disabled={isFieldLocked('topic_links')} className={inputClass} value={item.description || ''} onChange={(event) => updateTopic(index, { description: event.target.value })} /></div></div><button disabled={isFieldLocked('topic_links')} onClick={() => removeTopic(index)} className="mt-3 text-xs text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"><i className="ri-delete-bin-line" /> Xóa liên kết</button></div>)}</div>
              {payload.topic_links.length === 0 && <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-white/30">Chưa có liên kết trong cụm chủ đề.</div>}
            </div>}

            {step === 'technical' && <div className="space-y-5">
              {loaded.worker_status?.online === false && <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] p-4 text-xs leading-6 text-red-200"><strong className="block text-sm">SEO Worker đang không chạy trên website thật</strong><span>Tại lúc tải phim, máy chủ kiểm tra trả HTTP {loaded.worker_status.status || 'lỗi mạng'}. Bạn vẫn có thể lưu nháp; hệ thống sẽ chặn xuất bản trước khi thay đổi SEO đang tốt. Dùng “Kiểm tra trang thật” để thử lại sau khi Worker hoạt động.</span></div>}
              <div><label className={labelClass}>Quyền index</label><div className="grid gap-2 sm:grid-cols-3">{[
                ['auto', 'Tự động', 'Theo cổng chất lượng hệ thống'],
                ['index', 'Cho phép index', 'Điểm ≥85 và kiểm tra trang thật đạt'],
                ['noindex', 'Không index', 'Ẩn khỏi kết quả tìm kiếm'],
              ].map(([value, title, desc]) => <button disabled={isFieldLocked('index_mode')} key={value} onClick={() => updatePayload('index_mode', value as SeoStudioPayload['index_mode'])} className={`rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-40 ${payload.index_mode === value ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/[0.07] bg-white/[0.02]'}`}><strong className="block text-xs text-white/80">{title}</strong><span className="mt-1 block text-[10px] leading-4 text-white/30">{desc}</span></button>)}</div></div>
              <div><label className={labelClass}>Canonical cố định</label><input readOnly className={`${inputClass} cursor-not-allowed text-white/45`} value={payload.canonical_path} /></div>
              <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] uppercase text-white/30">Cổng SEO hiện tại</p><p className={`mt-1 text-sm font-bold ${loaded.quality?.eligible_for_index ? 'text-emerald-400' : 'text-amber-300'}`}>{loaded.quality?.eligible_for_index ? 'Đủ điều kiện' : 'Chưa đủ'}</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] uppercase text-white/30">Tầng index</p><p className="mt-1 text-sm font-bold text-white/75">{loaded.quality?.index_tier || 'Chưa kiểm tra'}</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] uppercase text-white/30">Điểm hệ thống</p><p className="mt-1 text-sm font-bold text-white/75">{loaded.quality?.quality_score ?? 0}/100</p></div></div>
              <div><h3 className="mb-3 text-sm font-bold">Kết quả kiểm tra SEO Studio</h3><div className="space-y-2">{validation.issues.map((issue) => <IssueBadge key={`${issue.code}-${issue.section}`} issue={issue} />)}</div></div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#0b0e16] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-white/70">Kiểm tra trang thật</p><p className="mt-1 text-[11px] text-white/35">Mô phỏng Googlebot và kiểm tra HTTP, canonical, H1, schema, ảnh, liên kết.</p></div><button onClick={() => void handleInspect()} disabled={!!busy} className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 disabled:opacity-40">{busy === 'inspect' ? 'Đang kiểm tra...' : 'Kiểm tra trang thật'}</button></div>
                {liveAudit && <div className="mt-4 space-y-2">{liveAudit.checks.map((check) => <div key={check.code} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${check.passed ? 'bg-emerald-500/[0.07] text-emerald-300' : 'bg-red-500/[0.08] text-red-300'}`}><i className={check.passed ? 'ri-checkbox-circle-line' : 'ri-close-circle-line'} /><span>{check.message}</span></div>)}</div>}
              </div>
              <div className="sticky bottom-3 grid gap-3 rounded-2xl border border-white/10 bg-[#080a10]/95 p-3 shadow-2xl backdrop-blur-xl sm:grid-cols-2"><button onClick={() => void handleSave(false)} disabled={!!busy} className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white/70 disabled:opacity-40">{busy === 'save' ? 'Đang lưu…' : 'Lưu bản nháp'}</button><button onClick={() => void handleSave(true)} disabled={!!busy || !canPublish} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-35">{busy === 'publish' ? 'Đang xuất bản…' : 'Xuất bản toàn bộ SEO'}</button></div>
              {loaded.profile?.status === 'published' && <div className="flex flex-wrap gap-2"><a href={`/phim/${payload.slug}`} target="_blank" rel="noreferrer" className="rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/60 hover:text-white"><i className="ri-external-link-line" /> Mở trang phim</a><a href="https://search.google.com/search-console/inspect" target="_blank" rel="noreferrer" className="rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/60 hover:text-white"><i className="ri-google-line" /> Mở URL Inspection</a><a href="/sitemap-movies.xml" target="_blank" rel="noreferrer" className="rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/60 hover:text-white"><i className="ri-map-2-line" /> Kiểm tra sitemap</a></div>}
            </div>}

            {visibleIssues.length > 0 && step !== 'technical' && <div className="mt-6 border-t border-white/[0.06] pt-4"><p className="mb-2 text-xs font-semibold text-white/50">Cần xử lý ở bước này</p><div className="space-y-2">{visibleIssues.map((issue) => <IssueBadge key={issue.code} issue={issue} />)}</div></div>}
          </section>

          {!simpleMode && <aside className="space-y-4 lg:sticky lg:top-[82px] lg:self-start">
            <div className="rounded-2xl border border-white/[0.07] bg-[#10131d] p-4"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold text-white/60">Điểm sẵn sàng</p><p className={`mt-1 text-3xl font-black ${scoreColor(validation.score)}`}>{validation.score}<span className="text-base text-white/25">/100</span></p></div><div className="text-right text-[11px] leading-5 text-white/35"><p>{validation.issues.filter((item) => item.severity === 'error').length} lỗi bắt buộc</p><p>{validation.issues.filter((item) => item.severity === 'warning').length} cảnh báo</p></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${validation.score >= 80 ? 'bg-emerald-500' : validation.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${validation.score}%` }} /></div><p className="mt-3 text-[11px] leading-5 text-white/35">Đạt điểm chưa có nghĩa Google chắc chắn index. Hệ thống chỉ cho xuất bản khi không có lỗi chặn và không làm giảm bản đang chạy.</p></div>
            <div className="rounded-2xl border border-white/[0.07] bg-[#10131d] p-4"><p className="mb-3 text-xs font-semibold text-white/60">Xem trước kết quả</p><div className="rounded-xl bg-white p-3 text-[#202124]"><p className="truncate text-[10px]">{pageUrl.replace('https://', '')}</p><p className="mt-1 line-clamp-2 text-base text-[#1a0dab]">{pageTitle}</p><p className="mt-1 line-clamp-3 text-xs leading-4 text-[#4d5156]">{pageDescription}</p></div></div>
            {(loaded.insights?.search_metric || (loaded.insights?.search_queries?.length ?? 0) > 0) && <div className="rounded-2xl border border-white/[0.07] bg-[#10131d] p-4"><p className="text-xs font-semibold text-white/60">Tín hiệu Google gần nhất</p>{loaded.insights?.search_metric && <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/[0.03] p-2"><strong className="block text-sm text-white/75">{loaded.insights.search_metric.impressions ?? 0}</strong><span className="text-[9px] text-white/30">lượt thấy</span></div><div className="rounded-lg bg-white/[0.03] p-2"><strong className="block text-sm text-white/75">{loaded.insights.search_metric.clicks ?? 0}</strong><span className="text-[9px] text-white/30">lượt nhấp</span></div><div className="rounded-lg bg-white/[0.03] p-2"><strong className="block text-sm text-white/75">{Number(loaded.insights.search_metric.position || 0).toFixed(1)}</strong><span className="text-[9px] text-white/30">vị trí TB</span></div></div>}<div className="mt-3 space-y-1">{loaded.insights?.search_queries?.slice(0, 4).map((item) => <p key={item.query} className="truncate text-[10px] text-cyan-300/65">{item.query} · {item.impressions ?? 0} lượt thấy</p>)}</div></div>}
            <div className="rounded-2xl border border-white/[0.07] bg-[#10131d] p-4"><p className="text-xs font-semibold text-white/60">Sau khi xuất bản</p><ul className="mt-2 space-y-2 text-[11px] leading-5 text-white/35"><li>• Dữ liệu phim, review và hồ sơ SEO được đồng bộ cùng lúc.</li><li>• HTML Googlebot được kiểm tra bằng đúng phiên bản hồ sơ vừa xuất bản.</li><li>• Canonical, robots, schema, ảnh và liên kết nội bộ đều phải đạt.</li><li>• Nếu kiểm tra thất bại, hệ thống tự giữ trang ở noindex hoặc khôi phục bản tốt trước đó.</li><li>• Bản tĩnh và sitemap được đưa vào hàng đợi cập nhật sau khi xác minh.</li></ul></div>
          </aside>}
        </div></>}
      </main>
    </div>
  );
}
