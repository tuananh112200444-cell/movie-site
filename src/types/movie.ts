export interface MovieCategory {
  id: string;
  name: string;
  slug: string;
}

export interface MovieCountry {
  id: string;
  name: string;
  slug: string;
}

export interface MovieItem {
  _id: string;
  name: string;
  slug: string;
  origin_name: string;
  type: string;
  thumb_url: string;
  poster_url: string;
  sub_docquyen: boolean;
  chieurap: boolean;
  time: string;
  episode_current: string;
  episode_total?: string;
  current_episode?: number;
  total_episodes?: number;
  schedule_type?: 'daily' | 'weekly' | 'custom' | '';
  release_time?: string;
  release_day?: number;
  schedule_timezone?: string;
  quality: string;
  lang: string;
  year: number;
  category: MovieCategory[];
  country: MovieCountry[];
  modified?: { time: string };
  title_vi?: string;
  title_en?: string;
  title_zh?: string;
  ophim_id?: string;
  tmdb_id?: string;
  source_site?: string;
  source_name?: string;
  is_copyright?: boolean;
  trailer_url?: string;
  view?: number;
  actor?: string[];
  director?: string[];
  status?: string;
  content?: string;
  notify?: string;
  showtimes?: string;
  release_at?: string;
  next_episode_at?: string;
  next_episode_name?: string;
  schedule_note?: string;
}

// Alias for convenience
export type Movie = MovieItem;

export interface MoviePagination {
  currentPage: number;
  totalItems: number;
  totalItemsPerPage: number;
  totalPages: number;
}

export interface MovieListResponse {
  status: boolean;
  items: MovieItem[];
  pagination: MoviePagination;
}

export interface EpisodeData {
  name: string;
  slug: string;
  filename: string;
  link_embed: string;
  link_m3u8: string;
  episode_number?: number;
  subtitle_url?: string;
  source_health_status?: string;
  source_response_time_ms?: number;
  source_failure_count?: number;
  source_priority?: number;
  is_scheduled?: boolean;
  scheduled_target_at?: string;
  scheduled_note?: string;
}

export interface EpisodeServer {
  server_name: string;
  server_data: EpisodeData[];
}

export interface MovieDetail {
  _id: string;
  name: string;
  slug: string;
  origin_name: string;
  content: string;
  type: string;
  status: string;
  thumb_url: string;
  poster_url: string;
  is_copyright: boolean;
  sub_docquyen: boolean;
  chieurap: boolean;
  trailer_url: string;
  time: string;
  episode_current: string;
  episode_total: string;
  current_episode?: number;
  total_episodes?: number;
  schedule_type?: 'daily' | 'weekly' | 'custom' | '';
  release_time?: string;
  release_day?: number;
  schedule_timezone?: string;
  quality: string;
  lang: string;
  notify: string;
  showtimes: string;
  release_at?: string;
  next_episode_at?: string;
  next_episode_name?: string;
  schedule_note?: string;
  year: number;
  view: number;
  actor: string[];
  director: string[];
  category: MovieCategory[];
  country: MovieCountry[];
  title_vi?: string;
  title_en?: string;
  title_zh?: string;
  ophim_id?: string;
  source_site?: string;
  source_name?: string;
  modified?: { time: string };
}

export interface MovieDetailResponse {
  status: boolean;
  movie: MovieDetail;
  episodes: EpisodeServer[];
}

export interface TMDBDisplayItem {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  rating: number;
  voteCount: number;
  year: number;
  mediaType: 'movie' | 'tv';
  genreIds: number[];
  imdbId?: string;
}
