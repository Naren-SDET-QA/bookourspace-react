import React from 'react';

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

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[section] failed to load', this.props.sectionKey || '', error);
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
          onClick={() => window.location.reload()}
          className="mt-4 min-h-[44px] rounded-xl bg-[#222222] px-5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
        >
          Reload page
        </button>
      </div>
    );
  }
}
