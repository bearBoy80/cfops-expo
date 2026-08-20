import {
  invalidateComputeSnapshot,
  invalidateStorageSnapshot,
} from './accountResources';
import {
  invalidateAnalyticsSnapshot,
  invalidateStorageMetrics,
  invalidateWorkerMetrics,
  invalidateZonesRangeSnapshot,
} from './analytics';
import { invalidateZonesSnapshot } from './resources';

/**
 * Clears every cached snapshot at once. Adding or removing a credential
 * changes which accounts are reachable, so each account-scoped cache would
 * otherwise keep serving results for the previous credential set until its
 * TTL expires — up to five minutes for the range snapshot.
 */
export function invalidateAllSnapshots(): void {
  invalidateZonesSnapshot();
  invalidateStorageSnapshot();
  invalidateComputeSnapshot();
  invalidateAnalyticsSnapshot();
  invalidateZonesRangeSnapshot();
  invalidateWorkerMetrics();
  invalidateStorageMetrics();
}
