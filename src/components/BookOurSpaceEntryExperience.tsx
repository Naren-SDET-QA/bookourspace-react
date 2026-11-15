import React from 'react';
import BOSOfficialLogo from './BOSOfficialLogo';
import CustomerLoginExperience from './CustomerLoginExperience';
import { DEMO_DATA_ENABLED } from '../lib/demoDataPolicy';

type EntryExperienceProps = {
  mode: 'loading' | 'welcome';
  onGoogleSignIn: () => void;
  onEmailSignIn?: () => void;
  onContinueAsGuest: () => void;
  guestLoginEnabled?: boolean;
  onDemoSignIn?: (role: 'guest' | 'host') => void;
  /** Opens the chosen service in the marketplace behind the entry screen. */
  onSelectService?: (service: string) => void;
};

/**
 * Shared Flutter-matched entry experience for web and the Capacitor shells.
 *
 * The visual language follows the active Flutter LoginScreen/SplashScreen:
 * near-black canvas, teal/violet brand accents, the official BOS lockup with
 * its orange pin spinning like a top, Google as the only account provider,
 * and an explicit guest route. Authentication, role assignment, profile
 * provisioning, session persistence and post-auth navigation remain in the
 * existing Supabase flow in App.tsx; this component only presents the choice.
 */
export default function BookOurSpaceEntryExperience({
  mode,
  onGoogleSignIn,
  onEmailSignIn: _onEmailSignIn,
  onContinueAsGuest,
  guestLoginEnabled = false,
  onDemoSignIn,
  onSelectService,
}: EntryExperienceProps) {
  const loading = mode === 'loading';

  // The welcome step is the customer sign-in surface. Email and mobile live in
  // its own tabs, so the legacy email-page callback is no longer a separate
  // step; Google and Guest still route through App's existing handlers.
  if (!loading) {
    return (
      <div data-testid="bookourspace-welcome" className="contents">
        <CustomerLoginExperience
          onGoogle={onGoogleSignIn}
          onGuest={onContinueAsGuest}
          guestLoginEnabled={guestLoginEnabled}
          onSelectService={onSelectService}
        />
        {DEMO_DATA_ENABLED && onDemoSignIn && (
          // Anchored to the top-left corner: this local-only switcher must never
          // sit on top of the sign-in card it is meant to bypass.
          <div
            data-testid="bos-demo-signin"
            className="fixed left-2 top-2 z-[260] w-[min(78vw,300px)] rounded-2xl border border-white/20 bg-brand-navy/95 p-2.5 text-white shadow-xl sm:left-3 sm:top-3"
          >
            <p className="text-[10px] font-black uppercase tracking-wide text-brand-teal-light">Local demo database</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onDemoSignIn('guest')}
                className="min-h-9 flex-1 rounded-xl border border-white/25 px-3 text-[11px] font-black text-white transition hover:bg-white/10"
              >
                Demo guest
              </button>
              <button
                type="button"
                onClick={() => onDemoSignIn('host')}
                className="min-h-9 flex-1 rounded-xl border border-white/25 px-3 text-[11px] font-black text-white transition hover:bg-white/10"
              >
                Demo host
              </button>
            </div>
            <p className="mt-1.5 text-[9px] font-semibold text-white/60">Seed accounts only. Not available in production.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <main
      className="bos-entry-screen fixed inset-0 z-[200] flex min-h-[100dvh] items-center justify-center overflow-x-hidden overflow-y-auto text-[#F8FAFC]"
      role={loading ? 'status' : undefined}
      aria-live={loading ? 'polite' : undefined}
      aria-label={loading ? 'Loading BookOurSpace' : 'BookOurSpace sign in'}
      data-testid={loading ? 'bookourspace-splash' : 'bookourspace-welcome'}
    >
      <div className="bos-entry-backdrop" aria-hidden="true">
        <div className="bos-entry-aurora bos-entry-aurora--teal" />
        <div className="bos-entry-aurora bos-entry-aurora--violet" />
        <div className="bos-entry-aurora bos-entry-aurora--orange" />
      </div>

      <section className="bos-entry-panel">
        <div className="bos-entry-logo-stage">
          <div className="bos-entry-logo-plate">
            <BOSOfficialLogo
              animated
              loading="eager"
              className="bos-entry-official-logo w-full"
            />
          </div>
        </div>

        <div className="bos-entry-loading">
          <p className="bos-entry-caption">Getting things ready…</p>
          <div className="bos-entry-progress" aria-hidden="true"><span /></div>
        </div>
      </section>
    </main>
  );
}
