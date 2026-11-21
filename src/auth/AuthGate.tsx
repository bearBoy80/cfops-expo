import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { invalidateAllSnapshots } from '../cloudflare/cache';
import { removeAllConnections } from '../cloudflare/connections';
import { forgetOauthSessions } from '../cloudflare/oauthSession';
import { setAccountScope } from '../state/accountScope';
import { isAutoLockSuspended } from './autoLock';
import {
  deleteAccount,
  getAccount,
  LocalAccountStorageError,
} from './localAccount';

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
  /** Re-reads the local account after a failed read. */
  retry: () => void;
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
  const mounted = useRef(true);
  /**
   * Whether the last failure was the keychain being unreachable (locked
   * device during prewarm, a busy keychain) rather than bad data. Those clear
   * up on their own, so the read is retried when the app comes to the front
   * instead of leaving a destructive reset as the only way forward.
   */
  const transientFailure = useRef(false);
  const statusRef = useRef<AuthStatus>('loading');
  statusRef.current = status;

  const readAccount = useCallback(() => {
    void getAccount()
      .then((account) => {
        if (mounted.current) {
          transientFailure.current = false;
          setErrorKey(null);
          setStatus(
            !account
              ? 'no-account'
              : account.onboardingComplete
                ? 'locked'
                : 'onboarding',
          );
        }
      })
      .catch((cause) => {
        if (mounted.current) {
          transientFailure.current =
            cause instanceof LocalAccountStorageError &&
            cause.code === 'unavailable';
          setErrorKey('errors.account-unreadable');
          setStatus('error');
        }
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    readAccount();
    return () => {
      mounted.current = false;
    };
  }, [readAccount]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        isForeground.current = true;
        if (statusRef.current === 'error' && transientFailure.current) {
          readAccount();
        }
        return;
      }
      // A sheet we put up ourselves — the OAuth session or the biometric
      // prompt — also resigns the active state. The user never left, so this
      // must not lock, and it must not mark us as backgrounded either: the
      // completion that follows would then be discarded as a late arrival.
      if (isAutoLockSuspended()) {
        return;
      }
      isForeground.current = false;
      setStatus((current) => (current === 'unlocked' ? 'locked' : current));
    });

    return () => subscription.remove();
  }, [readAccount]);

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
        // Raised by screens whose own read failed; retrying is always safe.
        transientFailure.current = true;
        setErrorKey('errors.account-unreadable');
        setStatus('error');
      },
      retry: readAccount,
      resetAccount: async () => {
        try {
          // Credentials go first: the next local password must not inherit
          // Cloudflare access the previous one was guarding.
          await removeAllConnections();
          forgetOauthSessions();
          invalidateAllSnapshots();
          setAccountScope(null);
          await deleteAccount();
          transientFailure.current = false;
          setErrorKey(null);
          setStatus('no-account');
        } catch {
          setErrorKey('errors.account-reset-failed');
          setStatus('error');
        }
      },
    }),
    [errorKey, readAccount, status],
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
