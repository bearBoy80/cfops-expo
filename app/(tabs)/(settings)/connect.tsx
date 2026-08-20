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
import * as WebBrowser from 'expo-web-browser';
import { Cloud, ChevronLeft, KeyRound, ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthTextInput } from '@/src/components/AuthTextInput';
import { useConnectAccount } from '@/src/cloudflare/useConnectAccount';
import { useTabBarInset } from '@/src/components/useTabBarInset';
import { useTheme } from '@/src/theme/ThemeContext';
import {
  accent,
  fontFace,
  foreground,
  hairline,
  label,
  tint,
} from '@/src/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

export default function ConnectAccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode, colors } = useTheme();
  const bottomInset = useTabBarInset();
  const [token, setToken] = useState('');
  const {
    busy,
    canStartOauth,
    clearError,
    connectWithOauth,
    connectWithToken,
    error,
    oauthConfigured,
  } = useConnectAccount(() => {
    // The OAuth sheet can outlive this screen, so the history may be gone by
    // the time the credential lands. Leaving the user on a screen that has
    // already done its job reads as a silent failure, so fall back to an
    // explicit destination rather than doing nothing.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/(settings)');
    }
  });

  const canSubmitToken = token.trim().length > 0 && busy === null;
  const submitToken = () => void connectWithToken(token);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
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
            onPress={() => void connectWithOauth()}
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
          {!oauthConfigured ? (
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
                clearError();
              }
            }}
            onSubmitEditing={submitToken}
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
            onPress={submitToken}
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
    ...fontFace('headline', '400'),
    color: accent.orange,
  },
  content: {},
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginVertical: 18,
  },
  dividerLabel: {
    ...fontFace('footnote'),
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  error: {
    ...fontFace('subhead'),
    color: accent.red,
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
    ...fontFace('bodyLarge', '600'),
    color: foreground.onAccent,
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
    ...fontFace('bodyLarge', '600'),
    color: accent.orange,
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
