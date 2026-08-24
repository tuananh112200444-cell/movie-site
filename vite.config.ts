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

// https://vite.dev/config/
export default defineConfig(() => {
  // `prebuild` owns release generation. Vite only reads that immutable value so
  // Windows, CI and Cloudflare all publish the same manifest without a second
  // write racing the build process.
  const releaseId = readReleaseId();
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
