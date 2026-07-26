import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

test('renders text', () => {
  render(<Text>hello</Text>);
  expect(screen.getByText('hello')).toBeTruthy();
});
