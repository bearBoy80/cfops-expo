import Constants from 'expo-constants';
import {
  exchangeCodeAsync,
  makeRedirectUri,
  refreshAsync,
  type AuthRequest,
  type AuthSessionResult,
  type DiscoveryDocument,
  type TokenResponse,
} from 'expo-auth-session';
import { CloudflareApiError } from './api';

/**
 * Self-managed OAuth client endpoints, see
 * https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/
 */
export const discovery: DiscoveryDocument = {
  authorizationEndpoint: 'https://dash.cloudflare.com/oauth2/auth',
  tokenEndpoint: 'https://dash.cloudflare.com/oauth2/token',
  revocationEndpoint: 'https://dash.cloudflare.com/oauth2/revoke',
  userInfoEndpoint: 'https://dash.cloudflare.com/oauth2/userinfo',
};

interface OauthConfig {
  clientId: string;
  scopes: string[];
}

export function getOauthConfig(): OauthConfig | null {
  const extra = Constants.expoConfig?.extra?.cloudflareOauth as
    | Partial<OauthConfig>
    | undefined;

  if (!extra?.clientId || extra.clientId.trim().length === 0) {
    return null;
  }

  return {
    clientId: extra.clientId.trim(),
    scopes:
      Array.isArray(extra.scopes) && extra.scopes.length > 0
        ? extra.scopes
        : [
            'account.read',
            'workers.read',
            'workers_kv.read',
            'workers_r2.read',
            'd1.read',
            'pages.read',
            'offline_access',
          ],
  };
}

export const redirectUri = makeRedirectUri({
  scheme: 'cfops',
  path: 'oauth/callback',
});

export interface OauthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds after which the access token must be refreshed. */
  expiresAt?: number;
}

function toOauthTokens(response: TokenResponse): OauthTokens {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: response.expiresIn
      ? (response.issuedAt + response.expiresIn) * 1000
      : undefined,
  };
}

/**
 * Completes the Authorization Code + PKCE flow after the browser redirect,
 * exchanging the code (with the request's code verifier) for tokens.
 */
export async function exchangeAuthorizationCode(
  request: AuthRequest,
  result: AuthSessionResult,
): Promise<OauthTokens> {
  if (result.type !== 'success' || !result.params.code) {
    if (result.type === 'error') {
      throw new CloudflareApiError('oauth-failed', result.error?.description);
    }
    throw new CloudflareApiError('oauth-cancelled');
  }

  const config = getOauthConfig();
  if (!config) {
    throw new CloudflareApiError('oauth-config');
  }

  let response: TokenResponse;
  try {
    response = await exchangeCodeAsync(
      {
        clientId: config.clientId,
        code: result.params.code,
        redirectUri,
        extraParams: request.codeVerifier
          ? { code_verifier: request.codeVerifier }
          : undefined,
      },
      discovery,
    );
  } catch {
    throw new CloudflareApiError('network');
  }

  return toOauthTokens(response);
}

export async function refreshOauthTokens(
  refreshToken: string,
): Promise<OauthTokens> {
  const config = getOauthConfig();
  if (!config) {
    throw new CloudflareApiError('oauth-config');
  }

  let response: TokenResponse;
  try {
    response = await refreshAsync(
      { clientId: config.clientId, refreshToken },
      discovery,
    );
  } catch {
    throw new CloudflareApiError('session-expired');
  }

  return toOauthTokens(response);
}

export interface OauthIdentity {
  /** Stable subject id of the Cloudflare user that granted access. */
  sub: string;
  email?: string;
}

export async function fetchOauthIdentity(
  accessToken: string,
): Promise<OauthIdentity> {
  let response: Response;
  try {
    response = await fetch(discovery.userInfoEndpoint as string, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new CloudflareApiError('network');
  }

  if (response.status === 401 || response.status === 403) {
    throw new CloudflareApiError('invalid-token');
  }

  let body: { sub?: string; email?: string };
  try {
    body = (await response.json()) as { sub?: string; email?: string };
  } catch {
    throw new CloudflareApiError('api');
  }

  if (!body.sub) {
    throw new CloudflareApiError('identity');
  }

  return { sub: body.sub, email: body.email };
}
