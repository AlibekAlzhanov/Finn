import React, { useState } from 'react';
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
} from 'react-native';

import { supabase } from '../services/supabase';
import { colors, radius, shadow } from '../theme';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      Alert.alert('Проверьте данные', 'Введите email и пароль.');
      return;
    }

    try {
      setLoading(true);

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        Alert.alert('Готово', 'Аккаунт создан. Если включено подтверждение email, проверьте почту.');
      }
    } catch (error: any) {
      console.error('Ошибка авторизации:', error);
      Alert.alert('Ошибка', error?.message || 'Не удалось выполнить вход.');
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>FinBuddy</Text>
        <Text style={styles.title}>{isLogin ? 'Вход' : 'Регистрация'}</Text>
        <Text style={styles.subtitle}>
          Учет личных финансов, AI-анализ и цели в одном приложении.
        </Text>

        <Text style={styles.inputLabel}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="email@example.com"
          placeholderTextColor={colors.textSoft}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.inputLabel}>Пароль</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.textSoft}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={submit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>{isLogin ? 'Войти' : 'Создать аккаунт'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setMode(isLogin ? 'register' : 'login')}
          disabled={loading}
        >
          <Text style={styles.switchText}>
            {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 22,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.strong,
  },

  logo: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
  },

  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 22,
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

  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
  },

  switchButton: {
    alignItems: 'center',
    marginTop: 16,
  },

  switchText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
});
