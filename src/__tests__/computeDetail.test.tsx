import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import WorkerDetail from '@/app/(tabs)/(compute)/worker/[script]';
import PagesProjectDetail from '@/app/(tabs)/(compute)/pages/[project]';
import {
  fetchPagesFunctionMetrics,
  fetchWorkerHourlySeries,
  fetchWorkerMetrics,
} from '../cloudflare/analytics';
import {
  addPagesDomain,
  attachWorkerDomain,
  deletePagesDomain,
  getActiveWorkerVersion,
  getPagesPreviewSetting,
  getWorkerSubdomainConfig,
  listPagesDeployments,
  listPagesDomains,
  listWorkerDomains,
  listWorkerVersions,
  retryPagesDeployment,
  rollbackPagesDeployment,
  rollbackWorkerVersion,
  setPagesPreviewSetting,
  setWorkerSubdomainConfig,
} from '../cloudflare/api';
import { ThemeProvider } from '../theme/ThemeContext';

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

const mockParams = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams(),
}));

jest.mock('../cloudflare/resources', () => ({
  getBearerForConnection: jest.fn().mockResolvedValue('bearer-1'),
  fetchZonesSnapshot: jest.fn(),
}));

jest.mock('../components/ui/actionMenu', () => ({
  ActionMenuHost: () => null,
  showActionMenu: jest.fn(),
}));

jest.mock('../cloudflare/analytics', () => ({
  fetchWorkerMetrics: jest.fn(),
  fetchWorkerHourlySeries: jest.fn(),
  fetchPagesFunctionMetrics: jest.fn(),
}));

jest.mock('../cloudflare/api', () => {
  const actual =
    jest.requireActual<typeof import('../cloudflare/api')>('../cloudflare/api');
  return {
    ...actual,
    listPagesDeployments: jest.fn(),
    listPagesDomains: jest.fn(),
    addPagesDomain: jest.fn(),
    deletePagesDomain: jest.fn(),
    rollbackPagesDeployment: jest.fn(),
    retryPagesDeployment: jest.fn(),
    getPagesPreviewSetting: jest.fn(),
    setPagesPreviewSetting: jest.fn(),
    listWorkerVersions: jest.fn(),
    getActiveWorkerVersion: jest.fn(),
    rollbackWorkerVersion: jest.fn(),
    listWorkerDomains: jest.fn(),
    attachWorkerDomain: jest.fn(),
    detachWorkerDomain: jest.fn(),
    getWorkerSubdomainConfig: jest.fn(),
    setWorkerSubdomainConfig: jest.fn(),
  };
});

const { fetchZonesSnapshot } = jest.requireMock<{
  fetchZonesSnapshot: jest.Mock;
}>('../cloudflare/resources');

const wrap = (children: React.ReactElement) =>
  render(<ThemeProvider>{children}</ThemeProvider>);

const { showActionMenu } = jest.requireMock<{
  showActionMenu: jest.Mock;
}>('../components/ui/actionMenu');

/** Presses a button in the most recently shown action menu. */
const confirmLastSheet = (buttonLabel?: string) => {
  const calls = showActionMenu.mock.calls;
  const options = calls[calls.length - 1][0] as {
    actions: { label: string; onPress: () => void }[];
  };
  const action = buttonLabel
    ? options.actions.find((item) => item.label === buttonLabel)
    : options.actions[0];
  action?.onPress();
};

const workerParams = {
  script: 'api-gateway',
  accountId: 'acc-1',
  connectionId: 'tok-1',
  accountName: 'Acme Corp',
  modifiedOn: '2026-08-01T00:00:00Z',
};

const pagesParams = {
  project: 'marketing-site',
  accountId: 'acc-1',
  connectionId: 'tok-1',
  accountName: 'Acme Corp',
  domain: 'marketing.pages.dev',
  framework: 'astro',
  productionBranch: 'main',
  productionScriptName: 'pages-worker--123-production',
};

const deployments = [
  {
    id: 'dep-1',
    environment: 'production',
    branch: 'main',
    commit: 'abcdef1',
    status: 'success' as const,
    createdOn: '2026-08-10T00:00:00Z',
    url: 'https://abc.marketing.pages.dev',
  },
  {
    id: 'dep-2',
    environment: 'production',
    branch: 'main',
    commit: '9876fed',
    status: 'success' as const,
    createdOn: '2026-08-08T00:00:00Z',
    url: '',
  },
  {
    id: 'dep-3',
    environment: 'preview',
    branch: 'fix',
    commit: '1234abc',
    status: 'failure' as const,
    createdOn: null,
    url: '',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  fetchZonesSnapshot.mockResolvedValue({
    connectionCount: 1,
    zones: [
      {
        id: 'zone-1',
        name: 'acme.com',
        status: 'active',
        paused: false,
        plan: 'Free',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        nameServers: [],
        connectionId: 'tok-1',
      },
    ],
    accounts: [],
    issues: [],
  });
  jest.mocked(fetchWorkerMetrics).mockResolvedValue(
    new Map([
      ['api-gateway', { requests: 1_500_000, errors: 12, cpuP50Ms: 2.4 }],
    ]),
  );
  jest.mocked(fetchWorkerHourlySeries).mockResolvedValue([
    { label: '00', value: 100 },
    { label: '01', value: 200 },
  ]);
  jest.mocked(listWorkerVersions).mockResolvedValue([
    {
      id: 'version-new',
      number: 5,
      createdOn: '2026-08-11T00:00:00Z',
      message: 'deploy',
    },
    {
      id: 'version-old',
      number: 4,
      createdOn: '2026-08-01T00:00:00Z',
      message: null,
    },
  ]);
  jest.mocked(getActiveWorkerVersion).mockResolvedValue('version-new');
  jest.mocked(listWorkerDomains).mockResolvedValue([
    {
      id: 'dom-1',
      hostname: 'api.acme.com',
      service: 'api-gateway',
      environment: 'production',
      zoneId: 'zone-1',
      zoneName: 'acme.com',
    },
  ]);
  jest.mocked(listPagesDeployments).mockResolvedValue(deployments);
  jest.mocked(listPagesDomains).mockResolvedValue([
    { id: 'pd-1', name: 'www.acme.com', status: 'active' },
  ]);
  jest.mocked(fetchPagesFunctionMetrics).mockResolvedValue({
    requests: 4200,
    errors: 3,
    series: [],
  });
  jest.mocked(getWorkerSubdomainConfig).mockResolvedValue({
    enabled: true,
    previewsEnabled: true,
  });
  jest.mocked(getPagesPreviewSetting).mockResolvedValue('all');
});

test('worker detail shows metrics, chart, domains and versions', async () => {
  mockParams.mockReturnValue(workerParams);

  wrap(<WorkerDetail />);

  await waitFor(() => expect(screen.getByText('1.5M')).toBeTruthy());
  expect(screen.getByText('12')).toBeTruthy();
  expect(screen.getByText('2.4ms')).toBeTruthy();
  expect(screen.getByText('api.acme.com')).toBeTruthy();
  expect(screen.getAllByText(/version-/).length).toBe(2);
  // The active version carries a pill instead of a rollback action.
  expect(screen.getByText('active')).toBeTruthy();
});

test('worker rollback confirms and republishes the old version', async () => {
  mockParams.mockReturnValue(workerParams);
  jest.mocked(rollbackWorkerVersion).mockResolvedValue(undefined);

  wrap(<WorkerDetail />);
  await waitFor(() =>
    expect(screen.getByTestId('worker-version-version-old')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('worker-version-version-old'));
  confirmLastSheet();

  await waitFor(() =>
    expect(rollbackWorkerVersion).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'api-gateway',
      'version-old',
    ),
  );
});

test('worker custom domain add validates and attaches', async () => {
  mockParams.mockReturnValue(workerParams);
  jest.mocked(attachWorkerDomain).mockResolvedValue(undefined);

  wrap(<WorkerDetail />);
  await waitFor(() =>
    expect(screen.getByTestId('worker-add-domain')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('worker-add-domain'));
  fireEvent.changeText(
    screen.getByTestId('worker-domain-input'),
    'not a hostname',
  );
  fireEvent.press(screen.getByTestId('worker-domain-save'));
  expect(screen.getByTestId('worker-domain-error')).toBeTruthy();
  expect(attachWorkerDomain).not.toHaveBeenCalled();

  fireEvent.changeText(
    screen.getByTestId('worker-domain-input'),
    'api2.acme.com',
  );
  fireEvent.press(screen.getByTestId('worker-domain-save'));

  await waitFor(() =>
    expect(attachWorkerDomain).toHaveBeenCalledWith('bearer-1', 'acc-1', {
      zoneId: 'zone-1',
      hostname: 'api2.acme.com',
      service: 'api-gateway',
    }),
  );
});

test('worker preview URLs can be disabled', async () => {
  mockParams.mockReturnValue(workerParams);
  jest.mocked(setWorkerSubdomainConfig).mockResolvedValue(undefined);

  wrap(<WorkerDetail />);
  await waitFor(() =>
    expect(screen.getByTestId('worker-toggle-previews')).toBeTruthy(),
  );

  fireEvent(screen.getByTestId('worker-toggle-previews'), 'valueChange', false);

  await waitFor(() =>
    expect(setWorkerSubdomainConfig).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'api-gateway',
      { enabled: true, previewsEnabled: false },
    ),
  );
});

test('pages preview deployments can be disabled', async () => {
  mockParams.mockReturnValue(pagesParams);
  jest.mocked(setPagesPreviewSetting).mockResolvedValue(undefined);

  wrap(<PagesProjectDetail />);
  await waitFor(() =>
    expect(screen.getByTestId('pages-toggle-previews')).toBeTruthy(),
  );

  fireEvent(screen.getByTestId('pages-toggle-previews'), 'valueChange', false);

  await waitFor(() =>
    expect(setPagesPreviewSetting).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'marketing-site',
      'none',
    ),
  );
});

test('pages detail lists domains and deployments', async () => {
  mockParams.mockReturnValue(pagesParams);

  wrap(<PagesProjectDetail />);

  await waitFor(() =>
    expect(screen.getByTestId('pages-deployment-dep-1')).toBeTruthy(),
  );
  expect(screen.getByText('www.acme.com')).toBeTruthy();
  expect(screen.getByText('main · abcdef1')).toBeTruthy();
  expect(screen.getByText('Preview')).toBeTruthy();
  // Pages Functions invocation metrics for the production script.
  await waitFor(() => expect(screen.getByText('4.2K')).toBeTruthy());
  expect(fetchPagesFunctionMetrics).toHaveBeenCalledWith(
    'bearer-1',
    'acc-1',
    'pages-worker--123-production',
  );
});

test('pages rollback republishes an older production deployment', async () => {
  mockParams.mockReturnValue(pagesParams);
  jest.mocked(rollbackPagesDeployment).mockResolvedValue(undefined);

  wrap(<PagesProjectDetail />);
  await waitFor(() =>
    expect(screen.getByTestId('pages-deployment-dep-2')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('pages-deployment-dep-2'));
  confirmLastSheet('Roll Back');

  await waitFor(() =>
    expect(rollbackPagesDeployment).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'marketing-site',
      'dep-2',
    ),
  );
});

test('pages retry re-runs a failed deployment build', async () => {
  mockParams.mockReturnValue(pagesParams);
  jest.mocked(retryPagesDeployment).mockResolvedValue(undefined);

  wrap(<PagesProjectDetail />);
  await waitFor(() =>
    expect(screen.getByTestId('pages-deployment-dep-3')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('pages-deployment-dep-3'));
  confirmLastSheet('Retry Build');

  await waitFor(() =>
    expect(retryPagesDeployment).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'marketing-site',
      'dep-3',
    ),
  );
});

test('pages domain can be added and removed', async () => {
  mockParams.mockReturnValue(pagesParams);
  jest.mocked(addPagesDomain).mockResolvedValue(undefined);
  jest.mocked(deletePagesDomain).mockResolvedValue(undefined);

  wrap(<PagesProjectDetail />);
  await waitFor(() =>
    expect(screen.getByTestId('pages-add-domain')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('pages-add-domain'));
  fireEvent.changeText(
    screen.getByTestId('pages-domain-input'),
    'app.acme.com',
  );
  fireEvent.press(screen.getByTestId('pages-domain-save'));

  await waitFor(() =>
    expect(addPagesDomain).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'marketing-site',
      'app.acme.com',
    ),
  );

  fireEvent.press(screen.getByTestId('pages-domain-www.acme.com'));
  confirmLastSheet('Remove Domain');

  await waitFor(() =>
    expect(deletePagesDomain).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'marketing-site',
      'www.acme.com',
    ),
  );
});
