import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { isAutoLockSuspended } from './autoLock';
import { deleteAccount, getAccount } from './localAccount';

export type AuthStatus =
  | 'loading'
  | 'no-account'
  | 'onboarding'
  | 'locked'
  | 'unlocked'
  | 'error';

interface AuthValue {
  status: AuthStatus;
  /** i18n resource key describing the account error, translated at display. */
  errorKey: string | null;
  unlock: () => void;
  lock: () => void;
  onOnboardingCompleted: () => void;
  reportAccountError: () => void;
  resetAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // iOS prewarming can start the process while backgrounded, so derive the
  // initial foreground state instead of assuming `true`. `currentState` may
  // still be null this early, which we treat as foreground.
  const isForeground = useRef(AppState.currentState !== 'background');

  useEffect(() => {
    let active = true;

    void getAccount()
      .then((account) => {
        if (active) {
          setStatus(
            !account
              ? 'no-account'
              : account.onboardingComplete
                ? 'locked'
                : 'onboarding',
          );
        }
      })
      .catch(() => {
        if (active) {
          setErrorKey('errors.account-unreadable');
          setStatus('error');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      isForeground.current = nextState === 'active';
      if (nextState !== 'active' && !isAutoLockSuspended()) {
        setStatus((current) =>
          current === 'unlocked' ? 'locked' : current,
        );
      }
    });

    return () => subscription.remove();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      errorKey,
      unlock: () => {
        if (!isForeground.current) {
          return;
        }
        setErrorKey(null);
        setStatus('unlocked');
      },
      lock: () => setStatus('locked'),
      onOnboardingCompleted: () => {
        setErrorKey(null);
        setStatus(isForeground.current ? 'unlocked' : 'locked');
      },
      reportAccountError: () => {
        setErrorKey('errors.account-unreadable');
        setStatus('error');
      },
      resetAccount: async () => {
        try {
          await deleteAccount();
          setErrorKey(null);
          setStatus('no-account');
        } catch {
          setErrorKey('errors.account-reset-failed');
          setStatus('error');
        }
      },
    }),
    [errorKey, status],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthGateProvider');
  }
  return value;
}
