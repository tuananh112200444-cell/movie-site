import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import AutoImport from "unplugin-auto-import/vite";
import { compression } from "vite-plugin-compression2";

const base = process.env.BASE_PATH || "/";
const isPreview = process.env.IS_PREVIEW ? true : false;

function readReleaseId() {
  try {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, 'public/release.json'), 'utf8')) as { release_id?: string };
    return String(manifest.release_id || 'development');
  } catch {
    return 'development';
  }
}

type HomeHeroMovie = {
  _id?: string;
  slug?: string;
  name?: string;
  poster_url?: string;
  thumb_url?: string;
  hero_poster_url?: string;
  hero_backdrop_url?: string;
  tmdb_vote_average?: number;
  tmdb_vote_count?: number;
  tmdb_popularity?: number;
  year?: number;
  [key: string]: unknown;
};

function readHomeHeroBootstrap(): HomeHeroMovie[] {
  try {
    let topRatedMovies: HomeHeroMovie[] = [];
    try {
      const topRatedSnapshot = JSON.parse(
        readFileSync(resolve(__dirname, 'public/top-rated-fallback.json'), 'utf8'),
      ) as { movies?: HomeHeroMovie[] };
      topRatedMovies = topRatedSnapshot.movies ?? [];
    } catch {
      topRatedMovies = [];
    }
    const snapshot = JSON.parse(
      readFileSync(resolve(__dirname, 'public/home-fallback.json'), 'utf8'),
    ) as { sections?: Record<string, HomeHeroMovie[]> };
    const unique = new Map<string, HomeHeroMovie>();
    const ordered = topRatedMovies.length > 0
      ? topRatedMovies
      : Object.values(snapshot.sections ?? {}).flat();
    ordered.forEach((movie) => {
      const key = String(movie._id || movie.slug || '').trim();
      if (!key || !movie.name || !(movie.hero_backdrop_url || movie.thumb_url || movie.hero_poster_url || movie.poster_url)) return;
      if (Number(movie.tmdb_vote_average || 0) <= 0) return;
      if (/ophim|opstream|tmdb.?catalog/i.test(`${movie.source_site || ''} ${movie.source_name || ''}`)) return;
      const current = unique.get(key);
      if (!current || Number(movie.tmdb_vote_average || 0) > Number(current.tmdb_vote_average || 0)) {
        unique.set(key, movie);
      }
    });
    return [...unique.values()]
      .sort((a, b) => {
        const ratingDiff = Number(b.tmdb_vote_average || 0) - Number(a.tmdb_vote_average || 0);
        if (ratingDiff !== 0) return ratingDiff;
        const voteDiff = Number(b.tmdb_vote_count || 0) - Number(a.tmdb_vote_count || 0);
        if (voteDiff !== 0) return voteDiff;
        const popularityDiff = Number(b.tmdb_popularity || 0) - Number(a.tmdb_popularity || 0);
        if (popularityDiff !== 0) return popularityDiff;
        return Number(b.year || 0) - Number(a.year || 0);
      })
      .slice(0, 8);
  } catch {
    return [];
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getHomeHeroPreloadUrl(path: string, compact: boolean): string {
  const raw = String(path || '').trim();
  if (!raw || !/^https?:/i.test(raw)) return raw;
  if (/^https?:\/\/image\.tmdb\.org\/t\/p\//i.test(raw)) {
    return raw.replace(/\/t\/p\/[^/]+\//i, `/t/p/${compact ? 'w780' : 'w1280'}/`);
  }
  const phimimg = raw.match(/^https?:\/\/(phimimg\.com)(\/[^?#]+)(?:[?#].*)?$/i);
  if (phimimg) {
    return `https://i0.wp.com/${phimimg[1]}${phimimg[2]}?w=${compact ? 900 : 1440}&quality=${compact ? 82 : 84}&strip=all`;
  }
  if (/^https?:\/\/icdn\.darkbytes\.xyz\//i.test(raw)) return raw;
  return `https://wsrv.nl/?url=${encodeURIComponent(raw)}&w=${compact ? 900 : 1440}&q=${compact ? 82 : 84}&output=webp&fit=cover&we&default=1`;
}

const entryCacheRevision = '20260823-prod-v10e';

function injectProductionReleaseMeta(releaseId: string) {
  return {
    name: 'khophim-release-meta',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html.replace(
        /<head>/,
        `<head>\n    <meta name="khophim-release" content="${releaseId}">`,
      );
    },
  };
}

function injectHomeHeroBootstrap(movies: HomeHeroMovie[]) {
  return {
    name: 'khophim-home-hero-bootstrap',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      if (movies.length === 0) return html;
      const first = movies[0];
      const mobileImage = getHomeHeroPreloadUrl(
        String(first.hero_poster_url || first.poster_url || first.hero_backdrop_url || first.thumb_url || ''),
        true,
      );
      const desktopImage = getHomeHeroPreloadUrl(
        String(first.hero_backdrop_url || first.thumb_url || first.hero_poster_url || first.poster_url || ''),
        false,
      );
      const preloads = [
        mobileImage
          ? `<link rel="preload" as="image" href="${escapeHtmlAttribute(mobileImage)}" fetchpriority="high" media="(max-width: 639px)" data-kp-home-hero-preload="mobile">`
          : '',
        desktopImage
          ? `<link rel="preload" as="image" href="${escapeHtmlAttribute(desktopImage)}" fetchpriority="high" media="(min-width: 640px)" data-kp-home-hero-preload="desktop">`
          : '',
      ].filter(Boolean).join('\n    ');
      const bootstrapJson = JSON.stringify(movies).replaceAll('<', '\\u003c');
      const bootstrap = `<script id="kp-home-hero-bootstrap" type="application/json">${bootstrapJson}</script>`;
      return html.replace('</head>', `    ${preloads}\n    ${bootstrap}\n  </head>`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => {
  // `prebuild` owns release generation. Vite only reads that immutable value so
  // Windows, CI and Cloudflare all publish the same manifest without a second
  // write racing the build process.
  const releaseId = readReleaseId();
  const homeHeroMovies = readHomeHeroBootstrap();
  return {
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __IS_PREVIEW__: isPreview,
    __READDY_PROJECT_ID__: JSON.stringify(process.env.PROJECT_ID || ""),
    __READDY_VERSION_ID__: JSON.stringify(process.env.VERSION_ID || ""),
    __READDY_AI_DOMAIN__: JSON.stringify(process.env.READDY_AI_DOMAIN || ""),
    __KP_RELEASE_ID__: JSON.stringify(releaseId),
  },
  plugins: [
    react(),
    // Gzip + Brotli compression giup giam manh dung luong truyen tai.
    compression({
      algorithms: ['gzip', 'brotliCompress'],
      exclude: [/\.(png|jpg|jpeg|gif|webp|svg|ico)$/],
    }),
    AutoImport({
      imports: [
        {
          react: [
            "React",
            "useState",
            "useEffect",
            "useContext",
            "useReducer",
            "useCallback",
            "useMemo",
            "useRef",
            "useImperativeHandle",
            "useLayoutEffect",
            "useDebugValue",
            "useDeferredValue",
            "useId",
            "useInsertionEffect",
            "useSyncExternalStore",
            "useTransition",
            "startTransition",
            "lazy",
            "memo",
            "forwardRef",
            "createContext",
            "createElement",
            "cloneElement",
            "isValidElement",
          ],
        },
        {
          "react-router-dom": [
            "useNavigate",
            "useLocation",
            "useParams",
            "useSearchParams",
            "Link",
            "NavLink",
            "Navigate",
            "Outlet",
          ],
        },
        // React i18n
        {
          "react-i18next": ["useTranslation", "Trans"],
        },
      ],
      dts: true,
    }),
    injectProductionReleaseMeta(releaseId),
    injectHomeHeroBootstrap(homeHeroMovies),
  ],
  base,
  build: {
    /* Tat sourcemap trong production de giam size. */
    sourcemap: false,
    outDir: "out",
    /* Nguong canh bao chunk size. */
    chunkSizeWarningLimit: 800,
    /* Tach CSS theo chunk de load nhanh hon. */
    cssCodeSplit: true,
    /* Minify bang esbuild de build nhanh va size tot. */
    minify: 'esbuild',
    /* Target modern browsers de giam polyfill khong can thiet. */
    target: ['es2020', 'chrome90', 'firefox88', 'safari14'],
    rollupOptions: {
      output: {
        /**
         * Tach vendor thanh chunk rieng de browser cache lau dai.
         * Khi code app thay doi, vendor chunk van duoc cache.
         */
        manualChunks(id) {
          // React core rat it thay doi, cache lau dai.
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // Routing
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router';
          }
          // i18n kha nang, tach rieng.
          if (id.includes('node_modules/react-i18next') || id.includes('node_modules/i18next')) {
            return 'vendor-i18n';
          }
          // Supabase chi load khi can.
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          // HLS player chi load tren trang phim detail.
          if (id.includes('node_modules/hls.js')) {
            return 'vendor-hls';
          }
        },
        /* Asset co hash de cache busting hieu qua. */
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: `assets/[name]-[hash]-${entryCacheRevision}.js`,
        entryFileNames: `assets/[name]-[hash]-${entryCacheRevision}.js`,
      },
      /* Tree-shaking tich cuc. */
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
  },
  };
});
