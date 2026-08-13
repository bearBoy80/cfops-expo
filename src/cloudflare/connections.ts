import * as SecureStore from 'expo-secure-store';
import { listAccounts, verifyToken, type CfAccountRef } from './api';
import type { OauthIdentity, OauthTokens } from './oauth';

const CONNECTIONS_KEY = 'cf-connections-v1';

const tokenKey = (connectionId: string) => `cf-token-${connectionId}`;
const oauthKey = (connectionId: string) => `cf-oauth-${connectionId}`;

export type ConnectionAuthType = 'token' | 'oauth';

export interface CloudflareConnection {
  /**
   * Cloudflare token id for API tokens, or `oauth-<sub>` for OAuth grants.
   * Stable ids make re-adding the same credential idempotent.
   */
  id: string;
  label: string;
  authType: ConnectionAuthType;
  accounts: CfAccountRef[];
  createdAt: number;
}

function parseConnections(stored: string | null): CloudflareConnection[] {
  if (!stored) {
    return [];
  }

  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is CloudflareConnection =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as CloudflareConnection).id === 'string' &&
        typeof (item as CloudflareConnection).label === 'string' &&
        Array.isArray((item as CloudflareConnection).accounts),
    )
    .map((item) => ({
      ...item,
      // Entries persisted before OAuth support are API tokens.
      authType: item.authType === 'oauth' ? 'oauth' : 'token',
    }));
}

export async function listConnections(): Promise<CloudflareConnection[]> {
  const stored = await SecureStore.getItemAsync(CONNECTIONS_KEY);
  return parseConnections(stored);
}

async function saveConnections(
  connections: CloudflareConnection[],
): Promise<void> {
  await SecureStore.setItemAsync(
    CONNECTIONS_KEY,
    JSON.stringify(connections),
  );
}

async function upsertConnection(
  connection: CloudflareConnection,
): Promise<void> {
  const existing = await listConnections();
  await saveConnections([
    ...existing.filter((item) => item.id !== connection.id),
    connection,
  ]);
}

/**
 * Verifies the API token against Cloudflare, discovers the accounts it can
 * see, and persists the credential. Re-adding the same token replaces the
 * existing entry instead of duplicating it.
 */
export async function addConnection(
  token: string,
  label?: string,
): Promise<CloudflareConnection> {
  const trimmed = token.trim();
  const verification = await verifyToken(trimmed);
  const accounts = await listAccounts(trimmed);

  const connection: CloudflareConnection = {
    id: verification.id,
    label:
      label?.trim() ||
      (accounts.length > 0 ? accounts[0].name : 'API Token'),
    authType: 'token',
    accounts,
    createdAt: Date.now(),
  };

  await SecureStore.setItemAsync(tokenKey(connection.id), trimmed);
  await upsertConnection(connection);
  return connection;
}

/**
 * Persists an OAuth grant after the PKCE flow: discovers the accounts the
 * access token can see and stores the token bundle in the keychain. Repeated
 * grants by the same Cloudflare user replace the existing entry.
 */
export async function addOauthConnection(
  tokens: OauthTokens,
  identity: OauthIdentity,
): Promise<CloudflareConnection> {
  const accounts = await listAccounts(tokens.accessToken);

  const connection: CloudflareConnection = {
    id: `oauth-${identity.sub}`,
    label:
      identity.email ||
      (accounts.length > 0 ? accounts[0].name : 'Cloudflare OAuth'),
    authType: 'oauth',
    accounts,
    createdAt: Date.now(),
  };

  await SecureStore.setItemAsync(
    oauthKey(connection.id),
    JSON.stringify(tokens),
  );
  await upsertConnection(connection);
  return connection;
}

export async function removeConnection(connectionId: string): Promise<void> {
  const existing = await listConnections();
  await saveConnections(existing.filter((item) => item.id !== connectionId));
  await SecureStore.deleteItemAsync(tokenKey(connectionId));
  await SecureStore.deleteItemAsync(oauthKey(connectionId));
}

export async function getConnectionToken(
  connectionId: string,
): Promise<string | null> {
  return SecureStore.getItemAsync(tokenKey(connectionId));
}

export async function getConnectionOauthTokens(
  connectionId: string,
): Promise<OauthTokens | null> {
  const stored = await SecureStore.getItemAsync(oauthKey(connectionId));
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as OauthTokens;
  } catch {
    return null;
  }
}

export async function updateConnectionOauthTokens(
  connectionId: string,
  tokens: OauthTokens,
): Promise<void> {
  await SecureStore.setItemAsync(
    oauthKey(connectionId),
    JSON.stringify(tokens),
  );
}
