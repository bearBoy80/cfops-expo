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

/**
 * Renewed grants that could not be written to the keychain.
 *
 * The exchange spends the old refresh token, so the moment Cloudflare answers,
 * the copy on disk is dead and the response is the only usable grant. Throwing
 * it away because a keychain write failed would cost the user a reconnect on a
 * session that is perfectly healthy, so it is held here instead and the write
 * is retried on the next renewal.
 */
const unpersisted = new Map<string, OauthTokens>();

function needsRenewal(tokens: OauthTokens): boolean {
  // No expiry recorded means the token endpoint returned no `expires_in`;
  // there is nothing to compare against, so leave the token alone and let a
  // rejected request surface the problem.
  return (
    tokens.expiresAt !== undefined &&
    tokens.expiresAt - REFRESH_MARGIN_MS <= Date.now()
  );
}

/**
 * Stored grant, unless a renewal we could not persist is the live one.
 *
 * A stored grant with life left in it was written after that renewal — the
 * retry landed, or the account was reconnected — so it takes over again.
 */
async function loadTokens(connectionId: string): Promise<OauthTokens | null> {
  const stored = await getConnectionOauthTokens(connectionId);
  const kept = unpersisted.get(connectionId);
  if (!kept) {
    return stored;
  }
  if (stored && !needsRenewal(stored)) {
    unpersisted.delete(connectionId);
    return stored;
  }
  return kept;
}

async function renew(
  connectionId: string,
  previous: OauthTokens & { refreshToken: string },
): Promise<string> {
  const refreshed = await refreshOauthTokens(previous.refreshToken);
  const next: OauthTokens = {
    ...refreshed,
    // Cloudflare may or may not rotate the refresh token; keep the working one
    // rather than storing undefined and stranding the session.
    refreshToken: refreshed.refreshToken ?? previous.refreshToken,
    // The token endpoint may omit `scope` when it is unchanged. A refresh can
    // never widen the grant, so carrying the old value forward is accurate.
    scope: refreshed.scope ?? previous.scope,
  };

  // `previous` is spent from here on. Record the replacement before writing it,
  // and hand out the access token even if that write fails: the grant is good,
  // and the alternative is telling the user to reconnect because the keychain
  // was busy.
  unpersisted.set(connectionId, next);
  try {
    await updateConnectionOauthTokens(connectionId, next);
    unpersisted.delete(connectionId);
  } catch (cause) {
    if (__DEV__) {
      console.warn('[oauth] renewed grant not persisted:', cause);
    }
  }
  return next.accessToken;
}

/**
 * Access token for an OAuth connection, renewed when it is at or near expiry.
 * Resolves to `null` only when the connection has no stored grant at all.
 *
 * Throws `session-expired` when the grant itself is gone, either because
 * `offline_access` was never granted (no refresh token was issued) or because
 * the refresh token has been revoked. Callers surface that as a prompt to
 * reconnect. A renewal that never reached Cloudflare throws `network` instead,
 * which leaves the stored grant intact and is safe to retry.
 */
export async function getOauthAccessToken(
  connectionId: string,
): Promise<string | null> {
  const tokens = await loadTokens(connectionId);
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

/** Drops in-flight and unpersisted renewal bookkeeping. Test helper. */
export function resetOauthSessions(): void {
  inFlight.clear();
  unpersisted.clear();
}
