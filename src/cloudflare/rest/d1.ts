import { request, requestEnvelope } from './client';

export interface CfD1Database {
  uuid: string;
  name: string;
  version: string;
  createdAt: string | null;
  /** Bytes; only present when the list/detail response includes it. */
  fileSize: number | null;
  numTables: number | null;
}

interface RawD1Database {
  uuid: string;
  name: string;
  version?: string;
  created_at?: string;
  file_size?: number;
  num_tables?: number;
}

function toD1Database(raw: RawD1Database): CfD1Database {
  return {
    uuid: raw.uuid,
    name: raw.name,
    version: raw.version ?? '',
    createdAt: raw.created_at ?? null,
    fileSize: raw.file_size ?? null,
    numTables: raw.num_tables ?? null,
  };
}

export async function listD1Databases(
  token: string,
  accountId: string,
): Promise<CfD1Database[]> {
  const databases: CfD1Database[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const envelope = await requestEnvelope<RawD1Database[]>(
      `/accounts/${accountId}/d1/database?page=${page}`,
      token,
    );
    databases.push(...envelope.result.map(toD1Database));
    const total = envelope.result_info?.total_count ?? databases.length;
    if (databases.length >= total || envelope.result.length === 0) {
      break;
    }
  }
  return databases;
}

/** Detail lookup fills in file_size / num_tables missing from the list. */
export async function getD1Database(
  token: string,
  accountId: string,
  databaseId: string,
): Promise<CfD1Database> {
  const result = await request<RawD1Database>(
    `/accounts/${accountId}/d1/database/${databaseId}`,
    token,
  );
  return toD1Database(result);
}

export async function createD1Database(
  token: string,
  accountId: string,
  name: string,
): Promise<void> {
  await request(`/accounts/${accountId}/d1/database`, token, {
    method: 'POST',
    body: { name },
  });
}

export async function deleteD1Database(
  token: string,
  accountId: string,
  databaseId: string,
): Promise<void> {
  await request(`/accounts/${accountId}/d1/database/${databaseId}`, token, {
    method: 'DELETE',
  });
}

export async function listD1Tables(
  token: string,
  accountId: string,
  databaseId: string,
): Promise<string[]> {
  const result = await request<{ results?: { name?: string }[] }[]>(
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    token,
    {
      method: 'POST',
      body: {
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
      },
    },
  );
  return (result[0]?.results ?? [])
    .map((row) => row.name)
    .filter((name): name is string => Boolean(name));
}
