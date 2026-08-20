import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { ActionMenuHost, showActionMenu } from '../actionMenu';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const openMenu = (onPress = jest.fn()) => {
  render(
    <ThemeProvider>
      <ActionMenuHost />
    </ThemeProvider>,
  );
  act(() => {
    showActionMenu({
      title: 'chinarecipe.org',
      message: 'Remove the domain?',
      cancelLabel: 'Cancel',
      actions: [{ label: 'Remove Domain', destructive: true, onPress }],
    });
  });
  return onPress;
};

test('shows title, message and actions', () => {
  openMenu();
  expect(screen.getByText('chinarecipe.org')).toBeTruthy();
  expect(screen.getByText('Remove the domain?')).toBeTruthy();
  expect(screen.getByText('Remove Domain')).toBeTruthy();
  expect(screen.getByText('Cancel')).toBeTruthy();
});

/**
 * The handler is deferred to the next frame, which under jest is a timer, so
 * the clock has to be pushed past it before asserting.
 */
const pressAction = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(`action-menu-${label}`));
  });
  await act(async () => {
    jest.advanceTimersByTime(32);
  });
};

test('pressing an action fires its handler', async () => {
  const onPress = openMenu();
  await pressAction('Remove Domain');
  expect(onPress).toHaveBeenCalled();
});

test('the handler runs only once the sheet is off screen', async () => {
  // The host is a Modal, so an action that presents its own modal (the KV
  // value editor, say) must not run while this one is still up.
  let sheetShowing: boolean | null = null;
  const onPress = jest.fn(() => {
    sheetShowing = screen.queryByTestId('action-menu-backdrop') !== null;
  });
  openMenu(onPress);

  await pressAction('Remove Domain');

  expect(onPress).toHaveBeenCalled();
  expect(sheetShowing).toBe(false);
});

test('cancel and backdrop do not fire the action', async () => {
  const onPress = openMenu();
  await pressAction('cancel');
  expect(onPress).not.toHaveBeenCalled();
});
