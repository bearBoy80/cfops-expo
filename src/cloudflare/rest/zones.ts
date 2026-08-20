import { request } from './client';

export interface CfZone {
  id: string;
  name: string;
  /** active | pending | initializing | moved | deleted | deactivated */
  status: string;
  paused: boolean;
  plan: string;
  accountId: string;
  accountName: string;
  nameServers: string[];
}

interface RawZone {
  id: string;
  name: string;
  status: string;
  paused?: boolean;
  plan?: { name?: string };
  account?: { id?: string; name?: string };
  name_servers?: string[];
}

function toZone(raw: RawZone): CfZone {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    paused: raw.paused ?? false,
    plan: raw.plan?.name ?? 'Free',
    accountId: raw.account?.id ?? '',
    accountName: raw.account?.name ?? '',
    nameServers: raw.name_servers ?? [],
  };
}

export async function listZones(token: string): Promise<CfZone[]> {
  const result = await request<RawZone[]>('/zones?per_page=50', token);
  return result.map(toZone);
}

export async function getZone(token: string, zoneId: string): Promise<CfZone> {
  const result = await request<RawZone>(`/zones/${zoneId}`, token);
  return toZone(result);
}

export async function getZoneSslMode(
  token: string,
  zoneId: string,
): Promise<string> {
  const result = await request<{ value: string }>(
    `/zones/${zoneId}/settings/ssl`,
    token,
  );
  return result.value;
}

export type ZoneSecurityLevel =
  | 'off'
  | 'essentially_off'
  | 'low'
  | 'medium'
  | 'high'
  | 'under_attack';

export async function getZoneSecurityLevel(
  token: string,
  zoneId: string,
): Promise<ZoneSecurityLevel> {
  const result = await request<{ value: string }>(
    `/zones/${zoneId}/settings/security_level`,
    token,
  );
  return result.value as ZoneSecurityLevel;
}

export async function setZoneSecurityLevel(
  token: string,
  zoneId: string,
  value: ZoneSecurityLevel,
): Promise<void> {
  await request(`/zones/${zoneId}/settings/security_level`, token, {
    method: 'PATCH',
    body: { value },
  });
}

export interface CfCertificatePack {
  id: string;
  type: string;
  hosts: string[];
  status: string;
  issuer: string;
  /** ISO date of the earliest certificate expiry in the pack, if known. */
  expiresOn: string | null;
}

export async function listCertificatePacks(
  token: string,
  zoneId: string,
): Promise<CfCertificatePack[]> {
  const result = await request<
    {
      id: string;
      type?: string;
      hosts?: string[];
      status?: string;
      certificate_authority?: string;
      certificates?: { expires_on?: string; issuer?: string }[];
    }[]
  >(`/zones/${zoneId}/ssl/certificate_packs?status=all`, token);
  return result.map((pack) => {
    const expiries = (pack.certificates ?? [])
      .map((certificate) => certificate.expires_on)
      .filter((value): value is string => Boolean(value))
      .sort();
    return {
      id: pack.id,
      type: pack.type ?? 'universal',
      hosts: pack.hosts ?? [],
      status: pack.status ?? 'unknown',
      issuer:
        pack.certificate_authority ??
        pack.certificates?.[0]?.issuer ??
        '',
      expiresOn: expiries[0] ?? null,
    };
  });
}

export async function purgeZoneCache(
  token: string,
  zoneId: string,
): Promise<void> {
  await request(`/zones/${zoneId}/purge_cache`, token, {
    method: 'POST',
    body: { purge_everything: true },
  });
}

export async function setZonePaused(
  token: string,
  zoneId: string,
  paused: boolean,
): Promise<CfZone> {
  const result = await request<RawZone>(`/zones/${zoneId}`, token, {
    method: 'PATCH',
    body: { paused },
  });
  return toZone(result);
}

export async function deleteZone(
  token: string,
  zoneId: string,
): Promise<void> {
  await request(`/zones/${zoneId}`, token, { method: 'DELETE' });
}
