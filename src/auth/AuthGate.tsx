import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getAccount } from './localAccount';

export type AuthStatus = 'loading' | 'no-account' | 'locked' | 'unlocked';

interface AuthValue {
  status: AuthStatus;
  unlock: () => void;
  lock: () => void;
  onAccountCreated: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;

    void getAccount().then((account) => {
      if (active) {
        setStatus(account ? 'locked' : 'no-account');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      unlock: () => setStatus('unlocked'),
      lock: () => setStatus('locked'),
      onAccountCreated: () => setStatus('unlocked'),
    }),
    [status],
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
