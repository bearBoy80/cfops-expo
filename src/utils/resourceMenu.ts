import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { TFunction } from 'i18next';
import { showActionMenu } from '../components/ui/actionMenu';

interface ResourceMenuOptions {
  title: string;
  copyLabel: string;
  copyValue: string;
  /** Path appended to https://dash.cloudflare.com/ for the dashboard action. */
  dashboardPath?: string;
  t: TFunction;
  onCopied?: () => void;
}

/** Long-press context menu for list resources: copy identifier, open dashboard. */
export function showResourceMenu({
  title,
  copyLabel,
  copyValue,
  dashboardPath,
  t,
  onCopied,
}: ResourceMenuOptions): void {
  showActionMenu({
    title,
    cancelLabel: t('common.cancel'),
    actions: [
      {
        label: copyLabel,
        onPress: () => {
          void Clipboard.setStringAsync(copyValue)
            .then(() => onCopied?.())
            .catch(() => {});
        },
      },
      ...(dashboardPath
        ? [
            {
              label: t('common.openDashboard'),
              onPress: () => {
                void Linking.openURL(
                  `https://dash.cloudflare.com/${dashboardPath}`,
                ).catch(() => {});
              },
            },
          ]
        : []),
    ],
  });
}
