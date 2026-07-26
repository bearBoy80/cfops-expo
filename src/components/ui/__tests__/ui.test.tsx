import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { Card, ListRow, SectionLabel, MetricTile, Pill, AccountChip, EmptyState } from '..';

jest.mock('lucide-react-native');

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

test('ListRow renders content and fires onPress', () => {
  const onPress = jest.fn();
  wrap(<Card><ListRow left={<Text>acme.com</Text>} onPress={onPress} last /></Card>);
  fireEvent.press(screen.getByText('acme.com'));
  expect(onPress).toHaveBeenCalled();
});

test('Pill maps status to label', () => {
  wrap(<Pill status="active" />);
  expect(screen.getByText('active')).toBeTruthy();
});

test('MetricTile shows label/value/sub', () => {
  wrap(<MetricTile label="Requests" value="6.4B" sub="+8.2% today" color="#f6821f" />);
  expect(screen.getByText('Requests')).toBeTruthy();
  expect(screen.getByText('6.4B')).toBeTruthy();
});

test('AccountChip shows initial', () => {
  wrap(<AccountChip name="Acme Corp" color="#f6821f" />);
  expect(screen.getByText('A')).toBeTruthy();
});

test('EmptyState fires action', () => {
  const onAction = jest.fn();
  const { Globe } = require('lucide-react-native');
  wrap(<EmptyState Icon={Globe} title="No accounts" subtitle="Bind one" actionLabel="Connect" onAction={onAction} />);
  fireEvent.press(screen.getByText('Connect'));
  expect(onAction).toHaveBeenCalled();
});

test('SectionLabel uppercases', () => {
  wrap(<SectionLabel>Quick Access</SectionLabel>);
  expect(screen.getByText('Quick Access')).toBeTruthy();
});
