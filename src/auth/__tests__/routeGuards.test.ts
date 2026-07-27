import { routeGuards } from '../routeGuards';

test.each([
  ['loading', 'loading'],
  ['no-account', 'onboarding'],
  ['locked', 'unlock'],
  ['error', 'error'],
  ['unlocked', 'tabs'],
] as const)('allows only the %s route group', (status, expectedRoute) => {
  const guards = routeGuards(status);

  expect(Object.entries(guards).filter(([, allowed]) => allowed)).toEqual([
    [expectedRoute, true],
  ]);
});
