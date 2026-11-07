import './index.css';

async function bootstrapApplication() {
  if (typeof window !== 'undefined') {
    try {
      if ((window as unknown as { __swReady?: Promise<boolean> }).__swReady) {
        await Promise.race([
          (window as unknown as { __swReady: Promise<boolean> }).__swReady,
          // A stale service-worker/cache cleanup must not hold native launch on
          // the HTML prelaunch screen. Cleanup continues in the background.
          new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), 1500)),
        ]);
      }
    } catch {
      // ignore cleanup errors
    }
  }

  await import('./main.tsx');
}

bootstrapApplication();
