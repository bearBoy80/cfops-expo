import { useCallback, useEffect, useRef } from 'react';

/** Applies a value only while the run that produced it is still the latest. */
export type IfCurrent = <A>(apply: (value: A) => void) => (value: A) => void;

/**
 * Screen-wide guard against out-of-order responses.
 *
 * Detail screens load on mount, again on pull-to-refresh, and again after a
 * mutation, so two loads are easily in flight at once. Responses do not
 * necessarily come back in the order they were requested: without this, the
 * earlier one can land last and put the pre-mutation list back on screen —
 * deleted rows reappear, and only the next refresh clears them.
 *
 * Every run through the returned `sequence` takes the next ticket, so a newer
 * run always wins over an older one no matter which finishes first. Runs are
 * wrapped rather than each setter guarded individually:
 *
 * ```ts
 * const sequence = useSequencer();
 * const load = useCallback(
 *   () =>
 *     sequence(async (ifCurrent) => {
 *       ifCurrent(setItems)(await listThings());
 *     }),
 *   [sequence],
 * );
 * ```
 *
 * Unmounting supersedes everything, so a screen the user has already left
 * stops writing state.
 */
export function useSequencer(): (
  run: (ifCurrent: IfCurrent) => Promise<unknown>,
) => Promise<void> {
  const latest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback(async (run) => {
    latest.current += 1;
    const ticket = latest.current;
    const ifCurrent: IfCurrent =
      (apply) =>
      (value) => {
        if (mounted.current && latest.current === ticket) {
          apply(value);
        }
      };
    await run(ifCurrent);
  }, []);
}
