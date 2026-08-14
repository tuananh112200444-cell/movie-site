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

const releaseId = readReleaseId();

function homeHeroPreloadPlugin() {
  return {
    name: 'khophim-home-hero-preload',
    transformIndexHtml() {
      try {
        const payload = JSON.parse(readFileSync(resolve(__dirname, 'public/home-fallback.json'), 'utf8')) as {
          sections?: { trending?: Array<{ hero_backdrop_url?: string; poster_url?: string; thumb_url?: string }> };
        };
        const movie = payload.sections?.trending?.[0];
        const mobilePath = String(movie?.poster_url || movie?.thumb_url || movie?.hero_backdrop_url || '').trim();
        const desktopPath = String(movie?.hero_backdrop_url || movie?.thumb_url || movie?.poster_url || '').trim();
        if (!mobilePath && !desktopPath) return [];
        const resolveOriginal = (path: string) => /^https?:\/\//i.test(path)
          ? path
          : `https://img.ophim.live/uploads/movies/${path.replace(/^\/+/, '')}`;
        // Keep these URLs byte-for-byte aligned with HeroBanner. A preload with
        // a different width or quality is a separate request and cannot improve
        // LCP even when it points to the same original poster.
        const optimized = (original: string, width: number, quality: number) => {
          if (/^https?:\/\/image\.tmdb\.org\/t\/p\//i.test(original)) {
            const size = width <= 672 ? 'w500' : 'w1280';
            return original.replace(/\/t\/p\/[^/]+\//i, `/t/p/${size}/`);
          }
          if (/^https?:\/\/phimimg\.com\//i.test(original)) {
            return `/cdn-cgi/image/width=${width},quality=${quality},format=auto,fit=cover/${original}`;
          }
          return `https://wsrv.nl/?url=${encodeURIComponent(original)}&w=${width}&q=${quality}&output=webp&fit=cover&we`;
        };
        const mobileOriginal = resolveOriginal(mobilePath || desktopPath);
        const desktopOriginal = resolveOriginal(desktopPath || mobilePath);
        return [
          { tag: 'link', injectTo: 'head', attrs: { rel: 'preload', as: 'image', href: optimized(mobileOriginal, 896, 78), media: '(max-width: 639px)', fetchpriority: 'high' } },
          { tag: 'link', injectTo: 'head', attrs: { rel: 'preload', as: 'image', href: optimized(desktopOriginal, 1680, 82), media: '(min-width: 640px)', fetchpriority: 'high' } },
        ];
      } catch {
        return [];
      }
    },
  };
}
// https://vite.dev/config/
export default defineConfig({
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __IS_PREVIEW__: isPreview,
    __READDY_PROJECT_ID__: JSON.stringify(process.env.PROJECT_ID || ""),
    __READDY_VERSION_ID__: JSON.stringify(process.env.VERSION_ID || ""),
    __READDY_AI_DOMAIN__: JSON.stringify(process.env.READDY_AI_DOMAIN || ""),
    __KP_RELEASE_ID__: JSON.stringify(releaseId),
  },
  plugins: [
    homeHeroPreloadPlugin(),
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
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
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
});
