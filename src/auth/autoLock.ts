/**
 * Auto-lock suppression for intentional system sheets.
 *
 * Leaving the foreground normally re-locks the console. But presenting an
 * `ASWebAuthenticationSession` for OAuth also drops the app out of `active`,
 * which would lock it mid-flow: the tab stack unmounts, and the screen that
 * started the sign-in is gone by the time the browser hands the code back.
 *
 * The user has not actually left — the sheet is on top of our own app — so the
 * lock is suspended while it is up. The trade-off is that genuinely switching
 * to another app during authorization will not lock either; that window is
 * seconds long and bounded by the session.
 *
 * A counter rather than a boolean, so overlapping suspensions cannot clear each
 * other's state.
 */
let suspensions = 0;

/** Suspends auto-lock until the returned release function is called. */
export function suspendAutoLock(): () => void {
  suspensions += 1;
  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;
    suspensions = Math.max(0, suspensions - 1);
  };
}

export function isAutoLockSuspended(): boolean {
  return suspensions > 0;
}

/** Drops all suspensions. Test helper. */
export function resetAutoLock(): void {
  suspensions = 0;
}
