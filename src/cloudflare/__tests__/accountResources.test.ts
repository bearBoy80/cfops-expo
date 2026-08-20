import {
  fetchComputeSnapshot,
  fetchStorageSnapshot,
  getAccountBearer,
  invalidateComputeSnapshot,
  invalidateStorageSnapshot,
} from '../accountResources';
import {
  listD1Databases,
  listKvNamespaces,
  listPagesProjects,
  listR2Buckets,
  listWorkerScripts,
} from '../api';
import { listConnections } from '../connections';
import { getConnectionBearer } from '../resources';

jest.mock('../connections', () => ({
  listConnections: jest.fn(),
}));

jest.mock('../resources', () => ({
  getConnectionBearer: jest.fn(),
}));

jest.mock('../api', () => {
  const actual =
    jest.requireActual<typeof import('../api')>('../api');
  return {
    ...actual,
    listR2Buckets: jest.fn(),
    listKvNamespaces: jest.fn(),
    listD1Databases: jest.fn(),
    getD1Database: jest.fn(),
    listWorkerScripts: jest.fn(),
    listPagesProjects: jest.fn(),
  };
});

const connection = (id: string, accounts: { id: string; name: string }[]) => ({
  id,
  label: id,
  authType: 'token' as const,
  accounts,
  createdAt: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  invalidateStorageSnapshot();
  invalidateComputeSnapshot();
  jest.mocked(getConnectionBearer).mockResolvedValue('bearer-1');
  jest.mocked(listR2Buckets).mockResolvedValue([]);
  jest.mocked(listKvNamespaces).mockResolvedValue([]);
  jest.mocked(listD1Databases).mockResolvedValue([]);
  jest.mocked(listWorkerScripts).mockResolvedValue([]);
  jest.mocked(listPagesProjects).mockResolvedValue([]);
});

test('aggregates storage resources per account with ownership tags', async () => {
  jest.mocked(listConnections).mockResolvedValue([
    connection('tok-1', [{ id: 'acc-1', name: 'Acme Corp' }]),
  ]);
  jest.mocked(listR2Buckets).mockResolvedValue([
    { name: 'assets', location: 'wnam', creationDate: null },
  ]);
  jest.mocked(listKvNamespaces).mockResolvedValue([
    { id: 'ns-1', title: 'SESSIONS' },
  ]);
  jest.mocked(listD1Databases).mockResolvedValue([
    {
      uuid: 'db-1',
      name: 'prod-db',
      version: 'production',
      createdAt: null,
      fileSize: 4096,
      numTables: 3,
    },
  ]);

  const snapshot = await fetchStorageSnapshot({ force: true });

  expect(snapshot.connectionCount).toBe(1);
  expect(snapshot.accounts).toEqual([
    { accountId: 'acc-1', accountName: 'Acme Corp', connectionId: 'tok-1' },
  ]);
  expect(snapshot.buckets).toEqual([
    {
      name: 'assets',
      location: 'wnam',
      creationDate: null,
      accountId: 'acc-1',
      accountName: 'Acme Corp',
      connectionId: 'tok-1',
    },
  ]);
  expect(snapshot.kvNamespaces[0]).toMatchObject({
    id: 'ns-1',
    accountId: 'acc-1',
  });
  expect(snapshot.d1Databases[0]).toMatchObject({
    uuid: 'db-1',
    fileSize: 4096,
  });
  expect(snapshot.issues).toEqual([]);
});

test('deduplicates accounts reachable through several connections', async () => {
  jest.mocked(listConnections).mockResolvedValue([
    connection('tok-1', [{ id: 'acc-1', name: 'Acme Corp' }]),
    connection('tok-2', [
      { id: 'acc-1', name: 'Acme Corp' },
      { id: 'acc-2', name: 'Side Project' },
    ]),
  ]);

  await fetchStorageSnapshot({ force: true });

  // acc-1 must only be queried once even though two connections can see it.
  expect(listR2Buckets).toHaveBeenCalledTimes(2);
  const queriedAccounts = jest
    .mocked(listR2Buckets)
    .mock.calls.map(([, accountId]) => accountId)
    .sort();
  expect(queriedAccounts).toEqual(['acc-1', 'acc-2']);
});

test('records one issue per account when a product listing fails', async () => {
  jest.mocked(listConnections).mockResolvedValue([
    connection('tok-1', [{ id: 'acc-1', name: 'Acme Corp' }]),
  ]);
  jest.mocked(listR2Buckets).mockRejectedValue(new Error('denied'));
  jest.mocked(listKvNamespaces).mockRejectedValue(new Error('denied'));

  const snapshot = await fetchStorageSnapshot({ force: true });

  expect(snapshot.issues).toHaveLength(1);
  expect(snapshot.issues[0]).toMatchObject({
    connectionId: 'tok-1',
    label: 'Acme Corp',
  });
  // The surviving datasets still come back.
  expect(snapshot.d1Databases).toEqual([]);
});

test('records an issue when a connection has no usable credential', async () => {
  jest.mocked(listConnections).mockResolvedValue([
    connection('tok-1', [{ id: 'acc-1', name: 'Acme Corp' }]),
  ]);
  jest.mocked(getConnectionBearer).mockResolvedValue(null);

  const snapshot = await fetchStorageSnapshot({ force: true });

  expect(snapshot.accounts).toEqual([]);
  expect(snapshot.issues[0]).toMatchObject({
    connectionId: 'tok-1',
    label: 'tok-1',
  });
});

test('aggregates compute resources across accounts', async () => {
  jest.mocked(listConnections).mockResolvedValue([
    connection('tok-1', [{ id: 'acc-1', name: 'Acme Corp' }]),
  ]);
  jest.mocked(listWorkerScripts).mockResolvedValue([
    {
      id: 'api-gateway',
      createdOn: null,
      modifiedOn: '2026-08-01T00:00:00Z',
    },
  ]);
  jest.mocked(listPagesProjects).mockResolvedValue([
    {
      name: 'marketing-site',
      domain: 'marketing.pages.dev',
      productionBranch: 'main',
      framework: 'astro',
      productionScriptName: 'pages-worker--123-production',
      deployStatus: 'success',
      deployBranch: 'main',
      deployCommit: 'abcdef1',
      deployedAt: '2026-08-10T00:00:00Z',
    },
  ]);

  const snapshot = await fetchComputeSnapshot({ force: true });

  expect(snapshot.workers[0]).toMatchObject({
    id: 'api-gateway',
    accountId: 'acc-1',
    connectionId: 'tok-1',
  });
  expect(snapshot.pages[0]).toMatchObject({
    name: 'marketing-site',
    deployStatus: 'success',
    accountId: 'acc-1',
  });
});

test('storage and compute snapshots share one credential resolution', async () => {
  jest.mocked(listConnections).mockResolvedValue([
    connection('tok-1', [{ id: 'acc-1', name: 'Acme Corp' }]),
  ]);

  await fetchStorageSnapshot({ force: true });
  await fetchComputeSnapshot({ force: true });

  expect(listConnections).toHaveBeenCalledTimes(1);
  expect(getConnectionBearer).toHaveBeenCalledTimes(1);
});

test('issues recorded by one snapshot do not leak into the other', async () => {
  jest.mocked(listConnections).mockResolvedValue([
    connection('tok-1', [{ id: 'acc-1', name: 'Acme Corp' }]),
  ]);
  jest.mocked(listWorkerScripts).mockRejectedValue(new Error('denied'));

  const compute = await fetchComputeSnapshot({ force: true });
  const storage = await fetchStorageSnapshot({ force: true });

  expect(compute.issues).toHaveLength(1);
  expect(storage.issues).toEqual([]);
});

test('getAccountBearer serves bearers from the shared resolution', async () => {
  jest.mocked(listConnections).mockResolvedValue([
    connection('tok-1', [{ id: 'acc-1', name: 'Acme Corp' }]),
  ]);

  await fetchComputeSnapshot({ force: true });
  await expect(getAccountBearer('acc-1')).resolves.toBe('bearer-1');

  // The snapshot already resolved credentials; no second keychain pass.
  expect(listConnections).toHaveBeenCalledTimes(1);
  await expect(getAccountBearer('acc-unknown')).rejects.toMatchObject({
    code: 'missing-credential',
  });
});
