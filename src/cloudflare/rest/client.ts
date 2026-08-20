const API_BASE = 'https://api.cloudflare.com/client/v4';

export type CloudflareApiErrorCode =
  | 'invalid-token'
  | 'forbidden'
  | 'network'
  | 'api'
  | 'oauth-cancelled'
  | 'oauth-failed'
  | 'oauth-config'
  | 'session-expired'
  | 'identity'
  | 'missing-credential';

const defaultMessages: Record<CloudflareApiErrorCode, string> = {
  'invalid-token': 'The API token is invalid or expired.',
  forbidden: 'The credential lacks permission for this resource.',
  network: 'Could not reach Cloudflare. Check your connection.',
  api: 'Cloudflare returned an unexpected response.',
  'oauth-cancelled': 'Authorization was cancelled.',
  'oauth-failed': 'Authorization failed.',
  'oauth-config': 'OAuth client is not configured.',
  'session-expired': 'The session has expired.',
  identity: 'Could not read the Cloudflare user identity.',
  'missing-credential': 'The stored credential is missing.',
};

export class CloudflareApiError extends Error {
  readonly code: CloudflareApiErrorCode;
  /**
   * Message returned by the Cloudflare API itself (already user-facing).
   * When absent, the UI translates the `code` instead.
   */
  readonly serverMessage?: string;

  constructor(code: CloudflareApiErrorCode, serverMessage?: string) {
    super(serverMessage ?? defaultMessages[code]);
    this.name = 'CloudflareApiError';
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

/**
 * Some accounts reject explicit pagination options on list endpoints with
 * "Invalid list options provided. Review the `page` or `per_page`
 * parameter." — support is not uniform across accounts/plans. Callers use
 * this to fall back to parameterless legacy pagination.
 */
export function isInvalidListOptions(cause: unknown): boolean {
  return (
    cause instanceof CloudflareApiError &&
    cause.code === 'api' &&
    /per_page|list options/i.test(cause.serverMessage ?? '')
  );
}

/**
 * Accounts (keyed per endpoint, e.g. "workers:acc-1") that rejected list
 * options. Remembered for the process lifetime so refreshes go straight to
 * the legacy pagination instead of repeating a doomed request every time.
 */
const legacyListAccounts = new Set<string>();

export function usesLegacyListOptions(key: string): boolean {
  return legacyListAccounts.has(key);
}

export function markLegacyListOptions(key: string): void {
  legacyListAccounts.add(key);
}

/** Drops the legacy-pagination bookkeeping. Test helper. */
export function resetLegacyListOptions(): void {
  legacyListAccounts.clear();
}

export interface CfEnvelope<T> {
  success: boolean;
  errors?: { code?: number; message?: string }[];
  result: T;
  result_info?: {
    total_count?: number;
    total_pages?: number;
    per_page?: number;
    cursor?: string;
  };
}

export interface ApiRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function requestEnvelope<T>(
  path: string,
  token: string,
  init?: ApiRequestInit,
): Promise<CfEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new CloudflareApiError('network');
  }

  if (response.status === 401) {
    throw new CloudflareApiError('invalid-token');
  }

  let envelope: CfEnvelope<T>;
  try {
    envelope = (await response.json()) as CfEnvelope<T>;
  } catch {
    if (response.status === 403) {
      throw new CloudflareApiError('forbidden');
    }
    throw new CloudflareApiError('api');
  }

  const error = envelope.errors?.[0];
  // Cloudflare often returns 10000 "Authentication error" for a valid token
  // that is simply missing the resource permission (not a bad credential).
  const permissionDenied =
    response.status === 403 ||
    error?.code === 10000 ||
    error?.message === 'Authentication error';
  if (permissionDenied) {
    throw new CloudflareApiError('forbidden');
  }

  if (response.status >= 400 || envelope.success === false) {
    throw new CloudflareApiError('api', error?.message);
  }

  return envelope;
}

export async function request<T>(
  path: string,
  token: string,
  init?: ApiRequestInit,
): Promise<T> {
  return (await requestEnvelope<T>(path, token, init)).result;
}
