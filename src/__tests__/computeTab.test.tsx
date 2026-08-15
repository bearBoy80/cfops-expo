import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Compute from '@/app/(tabs)/(compute)/index';
import {
  fetchComputeSnapshot,
  type ComputeSnapshot,
} from '../cloudflare/accountResources';
import { fetchWorkerMetrics } from '../cloudflare/analytics';
import { ThemeProvider } from '../theme/ThemeContext';

const mockPush = jest.fn();

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      useEffect(callback, [callback]);
    },
  };
});

jest.mock('../cloudflare/accountResources', () => {
  const actual = jest.requireActual<
    typeof import('../cloudflare/accountResources')
  >('../cloudflare/accountResources');
  return {
    ...actual,
    fetchComputeSnapshot: jest.fn(),
    invalidateComputeSnapshot: jest.fn(),
  };
});

jest.mock('../cloudflare/analytics', () => ({
  fetchWorkerMetrics: jest.fn(),
}));

jest.mock('../cloudflare/resources', () => ({
  getBearerForConnection: jest.fn().mockResolvedValue('bearer-1'),
}));

const scope = {
  accountId: 'acc-1',
  accountName: 'Acme Corp',
  connectionId: 'tok-1',
};

const snapshot: ComputeSnapshot = {
  connectionCount: 1,
  accounts: [scope],
  workers: [
    {
      id: 'api-gateway',
      createdOn: null,
      modifiedOn: '2026-08-01T00:00:00Z',
      ...scope,
    },
    {
      id: 'edge-cache',
      createdOn: null,
      modifiedOn: null,
      ...scope,
    },
  ],
  pages: [
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
      ...scope,
    },
    {
      name: 'broken-site',
      domain: 'broken.pages.dev',
      productionBranch: 'main',
      framework: '',
      productionScriptName: null,
      deployStatus: 'failure',
      deployBranch: 'fix',
      deployCommit: '1234abc',
      deployedAt: null,
      ...scope,
    },
  ],
  issues: [],
};

const wrap = () =>
  render(
    <ThemeProvider>
      <Compute />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchComputeSnapshot).mockResolvedValue(snapshot);
  jest.mocked(fetchWorkerMetrics).mockResolvedValue(
    new Map([
      ['api-gateway', { requests: 1_500_000, errors: 0, cpuP50Ms: 2.4 }],
      ['edge-cache', { requests: 100, errors: 7, cpuP50Ms: null }],
    ]),
  );
});

test('shows the connect empty state without connections', async () => {
  jest.mocked(fetchComputeSnapshot).mockResolvedValue({
    connectionCount: 0,
    accounts: [],
    workers: [],
    pages: [],
    issues: [],
  });
  wrap();

  await waitFor(() =>
    expect(screen.getByText('No compute resources')).toBeTruthy(),
  );

  fireEvent.press(screen.getByText('Connect Account'));
  expect(mockPush).toHaveBeenCalledWith('/connect');
});

test('lists workers with metrics and error pills', async () => {
  wrap();

  await waitFor(() => expect(screen.getByText('api-gateway')).toBeTruthy());
  expect(screen.getByText('Workers · 2')).toBeTruthy();
  // Errors metric tile sums metrics across workers.
  expect(screen.getByText('7')).toBeTruthy();
  expect(screen.getByText(/1\.5M\/day/)).toBeTruthy();
  expect(screen.getByText(/CPU 2\.4ms/)).toBeTruthy();
  // edge-cache has errors, so it renders an error pill.
  expect(screen.getByText('error')).toBeTruthy();
});

test('opens the worker detail with routing params', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('api-gateway')).toBeTruthy());

  fireEvent.press(screen.getByTestId('compute-worker-api-gateway'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(compute)/worker/[script]',
    params: {
      script: 'api-gateway',
      accountId: 'acc-1',
      connectionId: 'tok-1',
      accountName: 'Acme Corp',
      modifiedOn: '2026-08-01T00:00:00Z',
    },
  });
});

test('opens the pages project detail with routing params', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('api-gateway')).toBeTruthy());

  fireEvent.press(screen.getByTestId('compute-segment-pages'));
  fireEvent.press(screen.getByTestId('compute-pages-marketing-site'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(compute)/pages/[project]',
    params: {
      project: 'marketing-site',
      accountId: 'acc-1',
      connectionId: 'tok-1',
      accountName: 'Acme Corp',
      domain: 'marketing.pages.dev',
      framework: 'astro',
      productionBranch: 'main',
      productionScriptName: 'pages-worker--123-production',
    },
  });
});

test('lists pages projects with deployment info', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('api-gateway')).toBeTruthy());

  fireEvent.press(screen.getByTestId('compute-segment-pages'));

  expect(screen.getByText('marketing-site')).toBeTruthy();
  expect(screen.getByText('marketing.pages.dev · astro')).toBeTruthy();
  expect(screen.getByText(/main · abcdef1/)).toBeTruthy();
  // failure deployments surface as the error status.
  expect(screen.getByText('broken-site')).toBeTruthy();
  expect(screen.getByText('error')).toBeTruthy();
  expect(screen.getByText('active')).toBeTruthy();
});
