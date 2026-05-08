import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import { colors, radius, shadow, typography } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon, { IconName } from '../components/ui/AppIcon';

type TransactionRow = {
  type?: 'income' | 'expense' | 'transfer' | string | null;
  amount?: number | string | null;
  transaction_date?: string | null;
};

type ProfileStats = {
  balance: number;
  monthIncome: number;
  monthExpense: number;
  allIncome: number;
  allExpense: number;
  operationsCount: number;
  accountsCount: number;
  categoriesCount: number;
  budgetsCount: number;
  goalsCount: number;
  activeSubscriptionsCount: number;
};

type QuickAction = {
  title: string;
  subtitle: string;
  icon: IconName;
  route: string;
};

const emptyStats: ProfileStats = {
  balance: 0,
  monthIncome: 0,
  monthExpense: 0,
  allIncome: 0,
  allExpense: 0,
  operationsCount: 0,
  accountsCount: 0,
  categoriesCount: 0,
  budgetsCount: 0,
  goalsCount: 0,
  activeSubscriptionsCount: 0,
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isValidDate = (value: unknown) => {
  if (!value) return false;

  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
};

const getInitials = (name: string, email: string) => {
  const source = name.trim() || email.trim();

  if (!source) return 'FB';

  const parts = source
    .replace(/@.*/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
};

const formatDate = (value: unknown) => {
  if (!value) return 'не указано';

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return 'не указано';

  return date.toLocaleDateString('ru-KZ', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const getFinanceStatus = (income: number, expense: number) => {
  if (income <= 0 && expense <= 0) {
    return {
      label: 'Нет данных',
      text: 'Добавь операции, чтобы профиль показывал финансовый статус.',
    };
  }

  if (income > expense) {
    return {
      label: 'Плюс',
      text: 'В этом месяце доходы выше расходов. Хороший финансовый темп.',
    };
  }

  if (income === expense) {
    return {
      label: 'Ровно',
      text: 'Доходы и расходы почти равны. Стоит усилить контроль лимитов.',
    };
  }

  return {
    label: 'Контроль',
    text: 'Расходы выше доходов. Проверь подписки, лимиты и крупные траты.',
  };
};


export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [displayName, setDisplayName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [stats, setStats] = useState<ProfileStats>(emptyStats);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const email = user?.email || '';
  const createdAt = (user as any)?.created_at;
  const confirmedAt = (user as any)?.email_confirmed_at;
  const status = getFinanceStatus(stats.monthIncome, stats.monthExpense);

  const initials = useMemo(() => getInitials(savedName || displayName, email), [
    savedName,
    displayName,
    email,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [user?.id])
  );

  const getUserName = () => {
    const metadata = (user as any)?.user_metadata || {};

    return (
      metadata.full_name ||
      metadata.name ||
      metadata.display_name ||
      ''
    );
  };

  const safeCount = async (tableName: string, queryBuilder?: (query: any) => any) => {
    try {
      let query = supabase
        .from(tableName)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user?.id);

      if (queryBuilder) {
        query = queryBuilder(query);
      }

      const { count, error } = await query;

      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.log(`Не удалось получить count для ${tableName}:`, error);
      return 0;
    }
  };

  const loadProfile = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const currentName = getUserName();

      setDisplayName(currentName);
      setSavedName(currentName);

      const transactionsResult = await supabase
        .from('transactions')
        .select('type, amount, transaction_date')
        .eq('user_id', user.id);

      if (transactionsResult.error) throw transactionsResult.error;

      const transactions = ((transactionsResult.data || []).filter(Boolean)) as TransactionRow[];

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let balance = 0;
      let monthIncome = 0;
      let monthExpense = 0;
      let allIncome = 0;
      let allExpense = 0;

      transactions.forEach((tx) => {
        const amount = safeNumber(tx.amount);

        if (tx.type === 'income') {
          balance += amount;
          allIncome += amount;
        }

        if (tx.type === 'expense') {
          balance -= amount;
          allExpense += amount;
        }

        if (!isValidDate(tx.transaction_date)) return;

        const txDate = new Date(String(tx.transaction_date));
        const isThisMonth =
          txDate.getMonth() === currentMonth &&
          txDate.getFullYear() === currentYear;

        if (!isThisMonth) return;

        if (tx.type === 'income') monthIncome += amount;
        if (tx.type === 'expense') monthExpense += amount;
      });

      const [
        accountsCount,
        categoriesCount,
        budgetsCount,
        goalsCount,
        activeSubscriptionsCount,
      ] = await Promise.all([
        safeCount('accounts'),
        safeCount('categories'),
        safeCount('budgets'),
        safeCount('goals'),
        safeCount('recurring_payments', (query) => query.eq('is_active', true)),
      ]);

      setStats({
        balance,
        monthIncome,
        monthExpense,
        allIncome,
        allExpense,
        operationsCount: transactions.length,
        accountsCount,
        categoriesCount,
        budgetsCount,
        goalsCount,
        activeSubscriptionsCount,
      });
    } catch (error) {
      console.error('Ошибка загрузки профиля:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить профиль.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
  };

  const saveProfileName = async () => {
    if (!user?.id) return;

    const cleanName = displayName.trim();

    try {
      setSavingName(true);

      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: cleanName,
          name: cleanName,
          display_name: cleanName,
        },
      });

      if (error) throw error;

      setSavedName(cleanName);
      Alert.alert('Готово', 'Имя профиля обновлено.');
    } catch (error) {
      console.error('Ошибка сохранения имени:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить имя.');
    } finally {
      setSavingName(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!email) {
      Alert.alert('Ошибка', 'Email пользователя не найден.');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) throw error;

      Alert.alert('Готово', 'Письмо для смены пароля отправлено на email.');
    } catch (error) {
      console.error('Ошибка отправки письма:', error);
      Alert.alert('Ошибка', 'Не удалось отправить письмо для смены пароля.');
    }
  };

  const signOut = () => {
    Alert.alert('Выйти из аккаунта?', 'Текущая сессия будет завершена.', [
      {
        text: 'Отмена',
        style: 'cancel',
      },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();

          if (error) {
            Alert.alert('Ошибка', 'Не удалось выйти из аккаунта.');
          }
        },
      },
    ]);
  };

  const renderStatCard = (
    label: string,
    value: string | number,
    icon: IconName,
    tone: 'primary' | 'green' | 'red' = 'primary'
  ) => {
    const isGreen = tone === 'green';
    const isRed = tone === 'red';

    return (
      <View style={styles.statCard}>
        <View
          style={[
            styles.statIcon,
            isGreen && styles.statIconGreen,
            isRed && styles.statIconRed,
          ]}
        >
          <AppIcon
            name={icon}
            size={18}
            color={isGreen ? colors.mint : isRed ? colors.coral : colors.primary}
          />
        </View>

        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка профиля...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Профиль"
          subtitle="Аккаунт и настройки FinBuddy"
          icon="user"
          rightText="Выйти"
          onRightPress={signOut}
        />

        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>
              {savedName || 'Пользователь FinBuddy'}
            </Text>
            <Text style={styles.heroEmail}>{email || 'email не указан'}</Text>

            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {confirmedAt ? 'Email подтвержден' : 'Email не подтвержден'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.nameCard}>
          <Text style={styles.sectionTitle}>Данные профиля</Text>

          <Text style={styles.inputLabel}>Имя</Text>
          <View style={styles.nameRow}>
            <TextInput
              style={styles.nameInput}
              placeholder="Введите имя"
              placeholderTextColor={colors.inkMuted}
              value={displayName}
              onChangeText={setDisplayName}
              editable={!savingName}
            />

            <TouchableOpacity
              style={[
                styles.saveNameButton,
                savingName && styles.saveNameButtonDisabled,
              ]}
              onPress={saveProfileName}
              disabled={savingName}
            >
              {savingName ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <AppIcon name="edit" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Дата регистрации</Text>
            <Text style={styles.infoValue}>{formatDate(createdAt)}</Text>
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={sendPasswordReset}>
            <Text style={styles.resetButtonText}>Отправить письмо для смены пароля</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.financeCard}>
          <View style={styles.financeHeader}>
            <View>
              <Text style={styles.financeLabel}>Финансовый статус</Text>
              <Text style={styles.financeTitle}>{status.label}</Text>
            </View>

            <View style={styles.financeIcon}>
              <AppIcon name="chart" size={22} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.financeText}>{status.text}</Text>

          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Текущий баланс</Text>
            <Text style={styles.balanceValue}>{formatKzt(stats.balance)}</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {renderStatCard('Доходы месяца', formatKzt(stats.monthIncome), 'wallet', 'green')}
          {renderStatCard('Расходы месяца', formatKzt(stats.monthExpense), 'budget', 'red')}
          {renderStatCard('Операции', stats.operationsCount, 'history')}
          {renderStatCard('Счета', stats.accountsCount, 'wallet')}
          {renderStatCard('Категории', stats.categoriesCount, 'category')}
          {renderStatCard('Подписки', stats.activeSubscriptionsCount, 'sync')}
        </View>

        

        <View style={styles.systemCard}>
          <Text style={styles.sectionTitle}>Сводка системы</Text>

          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Бюджеты</Text>
            <Text style={styles.systemValue}>{stats.budgetsCount}</Text>
          </View>

          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Финансовые цели</Text>
            <Text style={styles.systemValue}>{stats.goalsCount}</Text>
          </View>

          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Доходы за все время</Text>
            <Text style={styles.systemValue}>{formatKzt(stats.allIncome)}</Text>
          </View>

          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Расходы за все время</Text>
            <Text style={styles.systemValue}>{formatKzt(stats.allExpense)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    padding: 20,
    paddingBottom: 36,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    ...shadow.elevated,
  },

  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
  },

  heroName: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
  },

  heroEmail: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },

  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  nameCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    ...shadow.soft,
  },

  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 14,
  },

  inputLabel: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  nameInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    paddingVertical: 13,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.border,
  },

  saveNameButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  saveNameButtonDisabled: {
    opacity: 0.7,
  },

  infoRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  infoLabel: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '800',
  },

  infoValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },

  resetButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },

  resetButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  financeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    ...shadow.soft,
  },

  financeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  financeLabel: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '800',
  },

  financeTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 3,
  },

  financeIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  financeText: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 12,
  },

  balanceBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 14,
  },

  balanceLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
  },

  balanceValue: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 2,
  },

  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    ...shadow.soft,
  },

  statIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  statIconGreen: {
    backgroundColor: colors.mintSoft,
  },

  statIconRed: {
    backgroundColor: colors.coralSoft,
  },

  statLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },

  statValue: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  actionsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    ...shadow.soft,
  },

  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 10,
  },

  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  actionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },

  actionSubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  actionArrow: {
    transform: [{ rotate: '180deg' }],
  },

  systemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    ...shadow.soft,
  },

  systemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  systemLabel: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },

  systemValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 12,
  },

  logoutButton: {
    backgroundColor: colors.coralSoft,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },

  logoutButtonText: {
    color: colors.coral,
    fontSize: 15,
    fontWeight: '900',
  },
});
