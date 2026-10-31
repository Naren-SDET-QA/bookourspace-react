import './index.css';

async function bootstrapApplication() {
  if (typeof window !== 'undefined') {
    try {
      if ((window as unknown as { __swReady?: Promise<boolean> }).__swReady) {
        const ready = await (window as unknown as { __swReady: Promise<boolean> }).__swReady;
        if (!ready) return;
      }
    } catch {
      // ignore cleanup errors
    }
  }

  await import('./main.tsx');
}

bootstrapApplication();
