import React from 'react';
import CustomerLoginExperience from './CustomerLoginExperience';
import type { AuthAccessConfig } from '../lib/authAccessClient';

/**
 * Full-page customer sign-in (`#login`).
 *
 * Presentation lives in `CustomerLoginExperience`, which the first-visit entry
 * screen also renders, so there is one customer login design. The handlers are
 * unchanged: Google opens the existing OAuth dialog, Guest writes the entry
 * choice, and email codes go through the same OTP endpoints and session
 * exchange this page used before.
 */
export function SimpleLoginPage({
  onClose,
  onGoogle,
  onContinueAsGuest,
  config,
  onSignedIn,
  onSelectService,
}: {
  onClose: () => void;
  onGoogle: () => void;
  onContinueAsGuest?: () => void;
  config?: AuthAccessConfig | null;
  onSignedIn?: (payload: {
    isNewUser?: boolean;
    redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  }) => void;
  onSelectService?: (service: string) => void;
}) {
  return (
    <CustomerLoginExperience
      onGoogle={onGoogle}
      onGuest={onContinueAsGuest}
      onClose={onClose}
      config={config}
      onSignedIn={onSignedIn}
      onSelectService={onSelectService}
    />
  );
}
