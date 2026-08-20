import { CloudflareApiError } from './api';
import {
  getConnectionOauthTokens,
  updateConnectionOauthTokens,
} from './connections';
import { refreshOauthTokens, type OauthTokens } from './oauth';

/**
 * Renew this far ahead of the real expiry. A request that passes the check with
 * milliseconds to spare would still reach Cloudflare with a dead token, and
 * clock skew between device and server makes the boundary fuzzy either way.
 */
const REFRESH_MARGIN_MS = 60_000;

/**
 * One in-flight renewal per connection.
 *
 * Screens fan out over accounts with `Promise.all`, so a cold tab can ask for
 * the same bearer a dozen times at once. Cloudflare rotates the refresh token
 * on use, so parallel renewals would each spend a token the previous one had
 * already invalidated and all but one would fail — taking the stored grant with
 * them. Sharing the promise keeps it to a single exchange.
 */
const inFlight = new Map<string, Promise<string>>();

function needsRenewal(tokens: OauthTokens): boolean {
  // No expiry recorded means the token endpoint returned no `expires_in`;
  // there is nothing to compare against, so leave the token alone and let a
  // rejected request surface the problem.
  return (
    tokens.expiresAt !== undefined &&
    tokens.expiresAt - REFRESH_MARGIN_MS <= Date.now()
  );
}

async function renew(
  connectionId: string,
  previous: OauthTokens & { refreshToken: string },
): Promise<string> {
  const next = await refreshOauthTokens(previous.refreshToken);
  await updateConnectionOauthTokens(connectionId, {
    ...next,
    // Cloudflare may or may not rotate the refresh token; keep the working one
    // rather than storing undefined and stranding the session.
    refreshToken: next.refreshToken ?? previous.refreshToken,
    // The token endpoint may omit `scope` when it is unchanged. A refresh can
    // never widen the grant, so carrying the old value forward is accurate.
    scope: next.scope ?? previous.scope,
  });
  return next.accessToken;
}

/**
 * Access token for an OAuth connection, renewed when it is at or near expiry.
 * Resolves to `null` only when the connection has no stored grant at all.
 *
 * Throws `session-expired` when the grant cannot be renewed, either because
 * `offline_access` was never granted (no refresh token was issued) or because
 * the refresh token itself has been revoked. Callers surface that as a prompt
 * to reconnect.
 */
export async function getOauthAccessToken(
  connectionId: string,
): Promise<string | null> {
  const tokens = await getConnectionOauthTokens(connectionId);
  if (!tokens) {
    return null;
  }
  if (!needsRenewal(tokens)) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new CloudflareApiError('session-expired');
  }

  const pending = inFlight.get(connectionId);
  if (pending) {
    return pending;
  }

  const renewable = { ...tokens, refreshToken: tokens.refreshToken };
  const task = renew(connectionId, renewable).finally(() => {
    inFlight.delete(connectionId);
  });
  inFlight.set(connectionId, task);
  return task;
}

/** Drops in-flight renewal bookkeeping. Test helper. */
export function resetOauthSessions(): void {
  inFlight.clear();
}
