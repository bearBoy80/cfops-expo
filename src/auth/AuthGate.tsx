import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { deleteAccount, getAccount } from './localAccount';

export type AuthStatus =
  | 'loading'
  | 'no-account'
  | 'locked'
  | 'unlocked'
  | 'error';

interface AuthValue {
  status: AuthStatus;
  errorMessage: string | null;
  unlock: () => void;
  lock: () => void;
  onAccountCreated: () => void;
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isForeground = useRef(true);

  useEffect(() => {
    let active = true;

    void getAccount()
      .then((account) => {
        if (active) {
          setStatus(account ? 'locked' : 'no-account');
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage(
            'The local account could not be read. Reset it to continue.',
          );
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
      if (nextState !== 'active') {
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
      errorMessage,
      unlock: () => {
        if (!isForeground.current) {
          return;
        }
        setErrorMessage(null);
        setStatus('unlocked');
      },
      lock: () => setStatus('locked'),
      onAccountCreated: () => {
        if (!isForeground.current) {
          return;
        }
        setErrorMessage(null);
        setStatus('unlocked');
      },
      reportAccountError: () => {
        setErrorMessage(
          'The local account could not be read. Reset it to continue.',
        );
        setStatus('error');
      },
      resetAccount: async () => {
        try {
          await deleteAccount();
          setErrorMessage(null);
          setStatus('no-account');
        } catch {
          setErrorMessage(
            'The local account could not be reset. Please try again.',
          );
          setStatus('error');
        }
      },
    }),
    [errorMessage, status],
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
