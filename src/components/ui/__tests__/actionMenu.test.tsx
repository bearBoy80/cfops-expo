import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { ActionMenuHost, showActionMenu } from '../actionMenu';

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

test('pressing an action fires its handler', () => {
  const onPress = openMenu();
  fireEvent.press(screen.getByTestId('action-menu-Remove Domain'));
  expect(onPress).toHaveBeenCalled();
});

test('cancel and backdrop do not fire the action', () => {
  const onPress = openMenu();
  fireEvent.press(screen.getByTestId('action-menu-cancel'));
  expect(onPress).not.toHaveBeenCalled();
});
