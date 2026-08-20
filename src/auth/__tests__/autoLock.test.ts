import {
  isAutoLockSuspended,
  resetAutoLock,
  suspendAutoLock,
} from '../autoLock';

beforeEach(() => {
  resetAutoLock();
});

test('is not suspended by default', () => {
  expect(isAutoLockSuspended()).toBe(false);
});

test('suspends until the release function runs', () => {
  const release = suspendAutoLock();
  expect(isAutoLockSuspended()).toBe(true);

  release();
  expect(isAutoLockSuspended()).toBe(false);
});

test('stays suspended until every holder releases', () => {
  const first = suspendAutoLock();
  const second = suspendAutoLock();

  first();
  expect(isAutoLockSuspended()).toBe(true);

  second();
  expect(isAutoLockSuspended()).toBe(false);
});

test('ignores a release that runs twice', () => {
  const first = suspendAutoLock();
  const second = suspendAutoLock();

  // A double release must not cancel the other holder's suspension, which is
  // why this is a counter guarded by a per-holder flag.
  first();
  first();
  expect(isAutoLockSuspended()).toBe(true);

  second();
  expect(isAutoLockSuspended()).toBe(false);
});

test('never drops below zero', () => {
  const release = suspendAutoLock();
  release();
  release();

  const next = suspendAutoLock();
  expect(isAutoLockSuspended()).toBe(true);
  next();
  expect(isAutoLockSuspended()).toBe(false);
});
