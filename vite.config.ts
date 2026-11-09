import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // AI Studio runs the production build from /app/applet without a database.
  // Enable the clearly-labelled demo fixtures for that cloud preview only; a
  // Cloud Run/normal production build never receives these defines.
  const aiStudioBuild = process.cwd().startsWith('/app/applet')
    || process.env.AI_STUDIO === 'true'
    || process.env.BUILD_TARGET === 'ai-studio';
  const aiStudioDefines = aiStudioBuild ? {
    'import.meta.env.VITE_ENABLE_DEMO_DATA': JSON.stringify('true'),
    'import.meta.env.VITE_AI_STUDIO_DEMO': JSON.stringify('true'),
  } : {};
  // Keep the normal localhost server out of Vite's shared node_modules/.vite
  // cache. Playwright, previews, and another dev server can otherwise rewrite
  // the optimized Leaflet bundle while a lazy section is importing it, which
  // produces a transient 504 "Outdated Optimize Dep" and rejects the whole
  // section import. Tests may still provide an explicit isolated cache dir.
  const viteCacheDir = process.env.BOS_VITE_CACHE_DIR
    || path.join(process.cwd(), '.local', `vite-cache-${process.env.PORT || '3000'}`);
  return {
    define: aiStudioDefines,
    plugins: [react(), tailwindcss()],
    // Isolate Playwright's optimized dependency cache from the user's regular
    // dev server so concurrent Vite processes cannot invalidate each other's
    // `/node_modules/.vite/deps/*` imports.
    cacheDir: viteCacheDir,
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
        // Capacitor copies the built web app into these native project trees.
        // Those generated files are not Vite source modules; watching them can
        // trigger full-page reloads while lazy route chunks are being fetched.
        ignored: ['**/.local/**', '**/test-results/**', '**/playwright-report/**', '**/android/**', '**/ios/**'],
      },
    },
  };
});
