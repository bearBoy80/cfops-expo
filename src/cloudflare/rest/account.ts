import { CloudflareApiError, request, requestEnvelope } from './client';

export interface TokenVerification {
  /** Cloudflare-assigned id of the token itself. */
  id: string;
  status: string;
}

export interface CfAccountRef {
  id: string;
  name: string;
}

export async function verifyToken(token: string): Promise<TokenVerification> {
  const result = await request<TokenVerification>(
    '/user/tokens/verify',
    token,
  );
  if (result.status !== 'active') {
    // Disabled/expired tokens surface as the generic invalid-token error.
    throw new CloudflareApiError('invalid-token');
  }
  return result;
}

export async function listAccounts(token: string): Promise<CfAccountRef[]> {
  const result = await request<CfAccountRef[]>(
    '/accounts?per_page=50',
    token,
  );
  return result.map(({ id, name }) => ({ id, name }));
}

export interface RumSite {
  siteTag: string;
  zoneId: string | null;
  zoneName: string | null;
  hosts: string[];
}

interface RawRumSite {
  site_tag?: string;
  ruleset?: { zone_tag?: string; zone_name?: string };
  rules?: { host?: string }[];
}

/** Web Analytics sites for an account (the dashboard "Web Analytics" page). */
export async function listRumSites(
  token: string,
  accountId: string,
): Promise<RumSite[]> {
  const sites: RumSite[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const envelope = await requestEnvelope<RawRumSite[]>(
      `/accounts/${accountId}/rum/site_info/list?page=${page}`,
      token,
    );
    const batch = envelope.result ?? [];
    for (const item of batch) {
      if (!item.site_tag) {
        continue;
      }
      sites.push({
        siteTag: item.site_tag,
        zoneId: item.ruleset?.zone_tag ?? null,
        zoneName: item.ruleset?.zone_name ?? null,
        hosts: (item.rules ?? [])
          .map((rule) => rule.host)
          .filter((host): host is string => Boolean(host)),
      });
    }
    if (batch.length === 0) {
      break;
    }
    const totalPages = envelope.result_info?.total_pages;
    if (!totalPages || page >= totalPages) {
      break;
    }
  }
  return sites;
}
