import { renderHook } from '@testing-library/react-native';
import { useSequencer } from '../useSequencedLoad';

/** Resolves once `release` is called, so run order can be forced. */
function deferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('a superseded run cannot write state after the newer one', async () => {
  const { result } = renderHook(() => useSequencer());
  const applied: string[] = [];
  const apply = (value: string) => applied.push(value);

  const first = deferred<string>();
  const second = deferred<string>();

  // Two loads in flight, as happens when a delete triggers a reload while a
  // pull-to-refresh is still running.
  const firstRun = result.current(async (ifCurrent) => {
    ifCurrent(apply)(await first.promise);
  });
  const secondRun = result.current(async (ifCurrent) => {
    ifCurrent(apply)(await second.promise);
  });

  // The newer run answers first, then the stale one comes back.
  second.release('fresh');
  await secondRun;
  first.release('stale');
  await firstRun;

  expect(applied).toEqual(['fresh']);
});

test('a run that finishes uncontested still writes', async () => {
  const { result } = renderHook(() => useSequencer());
  const applied: string[] = [];

  await result.current(async (ifCurrent) => {
    ifCurrent((value: string) => applied.push(value))('loaded');
  });

  expect(applied).toEqual(['loaded']);
});

test('runs in progress stop writing once the screen unmounts', async () => {
  const { result, unmount } = renderHook(() => useSequencer());
  const applied: string[] = [];
  const pending = deferred<string>();

  const run = result.current(async (ifCurrent) => {
    ifCurrent((value: string) => applied.push(value))(await pending.promise);
  });

  unmount();
  pending.release('late');
  await run;

  expect(applied).toEqual([]);
});
