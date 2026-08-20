import { useSyncExternalStore } from 'react';

/**
 * Cross-tab "active Cloudflare account" scope.
 *
 * The account switcher lives on the Home tab, but Zones / Compute / Storage
 * must react to it too. React context would only cover a single navigator
 * subtree, so we keep the scope in a tiny module-level store that every tab
 * subscribes to. `null` means "All accounts".
 */

let currentScope: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setAccountScope(accountId: string | null): void {
  if (currentScope === accountId) {
    return;
  }
  currentScope = accountId;
  emit();
}

export function getAccountScope(): string | null {
  return currentScope;
}

/** Test helper: clears the shared scope so specs don't leak into each other. */
export function resetAccountScope(): void {
  currentScope = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface AccountScope {
  /** Selected Cloudflare accountId, or null for "All accounts". */
  scope: string | null;
  setScope: (accountId: string | null) => void;
}

export function useAccountScope(): AccountScope {
  const scope = useSyncExternalStore(subscribe, getAccountScope, getAccountScope);
  return { scope, setScope: setAccountScope };
}
