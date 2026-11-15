import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
