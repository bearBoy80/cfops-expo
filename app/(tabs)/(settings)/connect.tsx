import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthRequest } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Cloud, ChevronLeft, KeyRound, ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthTextInput } from '@/src/components/AuthTextInput';
import {
  addConnection,
  addOauthConnection,
} from '@/src/cloudflare/connections';
import { invalidateZonesSnapshot } from '@/src/cloudflare/resources';
import {
  discovery,
  exchangeAuthorizationCode,
  fetchOauthIdentity,
  getOauthConfig,
  redirectUri,
} from '@/src/cloudflare/oauth';
import { cloudflareErrorMessage } from '@/src/i18n/errors';
import { useTheme } from '@/src/theme/ThemeContext';
import { accent, foreground, hairline, label, tint } from '@/src/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

export default function ConnectAccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'oauth' | 'token' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const oauthConfig = getOauthConfig();
  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: oauthConfig?.clientId ?? 'unconfigured',
      scopes: oauthConfig?.scopes ?? [],
      redirectUri,
    },
    discovery,
  );

  const canSubmitToken = token.trim().length > 0 && !busy;
  const canStartOauth = Boolean(oauthConfig && request) && !busy;

  const reportError = (cause: unknown) => {
    setError(cloudflareErrorMessage(cause));
  };

  const connectWithOauth = async () => {
    if (!canStartOauth || !request) {
      return;
    }
    setBusy('oauth');
    setError(null);
    try {
      const result = await promptAsync();
      if (result.type === 'cancel' || result.type === 'dismiss') {
        setBusy(null);
        return;
      }
      const tokens = await exchangeAuthorizationCode(request, result);
      const identity = await fetchOauthIdentity(tokens.accessToken);
      await addOauthConnection(tokens, identity);
      invalidateZonesSnapshot();
      router.back();
    } catch (cause) {
      reportError(cause);
      setBusy(null);
    }
  };

  const connectWithToken = async () => {
    if (!canSubmitToken) {
      return;
    }
    setBusy('token');
    setError(null);
    try {
      await addConnection(token);
      invalidateZonesSnapshot();
      router.back();
    } catch (cause) {
      reportError(cause);
      setBusy(null);
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft color={accent.orange} size={18} />
          <Text style={styles.backLabel}>{t('tabs.settings')}</Text>
        </Pressable>

        <View
          style={[styles.hero, { backgroundColor: tint(accent.orange, '1f') }]}
        >
          <KeyRound color={accent.orange} size={26} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('connect.title')}
        </Text>
        <Text style={[styles.subtitle, { color: label(mode, 0.5) }]}>
          {t('connect.subtitle')}
        </Text>

        <View style={styles.form}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !canStartOauth }}
            activeOpacity={0.8}
            disabled={!canStartOauth}
            onPress={connectWithOauth}
            style={[
              styles.primaryButton,
              {
                backgroundColor: accent.orange,
                opacity: canStartOauth ? 1 : 0.5,
              },
            ]}
            testID="oauth-signin"
          >
            {busy === 'oauth' ? (
              <ActivityIndicator color={foreground.onAccent} size="small" />
            ) : (
              <>
                <Cloud
                  accessibilityElementsHidden
                  color={foreground.onAccent}
                  size={18}
                />
                <Text style={styles.primaryButtonText}>
                  {t('connect.oauthButton')}
                </Text>
              </>
            )}
          </TouchableOpacity>
          {!oauthConfig ? (
            <Text style={[styles.hint, { color: label(mode, 0.45) }]}>
              {t('connect.oauthNotConfigured')}
            </Text>
          ) : null}

          <View style={styles.divider}>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: hairline(mode, 0.12) },
              ]}
            />
            <Text style={[styles.dividerLabel, { color: label(mode, 0.4) }]}>
              {t('connect.divider')}
            </Text>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: hairline(mode, 0.12) },
              ]}
            />
          </View>

          <AuthTextInput
            disabled={busy !== null}
            onChangeText={(value) => {
              setToken(value);
              if (error) {
                setError(null);
              }
            }}
            onSubmitEditing={connectWithToken}
            placeholder={t('connect.tokenPlaceholder')}
            returnKeyType="go"
            secureTextEntry
            showPasswordToggle
            testID="api-token"
            value={token}
          />

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmitToken }}
            activeOpacity={0.8}
            disabled={!canSubmitToken}
            onPress={connectWithToken}
            style={[
              styles.secondaryButton,
              {
                backgroundColor: colors.surface,
                opacity: canSubmitToken ? 1 : 0.5,
              },
            ]}
            testID="connect-submit"
          >
            {busy === 'token' ? (
              <ActivityIndicator color={accent.orange} size="small" />
            ) : (
              <Text style={styles.secondaryButtonText}>
                {t('connect.submit')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View
          style={[styles.helpCard, { backgroundColor: colors.surface }]}
        >
          <ShieldCheck
            accessibilityElementsHidden
            color={accent.green}
            size={16}
          />
          <Text style={[styles.helpText, { color: label(mode, 0.55) }]}>
            {t('connect.help')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  backLabel: {
    color: accent.orange,
    fontSize: 17,
  },
  content: {
    paddingBottom: 24,
  },
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginVertical: 18,
  },
  dividerLabel: {
    fontSize: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  error: {
    color: accent.red,
    fontSize: 13,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  form: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  helpCard: {
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 14,
  },
  helpText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  hero: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 18,
    height: 64,
    justifyContent: 'center',
    marginTop: 16,
    width: 64,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryButtonText: {
    color: foreground.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  safeArea: {
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 50,
  },
  secondaryButtonText: {
    color: accent.orange,
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: 14,
    textAlign: 'center',
  },
});
