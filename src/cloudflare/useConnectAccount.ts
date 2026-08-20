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

  const connectWithOauth = async () => {
    if (!canStartOauth || !request) {
      return;
    }

    setBusy('oauth');
    setError(null);
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
      onConnected();
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const connectWithToken = async (token: string) => {
    if (token.trim().length === 0 || busy !== null) {
      return;
    }

    setBusy('token');
    setError(null);
    try {
      await addConnection(token);
      invalidateAllSnapshots();
      onConnected();
    } catch (cause) {
      setError(cloudflareErrorMessage(cause));
    } finally {
      setBusy(null);
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
