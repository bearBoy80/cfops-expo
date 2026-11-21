import { request, requestEnvelope, requestPaged } from './client';

/** Total DNS record count, cheap enough for the zone overview row. */
export async function countDnsRecords(
  token: string,
  zoneId: string,
): Promise<number> {
  const envelope = await requestEnvelope<unknown[]>(
    `/zones/${zoneId}/dns_records?per_page=1`,
    token,
  );
  return envelope.result_info?.total_count ?? envelope.result.length;
}

export interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
  /** Present on MX (and SRV/URI) records. */
  priority?: number;
}

/** Maximum the `dns_records` endpoint accepts. */
const RECORDS_PER_PAGE = 100;

export async function listDnsRecords(
  token: string,
  zoneId: string,
): Promise<CfDnsRecord[]> {
  const result = await requestPaged<{
    id: string;
    type: string;
    name: string;
    content?: string;
    proxied?: boolean;
    ttl?: number;
    priority?: number;
  }>(
    (page) =>
      `/zones/${zoneId}/dns_records?page=${page}&per_page=${RECORDS_PER_PAGE}`,
    token,
  );
  return result.map((record) => ({
    id: record.id,
    type: record.type,
    name: record.name,
    content: record.content ?? '',
    proxied: record.proxied ?? false,
    ttl: record.ttl ?? 1,
    priority: record.priority,
  }));
}

export interface DnsRecordInput {
  type: string;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  /** Required by Cloudflare for MX (and SRV/URI) records. */
  priority?: number;
}

export async function createDnsRecord(
  token: string,
  zoneId: string,
  input: DnsRecordInput,
): Promise<void> {
  await request(`/zones/${zoneId}/dns_records`, token, {
    method: 'POST',
    body: { ttl: 1, ...input },
  });
}

/**
 * Updates the fields the editor owns. PATCH rather than PUT: PUT overwrites the
 * whole record and would wipe the comment, tags and any `data` the app does not
 * edit.
 */
export async function updateDnsRecord(
  token: string,
  zoneId: string,
  recordId: string,
  input: DnsRecordInput,
): Promise<void> {
  await request(`/zones/${zoneId}/dns_records/${recordId}`, token, {
    method: 'PATCH',
    body: input,
  });
}

export async function deleteDnsRecord(
  token: string,
  zoneId: string,
  recordId: string,
): Promise<void> {
  await request(`/zones/${zoneId}/dns_records/${recordId}`, token, {
    method: 'DELETE',
  });
}
