import { useState } from 'react';
import { useAuthRequest } from 'expo-auth-session';
import { cloudflareErrorMessage } from '../i18n/errors';
import { invalidateAllSnapshots } from './cache';
import { addConnection, addOauthConnection } from './connections';
import {
  authorize,
  discovery,
  exchangeAuthorizationCode,
  fetchOauthIdentity,
  getOauthConfig,
} from './oauth';

export type ConnectBusy = 'oauth' | 'token' | null;

export interface ConnectAccount {
  busy: ConnectBusy;
  error: string | null;
  /** False until an OAuth client id is set in `extra.cloudflareOauth`. */
  oauthConfigured: boolean;
  canStartOauth: boolean;
  connectWithOauth: () => Promise<void>;
  connectWithToken: (token: string) => Promise<void>;
  clearError: () => void;
}

/**
 * Shared credential-binding state machine for the onboarding step and the
 * settings screen. `onConnected` runs only after the credential is stored, so
 * callers own what happens next (dismiss the screen, advance onboarding, …).
 *
 * Busy is always released, even on success. Holding it until the caller
 * navigates away looks tidier — no frame where the buttons re-enable — but it
 * wedges the screen whenever navigation does not happen, leaving a spinner with
 * no error and no way out.
 */
export function useConnectAccount(onConnected: () => void): ConnectAccount {
  const [busy, setBusy] = useState<ConnectBusy>(null);
  const [error, setError] = useState<string | null>(null);

  const oauthConfig = getOauthConfig();
  const [request] = useAuthRequest(
    {
      clientId: oauthConfig?.clientId ?? 'unconfigured',
      scopes: oauthConfig?.scopes ?? [],
      redirectUri: oauthConfig?.redirectUri ?? 'https://localhost/unconfigured',
    },
    discovery,
  );

  const canStartOauth = Boolean(oauthConfig && request) && busy === null;

  // Runs outside the binding try/catch: the credential is in the keychain by
  // now, so a callback that throws is not a binding failure and must not be
  // shown as one — the user would rebind something that is already there. It
  // must not escape either, since callers start these actions with `void`.
  const notifyConnected = () => {
    try {
      onConnected();
    } catch (cause) {
      if (__DEV__) {
        console.warn('[connect] post-connect callback threw', cause);
      }
    }
  };

  const connectWithOauth = async () => {
    if (!canStartOauth || !request) {
      return;
    }

    setBusy('oauth');
    setError(null);
    let connected = false;
    try {
      const result = await authorize(request);
      // Backing out of the sheet is not a failure worth reporting.
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }
      const tokens = await exchangeAuthorizationCode(request, result);
      const identity = await fetchOauthIdentity(tokens.accessToken);
      await addOauthConnection(tokens, identity);
      invalidateAllSnapshots();
      connected = true;
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    } finally {
      setBusy(null);
    }

    if (connected) {
      notifyConnected();
    }
  };

  const connectWithToken = async (token: string) => {
    if (token.trim().length === 0 || busy !== null) {
      return;
    }

    setBusy('token');
    setError(null);
    let connected = false;
    try {
      await addConnection(token);
      invalidateAllSnapshots();
      connected = true;
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    } finally {
      setBusy(null);
    }

    if (connected) {
      notifyConnected();
    }
  };

  return {
    busy,
    canStartOauth,
    clearError: () => setError(null),
    connectWithOauth,
    connectWithToken,
    error,
    oauthConfigured: oauthConfig !== null,
  };
}
