import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../services/supabase';
import {
  signInWithSocialProvider,
  SocialAuthProvider,
  SOCIAL_PROVIDER_LABELS,
} from '../services/socialAuthService';
import { colors, radius, shadow } from '../theme';

type AuthMode = 'login' | 'register' | 'reset';

const MIN_LOGIN_PASSWORD_LENGTH = 6;
const MIN_REGISTER_PASSWORD_LENGTH = 8;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isValidEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
};

const getPasswordRequirements = (password: string) => {
  return [
    {
      key: 'length',
      label: `Минимум ${MIN_REGISTER_PASSWORD_LENGTH} символов`,
      valid: password.length >= MIN_REGISTER_PASSWORD_LENGTH,
    },
    {
      key: 'letter',
      label: 'Есть хотя бы одна буква',
      valid: /[A-Za-zА-Яа-я]/.test(password),
    },
    {
      key: 'number',
      label: 'Есть хотя бы одна цифра',
      valid: /[0-9]/.test(password),
    },
    {
      key: 'space',
      label: 'Без пробелов',
      valid: password.length > 0 && !/\s/.test(password),
    },
  ];
};

const getPasswordStrength = (password: string) => {
  const requirements = getPasswordRequirements(password);
  const validCount = requirements.filter((item) => item.valid).length;

  if (!password) {
    return {
      label: '',
      score: 0,
      percent: 0,
    };
  }

  if (validCount <= 1) {
    return {
      label: 'Слабый пароль',
      score: validCount,
      percent: 28,
    };
  }

  if (validCount <= 3) {
    return {
      label: 'Нормальный пароль',
      score: validCount,
      percent: 66,
    };
  }

  return {
    label: 'Хороший пароль',
    score: validCount,
    percent: 100,
  };
};

const mapAuthError = (message?: string) => {
  const raw = String(message || '').toLowerCase();

  if (!raw) return 'Не удалось выполнить действие. Попробуйте ещё раз.';

  if (raw.includes('invalid login credentials')) {
    return 'Неверный email или пароль.';
  }

  if (raw.includes('email not confirmed')) {
    return 'Email ещё не подтверждён. Проверьте почту и перейдите по ссылке подтверждения.';
  }

  if (raw.includes('user already registered') || raw.includes('already registered')) {
    return 'Пользователь с таким email уже зарегистрирован. Попробуйте войти.';
  }

  if (raw.includes('password should be at least') || raw.includes('weak password')) {
    return `Пароль должен соответствовать требованиям: минимум ${MIN_REGISTER_PASSWORD_LENGTH} символов, буква, цифра и без пробелов.`;
  }

  if (raw.includes('signup is disabled')) {
    return 'Регистрация отключена в настройках Supabase.';
  }

  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider')) {
    return 'Этот способ входа ещё не включён в Supabase. Включите провайдера в Authentication → Providers.';
  }

  if (raw.includes('redirect') || raw.includes('url')) {
    return 'Проверьте Redirect URLs в Supabase Authentication. Нужно добавить deep link приложения.';
  }

  if (raw.includes('email rate limit exceeded') || raw.includes('rate limit')) {
    return 'Слишком много попыток. Подождите немного и попробуйте снова.';
  }

  if (raw.includes('network') || raw.includes('fetch')) {
    return 'Нет соединения с сервером. Проверьте интернет.';
  }

  return message || 'Не удалось выполнить действие. Попробуйте ещё раз.';
};

const socialProviders: Array<'google' | 'azure'> = ['google', 'azure'];

const SOCIAL_ICONS: Record<'google' | 'azure', any> = {
  google: require('../assets/icons/social_google.png'),
  azure: require('../assets/icons/social_microsoft.png'),
};

export default function AuthScreen() {
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<AuthMode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialAuthProvider | null>(null);

  const cleanEmail = normalizeEmail(email);
  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isReset = mode === 'reset';

  const passwordRequirements = useMemo(
    () => getPasswordRequirements(password),
    [password]
  );

  const isRegisterPasswordValid = passwordRequirements.every((item) => item.valid);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const title = isLogin
    ? 'Добро пожаловать'
    : isRegister
      ? 'Создать аккаунт'
      : 'Восстановить доступ';

  const subtitle = isLogin
    ? 'Войди в FinBuddy, чтобы продолжить управление личными финансами.'
    : isRegister
      ? 'Придумай надёжный пароль или продолжи через Google/Microsoft.'
      : 'Укажи email, и мы отправим ссылку для восстановления пароля.';

  const resetFields = () => {
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    resetFields();
  };

  const validate = () => {
    if (!cleanEmail) {
      Alert.alert('Проверьте email', 'Введите email.');
      return false;
    }

    if (!isValidEmail(cleanEmail)) {
      Alert.alert('Проверьте email', 'Введите корректный email, например name@example.com.');
      return false;
    }

    if (isReset) return true;

    if (!password) {
      Alert.alert('Проверьте пароль', 'Введите пароль.');
      return false;
    }

    if (isLogin && password.length < MIN_LOGIN_PASSWORD_LENGTH) {
      Alert.alert(
        'Пароль слишком короткий',
        `Пароль должен быть не короче ${MIN_LOGIN_PASSWORD_LENGTH} символов.`
      );
      return false;
    }

    if (isRegister && !isRegisterPasswordValid) {
      Alert.alert(
        'Пароль не подходит',
        `Для регистрации пароль должен быть минимум ${MIN_REGISTER_PASSWORD_LENGTH} символов, содержать букву, цифру и не содержать пробелы.`
      );
      return false;
    }

    if (isRegister && password !== confirmPassword) {
      Alert.alert('Пароли не совпадают', 'Повторите пароль правильно.');
      return false;
    }

    return true;
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) throw error;
  };

  const handleRegister = async () => {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanEmail.split('@')[0],
        },
      },
    });

    if (error) throw error;

    if (data.session) {
      Alert.alert('Готово', 'Аккаунт создан. Добро пожаловать в FinBuddy.');
      return;
    }

    Alert.alert(
      'Подтвердите email',
      'Аккаунт создан. Проверьте почту и перейдите по ссылке подтверждения, если подтверждение email включено в Supabase.'
    );

    switchMode('login');
  };

  const handleResetPassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);

    if (error) throw error;

    Alert.alert(
      'Письмо отправлено',
      'Если аккаунт с таким email существует, на почту придёт ссылка для восстановления пароля.'
    );

    switchMode('login');
  };

  const submit = async () => {
    if (!validate()) return;

    try {
      setLoading(true);

      if (isLogin) {
        await handleLogin();
        return;
      }

      if (isRegister) {
        await handleRegister();
        return;
      }

      await handleResetPassword();
    } catch (error: any) {
      console.error('Ошибка авторизации:', error);
      Alert.alert('Ошибка', mapAuthError(error?.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: SocialAuthProvider) => {
    if (loading || socialLoading) return;

    try {
      setSocialLoading(provider);

      const result = await signInWithSocialProvider(provider);

      if (result.cancelled) return;
    } catch (error: any) {
      console.error(`Ошибка входа через ${provider}:`, error);
      Alert.alert('Ошибка входа', mapAuthError(error?.message));
    } finally {
      setSocialLoading(null);
    }
  };

  const primaryButtonDisabled =
    loading ||
    !!socialLoading ||
    (isRegister && (!isRegisterPasswordValid || password !== confirmPassword));

  const formDisabled = loading || !!socialLoading;

  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + 20, 32),
            paddingBottom: Math.max(insets.bottom + 20, 32),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoMark}>F</Text>
          </View>

          <Text style={styles.logo}>FinBuddy</Text>
          <Text style={styles.brandSubtitle}>
            Умный контроль денег, целей и расходов
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, isLogin && styles.tabActive]}
              onPress={() => switchMode('login')}
              disabled={formDisabled}
              activeOpacity={0.86}
            >
              <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
                Вход
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, isRegister && styles.tabActive]}
              onPress={() => switchMode('register')}
              disabled={formDisabled}
              activeOpacity={0.86}
            >
              <Text style={[styles.tabText, isRegister && styles.tabTextActive]}>
                Регистрация
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {!isReset && (
            <>
              <View style={styles.socialStack}>
                {socialProviders.map((provider) => {
                  const isLoadingProvider = socialLoading === provider;

                  return (
                    <TouchableOpacity
                      key={provider}
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin(provider)}
                      disabled={formDisabled}
                      activeOpacity={0.86}
                    >
                      <View style={styles.socialIcon}>
                        <Image
                          source={SOCIAL_ICONS[provider]}
                          style={styles.socialIconImage}
                          resizeMode="contain"
                        />
                      </View>

                      <Text style={styles.socialButtonText}>
                        Продолжить с {SOCIAL_PROVIDER_LABELS[provider]}
                      </Text>

                      {isLoadingProvider && (
                        <ActivityIndicator color={colors.primary} size="small" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>или через email</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="email@example.com"
            placeholderTextColor={colors.textSoft}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!formDisabled}
            textContentType="emailAddress"
          />

          {!isReset && (
            <>
              <Text style={styles.inputLabel}>Пароль</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder={
                    isRegister
                      ? `Минимум ${MIN_REGISTER_PASSWORD_LENGTH} символов`
                      : 'Введите пароль'
                  }
                  placeholderTextColor={colors.textSoft}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!formDisabled}
                  textContentType={isLogin ? 'password' : 'newPassword'}
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword((value) => !value)}
                  disabled={formDisabled}
                  activeOpacity={0.82}
                >
                  <Text style={styles.passwordToggleText}>
                    {showPassword ? 'Скрыть' : 'Показать'}
                  </Text>
                </TouchableOpacity>
              </View>

              {isRegister && (
                <View style={styles.passwordRulesCard}>
                  <View style={styles.strengthHeader}>
                    <Text style={styles.passwordRulesTitle}>
                      Требования к паролю
                    </Text>

                    {!!strength.label && (
                      <Text
                        style={[
                          styles.strengthLabel,
                          {
                            color:
                              strength.score <= 1
                                ? colors.danger
                                : strength.score <= 3
                                  ? colors.warning
                                  : colors.success,
                          },
                        ]}
                      >
                        {strength.label}
                      </Text>
                    )}
                  </View>

                  <View style={styles.strengthTrack}>
                    <View
                      style={[
                        styles.strengthFill,
                        {
                          width: `${strength.percent}%`,
                          backgroundColor:
                            strength.score <= 1
                              ? colors.danger
                              : strength.score <= 3
                                ? colors.warning
                                : colors.success,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.requirementsList}>
                    {passwordRequirements.map((requirement) => (
                      <View key={requirement.key} style={styles.requirementRow}>
                        <View
                          style={[
                            styles.requirementDot,
                            requirement.valid && styles.requirementDotValid,
                          ]}
                        >
                          <Text
                            style={[
                              styles.requirementDotText,
                              requirement.valid && styles.requirementDotTextValid,
                            ]}
                          >
                            {requirement.valid ? '✓' : '•'}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.requirementText,
                            requirement.valid && styles.requirementTextValid,
                          ]}
                        >
                          {requirement.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {isRegister && (
                <>
                  <Text style={styles.inputLabel}>Повторите пароль</Text>
                  <TextInput
                    style={[
                      styles.input,
                      !!confirmPassword &&
                        password !== confirmPassword &&
                        styles.inputError,
                    ]}
                    placeholder="Повторите пароль"
                    placeholderTextColor={colors.textSoft}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    editable={!formDisabled}
                    textContentType="newPassword"
                    autoCapitalize="none"
                  />

                  {!!confirmPassword && password !== confirmPassword && (
                    <Text style={styles.errorText}>Пароли не совпадают</Text>
                  )}
                </>
              )}
            </>
          )}

          <TouchableOpacity
            style={[styles.button, primaryButtonDisabled && styles.buttonDisabled]}
            onPress={submit}
            disabled={primaryButtonDisabled}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>
                {isLogin ? 'Войти' : isRegister ? 'Создать аккаунт' : 'Отправить ссылку'}
              </Text>
            )}
          </TouchableOpacity>

          {isLogin && (
            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() => switchMode('reset')}
              disabled={formDisabled}
              activeOpacity={0.86}
            >
              <Text style={styles.forgotText}>Забыли пароль?</Text>
            </TouchableOpacity>
          )}

          {isReset && (
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => switchMode('login')}
              disabled={formDisabled}
              activeOpacity={0.86}
            >
              <Text style={styles.switchText}>Вернуться ко входу</Text>
            </TouchableOpacity>
          )}

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>
              {isLogin ? 'Безопасный вход' : isRegister ? 'Зачем сложный пароль?' : 'Важно'}
            </Text>
            <Text style={styles.infoText}>
              {isLogin
                ? 'Данные хранятся в Supabase. Можно войти через email или внешний аккаунт.'
                : isRegister
                  ? 'Для Google и Microsoft пароль не нужен — аккаунт создаётся через выбранного провайдера.'
                  : 'Если письмо не пришло, проверь папку Спам или убедись, что email введён правильно.'}
            </Text>
          </View>
        </View>

        <Text style={styles.footerText}>
          Продолжая, вы соглашаетесь использовать FinBuddy для личного финансового учёта.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
    backgroundColor: colors.background,
  },

  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },

  brandBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },

  logoCircle: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...shadow.elevated,
  },

  logoMark: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },

  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  brandSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.strong,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.lg,
    padding: 5,
    marginBottom: 20,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: 11,
  },

  tabActive: {
    backgroundColor: colors.primary,
  },

  tabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '900',
  },

  tabTextActive: {
    color: '#FFFFFF',
  },

  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },

  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 18,
  },

  socialStack: {
    marginBottom: 14,
  },

  socialButton: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    minHeight: 52,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },

  socialIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  socialIconImage: {
    width: 21,
    height: 21,
  },

  socialButtonText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },

  dividerText: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
    marginHorizontal: 10,
    textTransform: 'uppercase',
  },

  inputLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },

  input: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
    marginBottom: 14,
  },

  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    marginBottom: 6,
  },

  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: -2,
  },

  passwordWrap: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },

  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },

  passwordToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },

  passwordRulesCard: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: -2,
    marginBottom: 14,
  },

  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },

  passwordRulesTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  strengthLabel: {
    fontSize: 12,
    fontWeight: '900',
  },

  strengthTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: 11,
  },

  strengthFill: {
    height: '100%',
    borderRadius: 999,
  },

  requirementsList: {
    gap: 8,
  },

  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  requirementDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  requirementDotValid: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },

  requirementDotText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
  },

  requirementDotTextValid: {
    color: '#FFFFFF',
  },

  requirementText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12.5,
    fontWeight: '800',
  },

  requirementTextValid: {
    color: colors.text,
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  buttonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
  },

  forgotButton: {
    alignItems: 'center',
    marginTop: 15,
  },

  forgotText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  switchButton: {
    alignItems: 'center',
    marginTop: 15,
  },

  switchText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  infoBox: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 18,
  },

  infoTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 5,
  },

  infoText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },

  footerText: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 16,
    paddingHorizontal: 10,
  },
});
