import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Fingerprint, Globe, LogOut, Moon, Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../src/auth/AuthGate';
import { getStoredLanguage, type AppLanguage } from '../../../src/i18n';
import {
  getAccount,
  setBiometricsEnabled,
} from '../../../src/auth/localAccount';
import {
  listConnections,
  removeConnection,
  type CloudflareConnection,
} from '../../../src/cloudflare/connections';
import { invalidateZonesSnapshot } from '../../../src/cloudflare/resources';
import {
  AccountChip,
  Card,
  InitialsAvatar,
  ListRow,
  SectionLabel,
  ToggleRow,
} from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/ThemeContext';
import { accent, label, tint } from '../../../src/theme/tokens';

const chipColors = [accent.orange, accent.blue, accent.green, accent.red];

interface Profile {
  name: string;
  organization: string;
  email: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { lock, reportAccountError } = useAuth();
  const { mode, colors, setMode } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connections, setConnections] = useState<CloudflareConnection[]>([]);
  const [biometrics, setBiometrics] = useState(false);
  const [biometricsError, setBiometricsError] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLanguage>('system');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void listConnections()
        .then((items) => {
          if (active) {
            setConnections(items);
          }
        })
        .catch(() => {
          // A failed read leaves the last known list in place.
        });

      void getStoredLanguage().then((preference) => {
        if (active) {
          setLanguage(preference);
        }
      });

      return () => {
        active = false;
      };
    }, []),
  );

  const disconnect = (connection: CloudflareConnection) => {
    Alert.alert(
      t('settings.disconnectTitle'),
      t('settings.disconnectMessage', { label: connection.label }),
      [
        { style: 'cancel', text: t('common.cancel') },
        {
          style: 'destructive',
          text: t('settings.disconnect'),
          onPress: () => {
            void removeConnection(connection.id).then(() => {
              invalidateZonesSnapshot();
              return listConnections().then(setConnections);
            });
          },
        },
      ],
    );
  };

  useEffect(() => {
    let active = true;

    void getAccount()
      .then((account) => {
        if (active && account) {
          setProfile({
            name: account.name,
            organization: account.organization,
            email: account.email,
          });
          setBiometrics(account.biometricsEnabled);
        }
      })
      .catch(() => {
        if (active) {
          reportAccountError();
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const toggleBiometrics = (value: boolean) => {
    setBiometricsError(null);
    setBiometrics(value);
    void setBiometricsEnabled(value).catch(() => {
      setBiometrics(!value);
      setBiometricsError(t('settings.biometricsError'));
    });
  };

  const languageValue =
    language === 'system' ? t('language.system') : t(`language.${language}`);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const subtitleParts = [profile?.email, profile?.organization].filter(
    (part) => part && part.length > 0,
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {t('settings.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
          {t('settings.subtitle')}
        </Text>

        <View style={[styles.accountCard, { backgroundColor: colors.surface }]}>
          <InitialsAvatar name={profile?.name ?? '?'} size={48} />
          <View style={styles.accountCopy}>
            <Text style={[styles.accountName, { color: colors.text }]}>
              {profile?.name ?? ' '}
            </Text>
            <Text style={[styles.accountDetail, { color: label(mode, 0.5) }]}>
              {subtitleParts.join(' · ')}
            </Text>
          </View>
        </View>

        <SectionLabel>
          {t('settings.connectedAccounts')} ·{' '}
          {connections.reduce((sum, item) => sum + item.accounts.length, 0)}
        </SectionLabel>
        <Card>
          {connections.length === 0 ? (
            <ListRow
              chevron={false}
              left={
                <View style={styles.emptyAccounts}>
                  <Text
                    style={[styles.emptyAccountsTitle, { color: colors.text }]}
                  >
                    {t('settings.emptyTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.emptyAccountsSub,
                      { color: label(mode, 0.4) },
                    ]}
                  >
                    {t('settings.emptySubtitle')}
                  </Text>
                </View>
              }
            />
          ) : (
            connections.flatMap((connection) =>
              connection.accounts.length === 0
                ? [
                    <ListRow
                      key={connection.id}
                      chevron={false}
                      onPress={() => disconnect(connection)}
                      left={
                        <View style={styles.accountRow}>
                          <AccountChip
                            color={accent.gray}
                            name={connection.label}
                            size={32}
                          />
                          <View style={styles.accountRowCopy}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.accountRowName,
                                { color: colors.text },
                              ]}
                            >
                              {connection.label}
                            </Text>
                            <Text
                              style={[
                                styles.accountRowSub,
                                { color: label(mode, 0.4) },
                              ]}
                            >
                              {t('settings.tokenNoAccounts')}
                            </Text>
                          </View>
                        </View>
                      }
                    />,
                  ]
                : connection.accounts.map((cfAccount, index) => (
                    <ListRow
                      key={`${connection.id}-${cfAccount.id}`}
                      chevron={false}
                      onPress={() => disconnect(connection)}
                      left={
                        <View style={styles.accountRow}>
                          <AccountChip
                            color={chipColors[index % chipColors.length]}
                            name={cfAccount.name}
                            size={32}
                          />
                          <View style={styles.accountRowCopy}>
                            <View style={styles.accountRowTitle}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.accountRowName,
                                  { color: colors.text },
                                ]}
                              >
                                {cfAccount.name}
                              </Text>
                              <View style={styles.healthDot} />
                            </View>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.accountRowSub,
                                { color: label(mode, 0.4) },
                              ]}
                            >
                              {connection.authType === 'oauth'
                                ? t('settings.authOauth')
                                : t('settings.authToken')}{' '}
                              · {connection.label}
                            </Text>
                          </View>
                        </View>
                      }
                    />
                  )),
            )
          )}
          <ListRow
            chevron={false}
            last
            onPress={() => router.push('/connect')}
            left={
              <View style={styles.connectRow}>
                <View
                  style={[
                    styles.connectIcon,
                    { backgroundColor: tint(accent.orange, '26') },
                  ]}
                >
                  <Plus
                    accessibilityElementsHidden
                    color={accent.orange}
                    size={16}
                  />
                </View>
                <Text style={styles.connectLabel}>
                  {t('common.connectAccount')}
                </Text>
              </View>
            }
          />
        </Card>

        <SectionLabel>{t('settings.preferences')}</SectionLabel>
        <Card>
          <ToggleRow
            Icon={Moon}
            color={accent.blue}
            label={t('settings.darkAppearance')}
            onValueChange={(value) => setMode(value ? 'dark' : 'light')}
            testID="dark-appearance"
            value={mode === 'dark'}
          />
          <ListRow
            last
            onPress={() => router.push('/language')}
            testID="language-row"
            left={
              <View style={styles.languageRow}>
                <View
                  style={[
                    styles.languageIcon,
                    { backgroundColor: tint(accent.purple, '26') },
                  ]}
                >
                  <Globe
                    accessibilityElementsHidden
                    color={accent.purple}
                    size={16}
                  />
                </View>
                <Text style={[styles.languageLabel, { color: colors.text }]}>
                  {t('settings.language')}
                </Text>
              </View>
            }
            right={
              <Text style={[styles.languageValue, { color: label(mode, 0.45) }]}>
                {languageValue}
              </Text>
            }
          />
        </Card>

        <SectionLabel>{t('settings.signInSecurity')}</SectionLabel>
        <Card>
          <ToggleRow
            Icon={Fingerprint}
            color={accent.green}
            label={t('settings.biometrics')}
            last
            onValueChange={toggleBiometrics}
            sub={t('settings.biometricsSub')}
            testID="biometrics"
            value={biometrics}
          />
        </Card>
        {biometricsError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {biometricsError}
          </Text>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.7}
          accessibilityRole="button"
          onPress={lock}
          style={[styles.lockButton, { backgroundColor: colors.surface }]}
        >
          <LogOut accessibilityElementsHidden color={accent.red} size={16} />
          <Text style={styles.lockLabel}>{t('settings.lockConsole')}</Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { color: label(mode, 0.3) }]}>
          {t('settings.footer', { version })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  accountRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountRowName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  accountRowSub: {
    fontSize: 12,
    marginTop: 1,
  },
  accountRowTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  healthDot: {
    backgroundColor: accent.green,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  accountCard: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 4,
    padding: 16,
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
  },
  connectIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  connectLabel: {
    color: accent.orange,
    fontSize: 15,
    fontWeight: '500',
  },
  connectRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  content: {
    paddingBottom: 24,
  },
  emptyAccounts: {
    paddingVertical: 4,
  },
  emptyAccountsSub: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyAccountsTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  error: {
    color: accent.red,
    fontSize: 12,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  footer: {
    fontSize: 11,
    marginTop: 24,
    textAlign: 'center',
  },
  languageIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  languageLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  languageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  languageValue: {
    fontSize: 14,
  },
  lockButton: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    minHeight: 48,
  },
  lockLabel: {
    color: accent.red,
    fontSize: 15,
    fontWeight: '500',
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 12,
    marginTop: 2,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingBottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
