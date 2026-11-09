import React from 'react';
import { Compass, ShieldCheck } from 'lucide-react';
import BOSOfficialLogo from './BOSOfficialLogo';
import { DEMO_DATA_ENABLED } from '../lib/demoDataPolicy';

type EntryExperienceProps = {
  mode: 'loading' | 'welcome';
  onGoogleSignIn: () => void;
  onContinueAsGuest: () => void;
  onDemoSignIn?: (role: 'guest' | 'host') => void;
};

const GOOGLE_G = () => (
  <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7.1v-5.3H5.8a20 20 0 0 0 0 17.7l6.8-5.3Z" />
    <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z" />
  </svg>
);

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
  onContinueAsGuest,
  onDemoSignIn,
}: EntryExperienceProps) {
  const loading = mode === 'loading';

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

        {loading ? (
          <div className="bos-entry-loading">
            <p className="bos-entry-caption">Getting things ready…</p>
            <div className="bos-entry-progress" aria-hidden="true"><span /></div>
          </div>
        ) : (
          <div className="bos-entry-content">
            <h1 className="sr-only">Sign in to BookOurSpace</h1>
            <p className="bos-entry-subtitle">Sign in to continue booking spaces.</p>
            <p id="bos-entry-access-note" className="bos-entry-helper">
              New Google accounts get a profile automatically. Access levels are assigned securely.
            </p>

            <div className="bos-entry-actions">
              <button
                type="button"
                data-testid="entry-google-sign-in"
                onClick={(event) => {
                  // Safari/WebKit does not focus a button on click, so without
                  // this the auth dialog has no opener to return focus to.
                  event.currentTarget.focus();
                  onGoogleSignIn();
                }}
                aria-describedby="bos-entry-access-note"
                className="bos-entry-google"
              >
                <span className="bos-entry-google-icon"><GOOGLE_G /></span>
                <span>Continue with Google</span>
              </button>

              <div className="bos-entry-divider" role="separator" aria-label="or">
                <span>OR</span>
              </div>

              <button
                type="button"
                data-testid="entry-continue-guest"
                onClick={onContinueAsGuest}
                className="bos-entry-guest"
              >
                <Compass className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>Explore Spaces as Guest</span>
              </button>
            </div>

            <p className="bos-entry-trust">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#5EEAD4]" aria-hidden="true" />
              <span>Google-verified sign-in. Browse first; sign in when you’re ready to book or save favorites.</span>
            </p>

            {DEMO_DATA_ENABLED && onDemoSignIn && (
              <div className="bos-entry-demo">
                <p className="bos-entry-demo-title">Local demo database</p>
                <div className="bos-entry-demo-actions">
                  <button type="button" onClick={() => onDemoSignIn('guest')} className="bos-entry-demo-button">
                    Demo guest
                  </button>
                  <button type="button" onClick={() => onDemoSignIn('host')} className="bos-entry-demo-button">
                    Demo host
                  </button>
                </div>
                <p className="bos-entry-demo-note">Seed accounts only. Not available in production.</p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
