import { fireEvent, render, screen } from '@testing-library/react-native';
import { AuthTextInput } from '../AuthTextInput';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('lucide-react-native', () => ({
  Eye: () => null,
  EyeOff: () => null,
}));

test('toggles password visibility with an accessible action', () => {
  render(
    <ThemeProvider>
      <AuthTextInput
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
        showPasswordToggle
        value="hunter2secret"
      />
    </ThemeProvider>,
  );

  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
  expect(
    screen.getByRole('button', { name: 'Hide password' }),
  ).toBeTruthy();
});
