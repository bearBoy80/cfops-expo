import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import R2BucketDetail from '@/app/(tabs)/(storage)/r2/[bucket]';
import { fetchStorageMetrics } from '../cloudflare/analytics';
import {
  addR2CustomDomain,
  deleteR2Bucket,
  deleteR2Objects,
  getR2ManagedDomain,
  listR2CustomDomains,
  listR2Objects,
  setR2ManagedDomain,
} from '../cloudflare/api';
import { ThemeProvider } from '../theme/ThemeContext';

const mockBack = jest.fn();

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({
    bucket: 'assets',
    accountId: 'acc-1',
    connectionId: 'tok-1',
    location: 'wnam',
  }),
}));

jest.mock('../cloudflare/resources', () => ({
  getBearerForConnection: jest.fn().mockResolvedValue('bearer-1'),
  fetchZonesSnapshot: jest.fn().mockResolvedValue({
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
  }),
}));

jest.mock('../cloudflare/accountResources', () => ({
  invalidateStorageSnapshot: jest.fn(),
}));

jest.mock('../cloudflare/analytics', () => ({
  fetchStorageMetrics: jest.fn(),
  invalidateStorageMetrics: jest.fn(),
}));

jest.mock('../components/ui/actionMenu', () => ({
  ActionMenuHost: () => null,
  showActionMenu: jest.fn(),
}));

jest.mock('../cloudflare/api', () => {
  const actual =
    jest.requireActual<typeof import('../cloudflare/api')>('../cloudflare/api');
  return {
    ...actual,
    listR2Objects: jest.fn(),
    deleteR2Objects: jest.fn(),
    deleteR2Bucket: jest.fn(),
    getR2ManagedDomain: jest.fn(),
    setR2ManagedDomain: jest.fn(),
    listR2CustomDomains: jest.fn(),
    addR2CustomDomain: jest.fn(),
    deleteR2CustomDomain: jest.fn(),
  };
});

const { showActionMenu } = jest.requireMock<{
  showActionMenu: jest.Mock;
}>('../components/ui/actionMenu');

const wrap = () =>
  render(
    <ThemeProvider>
      <R2BucketDetail />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listR2Objects).mockResolvedValue([
    {
      key: 'images/hero-banner.webp',
      size: 245_000,
      lastModified: '2026-08-12T00:00:00Z',
    },
    {
      key: 'docs/readme.txt',
      size: 1_200,
      lastModified: '2026-08-13T00:00:00Z',
    },
  ]);
  jest
    .mocked(deleteR2Objects)
    .mockResolvedValue({ deleted: [], failed: [] });
  jest.mocked(getR2ManagedDomain).mockResolvedValue({
    domain: 'pub-abc.r2.dev',
    enabled: true,
  });
  jest.mocked(listR2CustomDomains).mockResolvedValue([
    {
      domain: 'cdn.acme.com',
      enabled: true,
      status: 'active',
      zoneId: 'zone-1',
      zoneName: 'acme.com',
    },
  ]);
  jest.mocked(fetchStorageMetrics).mockResolvedValue({
    r2: new Map([
      [
        'assets',
        {
          objectCount: 12_400,
          payloadSize: 3_200_000_000,
          classAOps: 45_000,
          classBOps: 2_100_000,
        },
      ],
    ]),
    kv: new Map(),
    d1: new Map(),
   permissionDenied: false,
  });
});

test('renders bucket metrics, egress and the object list', async () => {
  wrap();

  // The filename leads; the prefix that every sibling shares moves to the
  // meta line so a long key cannot truncate away the identifying part.
  await waitFor(() =>
    expect(screen.getByText('hero-banner.webp')).toBeTruthy(),
  );
  expect(screen.getByText(/^images · 239 KB/)).toBeTruthy();
  expect(screen.getByText('assets')).toBeTruthy();
  expect(screen.getByText('WNAM · R2')).toBeTruthy();
  expect(screen.getByText('12.4K')).toBeTruthy();
  expect(screen.getByText('3.0 GB')).toBeTruthy();
  expect(screen.getByText('45.0K')).toBeTruthy();
  expect(screen.getByText('2.1M')).toBeTruthy();
  expect(screen.getByText('$0.00 · always free')).toBeTruthy();
  expect(screen.getByText('cdn.acme.com')).toBeTruthy();
});

test('disables the r2.dev public URL', async () => {
  jest.mocked(setR2ManagedDomain).mockResolvedValue(undefined);
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-toggle-public')).toBeTruthy(),
  );

  fireEvent(screen.getByTestId('r2-toggle-public'), 'valueChange', false);

  await waitFor(() =>
    expect(setR2ManagedDomain).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'assets',
      false,
    ),
  );
});

test('adds a custom domain after validation', async () => {
  jest.mocked(addR2CustomDomain).mockResolvedValue(undefined);
  wrap();
  await waitFor(() => expect(screen.getByTestId('r2-add-domain')).toBeTruthy());

  fireEvent.press(screen.getByTestId('r2-add-domain'));
  fireEvent.changeText(screen.getByTestId('r2-domain-input'), 'not a host');
  fireEvent.press(screen.getByTestId('r2-domain-save'));
  expect(screen.getByTestId('r2-domain-error')).toBeTruthy();
  expect(addR2CustomDomain).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByTestId('r2-domain-input'), 'img.acme.com');
  fireEvent.press(screen.getByTestId('r2-domain-save'));

  await waitFor(() =>
    expect(addR2CustomDomain).toHaveBeenCalledWith('bearer-1', 'acc-1', 'assets', {
      domain: 'img.acme.com',
      zoneId: 'zone-1',
    }),
  );
});

test('deletes the bucket after confirmation and navigates back', async () => {
  jest.mocked(deleteR2Bucket).mockResolvedValue(undefined);
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-delete-bucket')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-delete-bucket'));
  const options = showActionMenu.mock.calls[
    showActionMenu.mock.calls.length - 1
  ][0] as { actions: { onPress: () => void }[] };
  options.actions[0].onPress();

  await waitFor(() =>
    expect(deleteR2Bucket).toHaveBeenCalledWith('bearer-1', 'acc-1', 'assets'),
  );
  expect(mockBack).toHaveBeenCalled();
});

const confirmLastMenu = () => {
  const options = showActionMenu.mock.calls[
    showActionMenu.mock.calls.length - 1
  ][0] as { actions: { onPress: () => void }[]; message: string };
  options.actions[0].onPress();
  return options;
};

test('deletes a single selected object', async () => {
  jest
    .mocked(deleteR2Objects)
    .mockResolvedValue({ deleted: ['docs/readme.txt'], failed: [] });
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-1')).toBeTruthy(),
  );

  // The toolbar only exists once something is picked.
  expect(screen.queryByTestId('r2-delete-objects')).toBeNull();
  expect(screen.queryByTestId('subpage-footer')).toBeNull();

  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  fireEvent.press(screen.getByTestId('r2-object-1'));
  fireEvent.press(screen.getByTestId('r2-delete-objects'));
  const options = confirmLastMenu();

  // The toolbar acts on a selection, so it counts rather than names — but the
  // count still has to read correctly at one.
  expect(options.message).toBe('Delete 1 object? This cannot be undone.');
  await waitFor(() =>
    expect(deleteR2Objects).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'assets',
      ['docs/readme.txt'],
    ),
  );
});

test('deletes several selected objects at once', async () => {
  jest.mocked(deleteR2Objects).mockResolvedValue({
    deleted: ['images/hero-banner.webp', 'docs/readme.txt'],
    failed: [],
  });
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-1')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  fireEvent.press(screen.getByTestId('r2-object-0'));
  fireEvent.press(screen.getByTestId('r2-object-1'));
  fireEvent.press(screen.getByTestId('r2-delete-objects'));
  confirmLastMenu();

  await waitFor(() =>
    expect(deleteR2Objects).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'assets',
      ['images/hero-banner.webp', 'docs/readme.txt'],
    ),
  );
});

test('keeps the toolbar up for the whole of selection mode', async () => {
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-0')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-toggle-select'));

  // Present with nothing picked, so the mode stays legible — the destructive
  // action is dimmed rather than the whole bar disappearing.
  expect(screen.getByTestId('subpage-footer')).toBeTruthy();
  expect(
    screen.getByTestId('r2-delete-objects').props.accessibilityState.disabled,
  ).toBe(true);

  fireEvent.press(screen.getByTestId('r2-object-0'));
  expect(
    screen.getByTestId('r2-delete-objects').props.accessibilityState.disabled,
  ).toBe(false);
  expect(screen.getByText('Delete 1 object')).toBeTruthy();

  // Emptying the selection must not strand the user without a toolbar.
  fireEvent.press(screen.getByTestId('r2-object-0'));
  expect(screen.getByTestId('subpage-footer')).toBeTruthy();

  // Only leaving the mode takes the toolbar away.
  fireEvent.press(screen.getByTestId('r2-exit-select'));
  expect(screen.queryByTestId('subpage-footer')).toBeNull();
});

test('selects and deselects every object from the toolbar', async () => {
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-0')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  expect(screen.getByText('Select All')).toBeTruthy();

  fireEvent.press(screen.getByTestId('r2-select-all'));
  expect(screen.getByText('Delete 2 objects')).toBeTruthy();
  expect(screen.getByText('Deselect All')).toBeTruthy();

  fireEvent.press(screen.getByTestId('r2-select-all'));
  expect(screen.getByText('Select All')).toBeTruthy();
  expect(
    screen.getByTestId('r2-delete-objects').props.accessibilityState.disabled,
  ).toBe(true);
});

test('does nothing when the dimmed delete is pressed', async () => {
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-0')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  fireEvent.press(screen.getByTestId('r2-delete-objects'));

  expect(showActionMenu).not.toHaveBeenCalled();
  expect(deleteR2Objects).not.toHaveBeenCalled();
});

test('keeps failed objects selected after a partial delete', async () => {
  jest.mocked(deleteR2Objects).mockResolvedValue({
    deleted: ['images/hero-banner.webp'],
    failed: [{ key: 'docs/readme.txt', cause: new Error('nope') }],
  });
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-1')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  fireEvent.press(screen.getByTestId('r2-object-0'));
  fireEvent.press(screen.getByTestId('r2-object-1'));
  fireEvent.press(screen.getByTestId('r2-delete-objects'));
  confirmLastMenu();

  // The one that failed stays picked so a retry does not silently drop it.
  await waitFor(() =>
    expect(screen.getByText('Delete 1 object')).toBeTruthy(),
  );
});

test('leaves the list plain until selection mode is entered', async () => {
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-0')).toBeTruthy(),
  );

  // No checkboxes and no selection to make: tapping a row must be inert.
  fireEvent.press(screen.getByTestId('r2-object-0'));
  expect(screen.queryByTestId('subpage-footer')).toBeNull();
  expect(screen.getByText('Select')).toBeTruthy();

  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  expect(screen.getByText('Done')).toBeTruthy();
});

test('drops the selection when leaving selection mode', async () => {
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-0')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  fireEvent.press(screen.getByTestId('r2-object-0'));
  expect(screen.getByText('Delete 1 object')).toBeTruthy();

  // The exit lives in the pinned toolbar, not the header that scrolls away.
  expect(screen.queryByTestId('r2-toggle-select')).toBeNull();
  fireEvent.press(screen.getByTestId('r2-exit-select'));
  expect(screen.queryByTestId('subpage-footer')).toBeNull();

  // Re-entering must start clean rather than resurrect the old picks.
  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  expect(
    screen.getByTestId('r2-delete-objects').props.accessibilityState.disabled,
  ).toBe(true);
});

test('can always leave selection mode from the pinned toolbar', async () => {
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-0')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-toggle-select'));

  // Reachable with nothing picked too, so the mode is never a dead end.
  fireEvent.press(screen.getByTestId('r2-exit-select'));

  expect(screen.queryByTestId('subpage-footer')).toBeNull();
  expect(screen.getByTestId('r2-toggle-select')).toBeTruthy();
});

test('row menu deletes that object in one confirmation', async () => {
  jest
    .mocked(deleteR2Objects)
    .mockResolvedValue({ deleted: ['docs/readme.txt'], failed: [] });
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-1')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-object-1'));
  const options = confirmLastMenu();

  // The sheet names the object and offers Cancel, so it is the confirmation:
  // pressing Delete must act rather than open a second dialog.
  expect(options.message).toContain('docs/readme.txt');
  expect(showActionMenu).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(deleteR2Objects).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'assets',
      ['docs/readme.txt'],
    ),
  );
});

test('row menu can start a selection from that object', async () => {
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-1')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-object-1'));
  const options = showActionMenu.mock.calls[0][0] as {
    actions: { label: string; onPress: () => void }[];
  };
  // Called directly rather than through a press, so the state update needs
  // wrapping for React to flush it.
  act(() => {
    options.actions.find((action) => action.label === 'Select')?.onPress();
  });

  // Enters selection mode with the tapped object already picked.
  expect(screen.getByText('Delete 1 object')).toBeTruthy();
  expect(screen.getByText('Done')).toBeTruthy();
});

test('row press toggles selection instead of opening the menu in edit mode', async () => {
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-object-0')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-toggle-select'));
  fireEvent.press(screen.getByTestId('r2-object-0'));

  expect(showActionMenu).not.toHaveBeenCalled();
  expect(screen.getByText('Delete 1 object')).toBeTruthy();
});
