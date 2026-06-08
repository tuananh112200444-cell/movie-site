import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import AutoImport from "unplugin-auto-import/vite";
import { compression } from "vite-plugin-compression2";

const base = process.env.BASE_PATH || "/";
const isPreview = process.env.IS_PREVIEW ? true : false;
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
    // Gzip + Brotli compression — giảm 60-70% bundle size khi transfer
    compression({
      algorithms: ['gzip', 'brotliCompress'],
      exclude: [/\.(png|jpg|jpeg|gif|webp|svg|ico)$/],
    }),
    // Auto-inject modulepreload for main entry chunk + vendor chunks — giúp browser tải JS sớm hơn ~200-400ms
    {
      name: 'inject-modulepreload',
      transformIndexHtml(html, context) {
        const bundle = context.bundle;
        if (!bundle) return html;

        // Collect all modulepreload targets: main + vendor chunks
        const preloadChunks: string[] = [];

        // Main entry
        const mainChunk = Object.keys(bundle).find(
          name => name.startsWith('assets/main-') && name.endsWith('.js')
        );
        if (mainChunk) preloadChunks.push(mainChunk);

        // Vendor chunks — critical for fast hydration
        const vendorPatterns = ['vendor-react', 'vendor-router', 'vendor-i18n'];
        for (const pattern of vendorPatterns) {
          const chunk = Object.keys(bundle).find(
            name => name.startsWith(`assets/${pattern}-`) && name.endsWith('.js')
          );
          if (chunk) preloadChunks.push(chunk);
        }

        if (preloadChunks.length === 0) return html;

        const links = preloadChunks.map(chunk =>
          `<link rel="modulepreload" href="${base}${chunk}" crossorigin>`
        ).join('\n    ');

        return html.replace('</head>', `${links}\n</head>`);
      },
    },
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
    /* Sourcemap tắt trong production để giảm size */
    sourcemap: false,
    outDir: "out",
    /* Ngưỡng cảnh báo chunk size */
    chunkSizeWarningLimit: 800,
    /* CSS code splitting — tách CSS theo chunk để load nhanh hơn */
    cssCodeSplit: true,
    /* Minify: esbuild nhanh hơn terser, kết quả tương đương */
    minify: 'esbuild',
    /* Target modern browsers — giảm polyfill không cần thiết */
    target: ['es2020', 'chrome90', 'firefox88', 'safari14'],
    rollupOptions: {
      output: {
        /**
         * Tách vendor thành chunks riêng → browser cache lâu dài.
         * Khi code app thay đổi, vendor chunk vẫn được cache.
         */
        manualChunks(id) {
          // React core — rất ít thay đổi, cache lâu dài
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // Routing
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router';
          }
          // i18n — khá nặng, tách riêng
          if (id.includes('node_modules/react-i18next') || id.includes('node_modules/i18next')) {
            return 'vendor-i18n';
          }
          // Supabase — chỉ load khi cần
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          // HLS player — chỉ load trên trang phim detail
          if (id.includes('node_modules/hls.js')) {
            return 'vendor-hls';
          }
        },
        /* Asset naming có hash → cache busting hiệu quả */
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
      /* Tree-shaking tích cực */
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
