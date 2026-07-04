import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import AutoImport from "unplugin-auto-import/vite";
import { compression } from "vite-plugin-compression2";

const base = process.env.BASE_PATH || "/";
const isPreview = process.env.IS_PREVIEW ? true : false;
const assetVersion = process.env.BUILD_ASSET_VERSION || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);

function appendAssetVersion() {
  return {
    name: "append-asset-version",
    closeBundle() {
      const indexPath = resolve(__dirname, "out/index.html");
      let html = readFileSync(indexPath, "utf8");
      html = html.replace(
        /(src|href)="(\/assets\/[^"]+\.(?:js|css))(?:\?v=[^"]*)?"/g,
        `$1="$2?v=${assetVersion}"`
      );
      writeFileSync(indexPath, html);
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
  },
  plugins: [
    react(),
    appendAssetVersion(),
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
