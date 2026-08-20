import { mapLimit } from '../../utils/concurrency';

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

/**
 * Pages walked at most, so a pathological account cannot turn one screen into
 * hundreds of requests. 20 pages of 100 covers every realistic list.
 */
const DEFAULT_MAX_PAGES = 20;

/**
 * Page requests in flight for one list. The snapshots already fan out over
 * accounts, so an unbounded inner fan-out multiplies into the rate limit.
 */
const PAGE_CONCURRENCY = 4;

/**
 * Walks a `page`-paginated list endpoint and returns every item.
 *
 * The first response reveals how many pages exist, so the rest are fetched
 * with bounded parallelism rather than one sequential round trip each. Callers
 * build the path per page, which is also how the `per_page`-less variant is
 * expressed for accounts that reject list options.
 */
export async function requestPaged<T>(
  pagePath: (page: number) => string,
  token: string,
  options?: { maxPages?: number },
): Promise<T[]> {
  const first = await requestEnvelope<T[]>(pagePath(1), token);
  const items = [...first.result];
  if (first.result.length === 0) {
    return items;
  }

  const info = first.result_info;
  // `per_page` is the page size the server actually applied, which is not
  // necessarily the one that was asked for. Falling back to the length of the
  // first page keeps endpoints that omit it from looking like a single page.
  const pageSize = info?.per_page ?? first.result.length;
  const totalPages =
    info?.total_pages ??
    (info?.total_count !== undefined && pageSize > 0
      ? Math.ceil(info.total_count / pageSize)
      : 1);

  const lastPage = Math.min(totalPages, options?.maxPages ?? DEFAULT_MAX_PAGES);
  if (lastPage <= 1) {
    return items;
  }

  const pages = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
  const envelopes = await mapLimit(pages, PAGE_CONCURRENCY, (page) =>
    requestEnvelope<T[]>(pagePath(page), token),
  );
  for (const envelope of envelopes) {
    items.push(...envelope.result);
  }
  return items;
}
