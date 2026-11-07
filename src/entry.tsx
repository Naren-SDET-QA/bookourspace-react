import './index.css';

async function bootstrapApplication() {
  if (typeof window !== 'undefined') {
    // Cache and service-worker maintenance is independent from rendering.
    // The HTML performs the compatibility cleanup in the background; waiting
    // here kept React and the Guest → Home path behind an unrelated 1.5s gate.
    void (window as unknown as { __swReady?: Promise<boolean> }).__swReady?.catch(() => false);
  }

  // App.tsx is the largest first-route chunk. Start its network fetch beside
  // the small runtime bootstrap rather than waiting until React mounts the
  // lazy root in main.tsx; the module is still evaluated through React.lazy.
  void import('./App.tsx').catch(() => undefined);
  await import('./main.tsx');
}

bootstrapApplication();
