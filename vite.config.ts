import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Isolate Playwright's optimized dependency cache from the user's regular
    // dev server so concurrent Vite processes cannot invalidate each other's
    // `/node_modules/.vite/deps/*` imports.
    ...(process.env.BOS_VITE_CACHE_DIR ? { cacheDir: process.env.BOS_VITE_CACHE_DIR } : {}),
    server: {
      // Capacitor copies the built web app into these native project trees.
      // Those generated files are not Vite source modules; watching them can
      // trigger full-page reloads while lazy route chunks are being fetched.
      watch: { ignored: ['**/android/**', '**/ios/**'] },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'lucide-react',
        'leaflet',
      ],
    },
    build: {
      // Keep the eagerly shared language dictionaries out of the root App
      // chunk. The same modules are reused by route-specific sections, so a
      // dedicated shared chunk avoids duplicating them across those screens.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'supabase-client',
                test: (id) => /[/\\]node_modules[/\\]@supabase[/\\]/.test(id),
                minShareCount: 1,
              },
              {
                name: 'marketplace-catalog',
                test: (id) => /[/\\]src[/\\]data[/\\](classesData|servicesStayMoviesData|venueData|pgHostelData|categoriesData|customerActions)\.ts$/.test(id),
                minShareCount: 1,
              },
              {
                name: 'localization-core',
                test: (id) => /[/\\]src[/\\]utils[/\\](translations|i18nEngine)\.ts$/.test(id),
                minShareCount: 1,
              },
              {
                name: 'app-state',
                test: (id) => /[/\\]src[/\\](?:context[/\\]MarketplaceContext\.tsx|utils[/\\]adminPresentationStore\.ts)$/.test(id),
                minShareCount: 1,
                includeDependenciesRecursively: false,
              },
            ],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // The local development PostgreSQL cluster lives under .local/. Its WAL
      // writes must never trigger a dev-server reload while a booking modal or
      // checkout page is open.
      watch: {
        ignored: ['**/.local/**', '**/test-results/**', '**/playwright-report/**'],
      },
    },
  };
});
