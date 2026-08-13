import { CloudflareApiError, listZones, type CfZone } from './api';
import {
  getConnectionOauthTokens,
  getConnectionToken,
  listConnections,
  type CloudflareConnection,
} from './connections';

export interface ZoneListItem extends CfZone {
  connectionId: string;
}

export interface AccountSummary {
  id: string;
  name: string;
  zoneCount: number;
}

export interface ConnectionIssue {
  connectionId: string;
  label: string;
  /** The failure, kept as an error so the UI can translate its code. */
  cause: CloudflareApiError;
}

export interface ZonesSnapshot {
  connectionCount: number;
  zones: ZoneListItem[];
  accounts: AccountSummary[];
  issues: ConnectionIssue[];
}

/** Resolves the bearer used for API calls, regardless of credential type. */
export async function getConnectionBearer(
  connection: CloudflareConnection,
): Promise<string | null> {
  if (connection.authType === 'oauth') {
    const tokens = await getConnectionOauthTokens(connection.id);
    return tokens?.accessToken ?? null;
  }
  return getConnectionToken(connection.id);
}

/** Looks up a stored connection by id and resolves its bearer. */
export async function getBearerForConnection(
  connectionId: string,
): Promise<string> {
  const connections = await listConnections();
  const connection = connections.find((item) => item.id === connectionId);
  const bearer = connection ? await getConnectionBearer(connection) : null;
  if (!bearer) {
    throw new CloudflareApiError('missing-credential');
  }
  return bearer;
}

async function fetchSnapshot(): Promise<ZonesSnapshot> {
  const connections = await listConnections();
  const zonesById = new Map<string, ZoneListItem>();
  const issues: ConnectionIssue[] = [];

  await Promise.all(
    connections.map(async (connection) => {
      try {
        const bearer = await getConnectionBearer(connection);
        if (!bearer) {
          throw new CloudflareApiError('missing-credential');
        }
        const zones = await listZones(bearer);
        for (const zone of zones) {
          // The same zone can be visible through several credentials.
          if (!zonesById.has(zone.id)) {
            zonesById.set(zone.id, { ...zone, connectionId: connection.id });
          }
        }
      } catch (cause) {
        issues.push({
          connectionId: connection.id,
          label: connection.label,
          cause:
            cause instanceof CloudflareApiError
              ? cause
              : new CloudflareApiError('api'),
        });
      }
    }),
  );

  const zones = [...zonesById.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Accounts discovered at connect time are the base, so accounts without
  // any zones still show up in the overview.
  const accountsById = new Map<string, AccountSummary>();
  for (const connection of connections) {
    for (const account of connection.accounts) {
      if (!accountsById.has(account.id)) {
        accountsById.set(account.id, {
          id: account.id,
          name: account.name,
          zoneCount: 0,
        });
      }
    }
  }
  for (const zone of zones) {
    const existing = accountsById.get(zone.accountId);
    if (existing) {
      existing.zoneCount += 1;
    } else if (zone.accountId) {
      accountsById.set(zone.accountId, {
        id: zone.accountId,
        name: zone.accountName,
        zoneCount: 1,
      });
    }
  }

  return {
    connectionCount: connections.length,
    zones,
    accounts: [...accountsById.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    issues,
  };
}

const SNAPSHOT_TTL_MS = 30_000;

let cached: { at: number; promise: Promise<ZonesSnapshot> } | null = null;

/**
 * Aggregated zones across every stored credential. Results are cached
 * briefly so Home and Zones do not both hit the API on every focus.
 */
export function fetchZonesSnapshot(options?: {
  force?: boolean;
}): Promise<ZonesSnapshot> {
  const now = Date.now();
  if (!options?.force && cached && now - cached.at < SNAPSHOT_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchSnapshot();
  cached = { at: now, promise };
  // A failed fetch should not poison the cache window.
  promise.catch(() => {
    if (cached?.promise === promise) {
      cached = null;
    }
  });
  return promise;
}

export function invalidateZonesSnapshot(): void {
  cached = null;
}
