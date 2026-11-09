import { useEffect, useState } from 'react';
import type { ModuleAccess } from '../server/moduleGate';
import {
  fetchAuthorizedOwnerContact,
  fetchPlatformModuleFlags,
  recordAuthorizedOwnerContact,
} from './stayDiscoveryData';
import type { StayContactDetails } from './servicesStayRules';
import { canContactOwner, isValidListingContactId, resolveServicesModuleAccess } from './servicesStayRules';
import type { ServicesModuleKey } from './servicesStayRules';
import { supabase } from './supabaseClient';

export type OwnerContactState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

/**
 * Owner contact for the PG and home-services screens.
 *
 * Contact is only ever offered after the module flag, the signed-in session and
 * the authorised RPC all agree; anything else collapses to an explained,
 * disabled state. The phone number never comes from the listing payload.
 */
export function useOwnerContact(moduleKey: ServicesModuleKey) {
  const [access, setAccess] = useState<ModuleAccess>(resolveServicesModuleAccess(null, moduleKey));
  const [flagsSettled, setFlagsSettled] = useState(false);
  const [resolvedModuleKey, setResolvedModuleKey] = useState<ServicesModuleKey | null>(null);
  const [details, setDetails] = useState<StayContactDetails | null>(null);
  const [state, setState] = useState<OwnerContactState>('idle');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [activeListingId, setActiveListingId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setFlagsSettled(false);
    setAccess(resolveServicesModuleAccess(null, moduleKey));
    setResolvedModuleKey(null);
    setDetails(null);
    setActiveListingId('');
    setState('idle');
    (async () => {
      try {
        const flags = await fetchPlatformModuleFlags();
        if (cancelled) return;
        setAccess(resolveServicesModuleAccess(flags, moduleKey));
        setResolvedModuleKey(moduleKey);
      } catch {
        if (!cancelled) {
          setAccess(resolveServicesModuleAccess(null, moduleKey));
          setResolvedModuleKey(moduleKey);
        }
      } finally {
        if (!cancelled) setFlagsSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleKey]);

  const open = async (listingId: string) => {
    if (!flagsSettled || resolvedModuleKey !== moduleKey) {
      setActiveListingId('');
      setDetails(null);
      setMessage('');
      setState('idle');
      return;
    }
    setActiveListingId(isValidListingContactId(listingId) ? listingId : '');
    setDetails(null);
    setMessage('');
    setIsSignedIn(false);
    if (!isValidListingContactId(listingId) || !supabase) {
      setState('unavailable');
      return;
    }
    if (!access.enabled || !access.contactOwner) {
      setState('unavailable');
      setMessage(
        access.enabled
          ? 'Owner contact is disabled for this service right now.'
          : 'Owner contact is unavailable until this service is enabled.',
      );
      return;
    }
    setState('loading');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const signedIn = Boolean(authData.user);
      setIsSignedIn(signedIn);
      const authorised = await fetchAuthorizedOwnerContact(listingId);
      if (!authorised?.available || (!authorised.phone && !authorised.whatsapp)) {
        setState('unavailable');
        setMessage('The owner has not shared contact details for this listing.');
        return;
      }
      setDetails(authorised);
      setState('ready');
      if (!signedIn) setMessage('Sign in to contact this owner.');
    } catch {
      setState('error');
      setMessage('Contact details could not be loaded.');
    }
  };

  const contact = async (channel: 'call' | 'whatsapp', message?: string): Promise<boolean> => {
    if (!flagsSettled || resolvedModuleKey !== moduleKey || !details || busy || !canContactOwner(access, details, isSignedIn, channel)) return false;
    const value = channel === 'call' ? details.phone : details.whatsapp;
    if (!value) return false;
    setBusy(true);
    setMessage('');
    const recorded = await recordAuthorizedOwnerContact(activeListingId, channel).catch(() => false);
    setBusy(false);
    if (!recorded) {
      setMessage('We could not record this contact request. Please try again later.');
      return false;
    }
    const digits = value.replace(/[^0-9+]/g, '');
    if (!digits) {
      setMessage('The verified contact number is invalid.');
      return false;
    }
    if (channel === 'call') window.location.href = `tel:${digits}`;
    else {
      const text = message?.trim();
      const query = text ? `?text=${encodeURIComponent(text)}` : '';
      window.location.href = `https://wa.me/${digits.replace(/^\+/, '')}${query}`;
    }
    return true;
  };

  return { access, flagsSettled, details, state, isSignedIn, busy, message, activeListingId, open, contact };
}
