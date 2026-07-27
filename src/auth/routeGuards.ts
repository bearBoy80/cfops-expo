import type { AuthStatus } from './AuthGate';

export interface RouteGuards {
  loading: boolean;
  onboarding: boolean;
  unlock: boolean;
  error: boolean;
  tabs: boolean;
}

export function routeGuards(status: AuthStatus): RouteGuards {
  return {
    loading: status === 'loading',
    onboarding: status === 'no-account' || status === 'onboarding',
    unlock: status === 'locked',
    error: status === 'error',
    tabs: status === 'unlocked',
  };
}
