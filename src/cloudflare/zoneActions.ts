import type { TFunction } from 'i18next';
import { showActionMenu } from '../components/ui';

/**
 * Confirms a cache purge for one zone.
 *
 * The zone overview and the cache sub-page both offer the action with the same
 * copy, so the sheet is built once here: two copies of a confirmation is two
 * chances for them to drift apart on wording or on which button is
 * destructive.
 */
export function confirmPurgeCache(
  t: TFunction,
  zoneName: string | undefined,
  onConfirm: () => void,
): void {
  showActionMenu({
    title: t('zone.purgeCache'),
    message: zoneName
      ? `${zoneName} · ${t('zone.purgeConfirm')}`
      : t('zone.purgeConfirm'),
    cancelLabel: t('common.cancel'),
    actions: [
      {
        label: t('zone.purgeCache'),
        destructive: true,
        onPress: onConfirm,
      },
    ],
  });
}
