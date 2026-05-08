import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import {
  chargeDueSubscriptions,
  chargeSubscriptionNow,
  normalizeSubscriptionDate,
  daysBetweenToday,
  SubscriptionRow,
} from '../services/subscriptionService';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';

type Account = {
  id: string;
  name: string | null;
};

type Category = {
  id: string;
  name: string | null;
  type: string | null;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const todayDateOnly = () => normalizeSubscriptionDate(new Date());

const nextMonthDateOnly = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return normalizeSubscriptionDate(date);
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'не указана';

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('ru-KZ', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const getDateStatus = (value: string | null | undefined) => {
  const days = daysBetweenToday(value);

  if (days === null) return 'Дата не указана';
  if (days < 0) return 'Просрочено';
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Завтра';
  return `Через ${days} дн.`;
};

export default function RecurringPaymentsScreen() {
  // ФИКС: не используем useWindowDimensions, потому что у тебя вылетел ReferenceError.
  // Dimensions стабильно доступен в react-native.
  const screenWidth = Dimensions.get('window').width;
  const isWide = screenWidth >= 430;

  const { user } = useAuthStore();

  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState(todayDateOnly());
  const [nextPaymentDate, setNextPaymentDate] = useState(todayDateOnly());
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      initialLoad();
    }, [user?.id])
  );

  const expenseCategories = categories.filter((category) => category.type === 'expense');

  const monthlyTotal = useMemo(() => {
    return subscriptions
      .filter((item) => item.is_active !== false)
      .reduce((sum, item) => sum + safeNumber(item.amount), 0);
  }, [subscriptions]);

  const activeCount = subscriptions.filter((item) => item.is_active !== false).length;

  const dueTodayCount = subscriptions.filter((item) => {
    const days = daysBetweenToday(item.next_payment_date);
    return item.is_active !== false && days !== null && days <= 0;
  }).length;

  const initialLoad = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      await chargeDueSubscriptions(user.id);
      await loadData();
    } catch (error) {
      console.error('Ошибка автосписания подписок:', error);
      await loadData();
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [subscriptionsResult, accountsResult, categoriesResult] = await Promise.all([
        supabase
          .from('recurring_payments')
          .select(
            'id, user_id, title, amount, account_id, category_id, next_payment_date, start_date, frequency, is_active, note, created_at'
          )
          .eq('user_id', user.id)
          .order('next_payment_date', { ascending: true }),

        supabase
          .from('accounts')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),

        supabase
          .from('categories')
          .select('id, name, type')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .order('name', { ascending: true }),
      ]);

      if (subscriptionsResult.error) throw subscriptionsResult.error;
      if (accountsResult.error) throw accountsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      const loadedSubscriptions = ((subscriptionsResult.data || []).filter(Boolean)) as SubscriptionRow[];
      const loadedAccounts = ((accountsResult.data || []).filter(Boolean)) as Account[];
      const loadedCategories = ((categoriesResult.data || []).filter(Boolean)) as Category[];

      setSubscriptions(loadedSubscriptions);
      setAccounts(loadedAccounts);
      setCategories(loadedCategories);

      setAccountId((prev) => prev || loadedAccounts[0]?.id || '');
      setCategoryId((prev) => prev || loadedCategories[0]?.id || '');
    } catch (error) {
      console.error('Ошибка загрузки подписок:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить подписки.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!user?.id) return;

    try {
      setRefreshing(true);
      await chargeDueSubscriptions(user.id);
      await loadData();
    } catch (error) {
      console.error('Ошибка обновления подписок:', error);
      Alert.alert('Ошибка', 'Не удалось обновить подписки.');
      setRefreshing(false);
    }
  };

  const openCreateModal = () => {
    if (accounts.length === 0) {
      Alert.alert('Нет счетов', 'Сначала создайте счет в разделе “Счета”.');
      return;
    }

    if (expenseCategories.length === 0) {
      Alert.alert('Нет категорий', 'Сначала создайте категорию расхода.');
      return;
    }

    const subscriptionCategory =
      expenseCategories.find((item) => item.name?.toLowerCase().includes('подпис')) ||
      expenseCategories[0];

    setEditingId(null);
    setTitle('');
    setAmount('');
    setAccountId(accounts[0]?.id || '');
    setCategoryId(subscriptionCategory?.id || '');
    setStartDate(todayDateOnly());
    setNextPaymentDate(todayDateOnly());
    setModalVisible(true);
  };

  const openEditModal = (subscription: SubscriptionRow) => {
    setEditingId(subscription.id);
    setTitle(subscription.title || '');
    setAmount(String(Math.round(safeNumber(subscription.amount))));
    setAccountId(subscription.account_id || accounts[0]?.id || '');
    setCategoryId(subscription.category_id || expenseCategories[0]?.id || '');
    setStartDate(subscription.start_date || subscription.next_payment_date || todayDateOnly());
    setNextPaymentDate(subscription.next_payment_date || todayDateOnly());
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalVisible(false);
    setEditingId(null);
  };

  const saveSubscription = async () => {
    if (!user?.id) return;

    const amountValue = safeNumber(amount);

    if (!title.trim()) {
      Alert.alert('Проверьте данные', 'Введите название подписки.');
      return;
    }

    if (amountValue <= 0) {
      Alert.alert('Проверьте данные', 'Введите сумму подписки.');
      return;
    }

    if (!accountId) {
      Alert.alert('Проверьте данные', 'Выберите счет списания.');
      return;
    }

    if (!categoryId) {
      Alert.alert('Проверьте данные', 'Выберите категорию расхода.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        user_id: user.id,
        title: title.trim(),
        amount: amountValue,
        account_id: accountId,
        category_id: categoryId,
        start_date: startDate || todayDateOnly(),
        next_payment_date: nextPaymentDate || startDate || todayDateOnly(),
        frequency: 'monthly',
        is_active: true,
      };

      if (editingId) {
        const { error } = await supabase
          .from('recurring_payments')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('recurring_payments').insert(payload);
        if (error) throw error;
      }

      closeModal();
      await chargeDueSubscriptions(user.id);
      await loadData();
    } catch (error) {
      console.error('Ошибка сохранения подписки:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить подписку.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSubscription = async (subscription: SubscriptionRow) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('recurring_payments')
        .update({ is_active: subscription.is_active === false })
        .eq('id', subscription.id)
        .eq('user_id', user.id);

      if (error) throw error;

      await loadData();
    } catch (error) {
      console.error('Ошибка изменения статуса подписки:', error);
      Alert.alert('Ошибка', 'Не удалось изменить статус подписки.');
    }
  };

  const deleteSubscription = (subscriptionId: string) => {
    Alert.alert('Удалить подписку?', 'Будущие автосписания по ней остановятся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) return;

          try {
            const { error } = await supabase
              .from('recurring_payments')
              .delete()
              .eq('id', subscriptionId)
              .eq('user_id', user.id);

            if (error) throw error;

            await loadData();
          } catch (error) {
            console.error('Ошибка удаления подписки:', error);
            Alert.alert('Ошибка', 'Не удалось удалить подписку.');
          }
        },
      },
    ]);
  };

  const chargeNow = async (subscription: SubscriptionRow) => {
    if (!user?.id) return;

    try {
      setSyncing(true);

      const result = await chargeSubscriptionNow(user.id, subscription);
      await loadData();

      Alert.alert(
        'Готово',
        result.created
          ? 'Операция по подписке создана.'
          : 'Операция за этот месяц уже была создана.'
      );
    } catch (error) {
      console.error('Ошибка списания подписки:', error);
      Alert.alert('Ошибка', 'Не удалось создать операцию по подписке.');
    } finally {
      setSyncing(false);
    }
  };

  const getAccountName = (id?: string | null) => {
    return accounts.find((item) => item.id === id)?.name || 'Счет';
  };

  const getCategoryName = (id?: string | null) => {
    return categories.find((item) => item.id === id)?.name || 'Категория';
  };

  const runSync = async () => {
    if (!user?.id) return;

    try {
      setSyncing(true);

      const result = await chargeDueSubscriptions(user.id);
      await loadData();

      Alert.alert(
        'Проверка завершена',
        result.createdCount > 0
          ? `Создано операций: ${result.createdCount}`
          : 'Новых списаний нет.'
      );
    } catch (error) {
      console.error('Ошибка проверки подписок:', error);
      Alert.alert('Ошибка', 'Не удалось проверить подписки.');
    } finally {
      setSyncing(false);
    }
  };

  const renderSubscription = (subscription: SubscriptionRow) => {
    const isActive = subscription.is_active !== false;
    const status = getDateStatus(subscription.next_payment_date);
    const dueDays = daysBetweenToday(subscription.next_payment_date);
    const isUrgent = isActive && dueDays !== null && dueDays <= 1;

    return (
      <View
        key={subscription.id}
        style={[
          styles.subscriptionCard,
          isWide && styles.subscriptionCardWide,
          !isActive && styles.subscriptionCardDisabled,
          isUrgent && styles.subscriptionCardUrgent,
        ]}
      >
        <View style={styles.subscriptionHeader}>
          <View style={[styles.iconBox, !isActive && styles.iconBoxDisabled]}>
            <AppIcon
              name="sync"
              size={22}
              color={isActive ? colors.primary : colors.inkMuted}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.subscriptionTitle} numberOfLines={1}>
              {subscription.title || 'Подписка'}
            </Text>
            <Text style={styles.subscriptionMeta} numberOfLines={1}>
              {getAccountName(subscription.account_id)} · {getCategoryName(subscription.category_id)}
            </Text>
          </View>

          <Text style={styles.subscriptionAmount}>
            {formatKzt(safeNumber(subscription.amount))}
          </Text>
        </View>

        <View style={styles.dateRow}>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>Следующее списание</Text>
            <Text style={styles.dateValue}>{formatDate(subscription.next_payment_date)}</Text>
          </View>

          <View style={[styles.statusChip, isUrgent && styles.statusChipUrgent]}>
            <Text style={[styles.statusText, isUrgent && styles.statusTextUrgent]}>
              {status}
            </Text>
          </View>
        </View>

        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openEditModal(subscription)}
          >
            <Text style={styles.actionButtonText}>Изменить</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => toggleSubscription(subscription)}
          >
            <Text style={styles.actionButtonText}>{isActive ? 'Пауза' : 'Включить'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => chargeNow(subscription)}
            disabled={syncing || !isActive}
          >
            <Text style={styles.actionButtonText}>Списать</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteAction]}
            onPress={() => deleteSubscription(subscription.id)}
          >
            <Text style={styles.deleteActionText}>Удалить</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка подписок...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScreenHeader
          title="Подписки"
          subtitle="Ежемесячные автосписания"
          back
          icon="sync"
          rightText="+ Подписка"
          onRightPress={openCreateModal}
        />

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Ежемесячно</Text>
              <Text style={styles.heroAmount}>{formatKzt(monthlyTotal)}</Text>
            </View>

            <View style={styles.heroIconBox}>
              <AppIcon name="sync" size={28} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{activeCount}</Text>
              <Text style={styles.heroStatLabel}>активных</Text>
            </View>

            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{dueTodayCount}</Text>
              <Text style={styles.heroStatLabel}>к списанию</Text>
            </View>

            <TouchableOpacity style={styles.syncButton} onPress={runSync} disabled={syncing}>
              {syncing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.syncButtonText}>Проверить</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Механика подписок</Text>
          <Text style={styles.infoText}>
            Создай подписку один раз. Когда наступит дата списания, FinBuddy создаст расходную операцию и перенесет дату на следующий месяц.
          </Text>
        </View>

        {subscriptions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Подписок пока нет</Text>
            <Text style={styles.emptyText}>
              Добавь Netflix, Spotify, связь, интернет или другую ежемесячную оплату.
            </Text>

            <TouchableOpacity style={styles.emptyButton} onPress={openCreateModal}>
              <Text style={styles.emptyButtonText}>Создать подписку</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.cardsWrap, isWide && styles.cardsWrapWide]}>
            {subscriptions.map(renderSubscription)}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, isWide && styles.modalCardWide]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingId ? 'Изменить подписку' : 'Новая подписка'}
                </Text>

                <TouchableOpacity onPress={closeModal} disabled={saving}>
                  <Text style={styles.modalClose}>×</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Название</Text>
              <TextInput
                style={styles.input}
                placeholder="Например: Netflix"
                placeholderTextColor={colors.inkMuted}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.inputLabel}>Сумма в месяц</Text>
              <TextInput
                style={styles.input}
                placeholder="Например: 3990"
                placeholderTextColor={colors.inkMuted}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={styles.inputLabel}>Счет списания</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
                {accounts.map((account) => {
                  const isActive = accountId === account.id;

                  return (
                    <TouchableOpacity
                      key={account.id}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => setAccountId(account.id)}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {account.name || 'Счет'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.inputLabel}>Категория</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
                {expenseCategories.map((category) => {
                  const isActive = categoryId === category.id;

                  return (
                    <TouchableOpacity
                      key={category.id}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => setCategoryId(category.id)}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {category.name || 'Категория'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.inputLabel}>Дата первого списания</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-05-14"
                placeholderTextColor={colors.inkMuted}
                value={startDate}
                onChangeText={(value) => {
                  setStartDate(value);
                  setNextPaymentDate(value);
                }}
              />

              <Text style={styles.helpText}>
                Формат даты: YYYY-MM-DD. Если поставить сегодняшнюю или прошедшую дату, операция создастся сразу после сохранения.
              </Text>

              <TouchableOpacity
                style={styles.quickDateButton}
                onPress={() => {
                  setStartDate(todayDateOnly());
                  setNextPaymentDate(todayDateOnly());
                }}
              >
                <Text style={styles.quickDateText}>Списать сегодня</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickDateButton}
                onPress={() => {
                  setStartDate(nextMonthDateOnly());
                  setNextPaymentDate(nextMonthDateOnly());
                }}
              >
                <Text style={styles.quickDateText}>Первое списание через месяц</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={saveSubscription}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingId ? 'Сохранить' : 'Создать подписку'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 36 },
  contentWide: { maxWidth: 760, alignSelf: 'center', width: '100%' },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: colors.inkMuted, fontSize: 14 },

  heroCard: { backgroundColor: colors.dark, borderRadius: radius.xxl, padding: 22, marginBottom: 14, ...shadow.elevated },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '800' },
  heroAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', marginTop: 8 },
  heroIconBox: { width: 60, height: 60, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  heroStats: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  heroStat: { marginRight: 18 },
  heroStatValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  heroStatLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', marginTop: 2 },
  syncButton: { marginLeft: 'auto', backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, minWidth: 92, alignItems: 'center' },
  syncButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },

  infoCard: { backgroundColor: colors.primarySoft, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  infoTitle: { color: colors.primaryDark, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  infoText: { color: colors.primaryDark, fontSize: 13, lineHeight: 19, fontWeight: '700' },

  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', ...shadow.soft },
  emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: '900', marginBottom: 7 },
  emptyText: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 14 },
  emptyButton: { backgroundColor: colors.dark, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },

  cardsWrap: {},
  cardsWrapWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  subscriptionCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12, ...shadow.soft },
  subscriptionCardWide: { width: '48.8%' },
  subscriptionCardDisabled: { opacity: 0.62 },
  subscriptionCardUrgent: { borderColor: colors.coral },
  subscriptionHeader: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconBoxDisabled: { backgroundColor: colors.surfaceAlt },
  subscriptionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  subscriptionMeta: { color: colors.inkMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  subscriptionAmount: { color: colors.coral, fontSize: 15, fontWeight: '900', marginLeft: 8 },

  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  dateBox: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12 },
  dateLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' },
  dateValue: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: 3 },
  statusChip: { marginLeft: 8, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  statusChipUrgent: { backgroundColor: colors.coralSoft },
  statusText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  statusTextUrgent: { color: colors.coral },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, justifyContent: 'space-between' },
  actionButton: { width: '48%', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  actionButtonText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  deleteAction: { backgroundColor: colors.coralSoft },
  deleteActionText: { color: colors.coral, fontSize: 12, fontWeight: '900' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(18, 24, 38, 0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 22, maxHeight: '92%' },
  modalCardWide: { maxWidth: 620, width: '100%', alignSelf: 'center', borderRadius: radius.xl, marginBottom: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  modalTitle: { flex: 1, color: colors.ink, fontSize: 22, fontWeight: '900' },
  modalClose: { color: colors.inkMuted, fontSize: 28 },
  inputLabel: { color: colors.inkMuted, fontSize: 13, fontWeight: '900', marginBottom: 8 },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, marginBottom: 14 },
  pickerRow: { marginBottom: 14 },
  chip: { backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.inkMuted, fontSize: 13, fontWeight: '900' },
  chipTextActive: { color: '#FFFFFF' },
  helpText: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: -6, marginBottom: 12 },
  quickDateButton: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  quickDateText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
