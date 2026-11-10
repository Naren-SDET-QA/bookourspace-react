import React from 'react';

const SECTION_RELOAD_MARKER = 'bos-section-reload-attempt';
const SECTION_RELOAD_QUERY = '__bos_reload';
const SECTION_RELOAD_COOLDOWN_MS = 30_000;

function readReloadAttempt(): number {
  try {
    return Number(window.sessionStorage.getItem(SECTION_RELOAD_MARKER) || 0);
  } catch {
    return 0;
  }
}

function markReloadAttempt(now: number): void {
  try {
    window.sessionStorage.setItem(SECTION_RELOAD_MARKER, String(now));
  } catch {
    // Private browsing or restricted storage should not break the fallback UI.
  }
}

function cacheBustedReload(force = false): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (!force && now - readReloadAttempt() < SECTION_RELOAD_COOLDOWN_MS) return;
  markReloadAttempt(now);
  const url = new URL(window.location.href);
  url.searchParams.set(SECTION_RELOAD_QUERY, String(now));
  window.location.replace(url.toString());
}

function clearReloadQuery(): void {
  if (typeof window === 'undefined' || !window.location.search.includes(`${SECTION_RELOAD_QUERY}=`)) return;
  const url = new URL(window.location.href);
  url.searchParams.delete(SECTION_RELOAD_QUERY);
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function isLazyModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /(?:dynamically imported module|importing a module script|loading chunk|chunkloaderror|failed to fetch dynamically imported)/i.test(message);
}

/**
 * Keeps the shared marketplace header alive when a lazily loaded section chunk
 * fails (stale Vite dep hash after a long dev session, or a bad deploy). Without
 * this, a dynamic import rejection unmounts the whole app and renders a blank
 * page.
 */
export class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; sectionKey?: string | null },
  { failed: boolean }
> {
  state = { failed: false };

  componentDidMount() {
    // The cache-busted document has already loaded successfully by the time
    // this boundary mounts. Remove the one-shot query without navigating.
    clearReloadQuery();
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[section] failed to load', this.props.sectionKey || '', error);
    // A stale Vite chunk or an interrupted CDN download is recoverable by
    // fetching a fresh document. Limit this to one attempt per 30 seconds so
    // a genuinely missing module cannot create an infinite reload loop.
    if (typeof window !== 'undefined' && isLazyModuleLoadError(error)
      && Date.now() - readReloadAttempt() >= SECTION_RELOAD_COOLDOWN_MS) {
      window.setTimeout(cacheBustedReload, 0);
    }
  }

  componentDidUpdate(previous: { sectionKey?: string | null }) {
    if (previous.sectionKey !== this.props.sectionKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto my-10 w-full max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/40">
        <p className="text-lg font-semibold text-amber-950 dark:text-amber-100">This section could not load</p>
        <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
          A file needed for this category was stale or failed to download. The header is still available.
        </p>
        <button
          type="button"
          onClick={() => cacheBustedReload(true)}
          className="mt-4 min-h-[44px] rounded-xl bg-[#222222] px-5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
        >
          Reload with fresh assets
        </button>
      </div>
    );
  }
}
