import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';
import { UniversalVoiceCommand, VoiceActionKind } from '../services/voiceCommandService';
import { chargeDueSubscriptions, normalizeSubscriptionDate } from '../services/subscriptionService';

type Category = {
  id: string;
  name: string | null;
  type: string | null;
};

type Account = {
  id: string;
  name: string | null;
};

type EditableVoiceAction = {
  localId: string;
  kind: VoiceActionKind;
  amountText: string;
  title: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryType: 'expense' | 'income';
  currentAmountText: string;
  deadline: string;
  accountId: string;
  startDate: string;
  nextPaymentDate: string;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const todayDateOnly = () => normalizeSubscriptionDate(new Date());

const normalize = (value: unknown) => {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
};

const getKindTitle = (kind: VoiceActionKind) => {
  if (kind === 'budget') return 'Лимит бюджета';
  if (kind === 'goal') return 'Финансовая цель';
  if (kind === 'account') return 'Счет';
  if (kind === 'subscription') return 'Подписка';
  return 'Категория';
};

const getKindIcon = (kind: VoiceActionKind) => {
  if (kind === 'budget') return 'budget';
  if (kind === 'goal') return 'target';
  if (kind === 'account') return 'wallet';
  if (kind === 'subscription') return 'sync';
  return 'category';
};

export default function VoiceActionReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuthStore();

  const command = route.params?.command as UniversalVoiceCommand | undefined;

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<EditableVoiceAction[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const expenseCategories = categories.filter((category) => category.type === 'expense');
  const incomeCategories = categories.filter((category) => category.type === 'income');

  const totalAmount = rows.reduce((sum, row) => {
    if (row.kind !== 'budget' && row.kind !== 'goal' && row.kind !== 'subscription') return sum;
    return sum + safeNumber(row.amountText);
  }, 0);

  useEffect(() => {
    loadDictionaries();
  }, [user?.id]);

  useEffect(() => {
    if (loading) return;
    if (rows.length > 0) return;

    const actions = command?.intent === 'review' ? command.actions : [];
    setRows(buildRows(actions || []));
  }, [loading, command, categories]);

  const loadDictionaries = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const [categoriesResult, accountsResult] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, type')
          .eq('user_id', user.id)
          .order('name', { ascending: true }),

        supabase
          .from('accounts')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (accountsResult.error) throw accountsResult.error;

      setCategories(((categoriesResult.data || []).filter(Boolean)) as Category[]);
      setAccounts(((accountsResult.data || []).filter(Boolean)) as Account[]);
    } catch (error) {
      console.error('Ошибка загрузки справочников:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить данные для проверки.');
    } finally {
      setLoading(false);
    }
  };

  const findCategoryId = (name: string | null | undefined, type: 'expense' | 'income') => {
    if (!name) return '';

    const source = type === 'income' ? incomeCategories : expenseCategories;
    const normalizedName = normalize(name);

    const exact = source.find((category) => normalize(category.name) === normalizedName);
    if (exact) return exact.id;

    const included = source.find((category) => {
      const categoryName = normalize(category.name);
      return (
        categoryName.includes(normalizedName) ||
        normalizedName.includes(categoryName)
      );
    });

    return included?.id || '';
  };

  const buildRows = (actions: any[]): EditableVoiceAction[] => {
    return actions.map((action, index) => {
      const kind = action.kind as VoiceActionKind;
      const categoryType = action.categoryType === 'income' ? 'income' : 'expense';
      const categoryName = action.categoryName || (kind === 'subscription' ? 'Подписки' : action.name || '');
      const firstAccountId = accounts[0]?.id || '';
      const actionDate = action.startDate || action.nextPaymentDate || todayDateOnly();

      return {
        localId: `voice-action-${index}-${Date.now()}`,
        kind,
        amountText: action.amount ? String(action.amount) : '',
        title: action.title || action.name || '',
        name: action.name || action.title || categoryName || '',
        categoryId: kind === 'budget' || kind === 'category' || kind === 'subscription'
          ? findCategoryId(categoryName, categoryType)
          : '',
        categoryName: categoryName || '',
        categoryType,
        currentAmountText: action.currentAmount ? String(action.currentAmount) : '0',
        deadline: action.deadline || '',
        accountId: firstAccountId,
        startDate: actionDate,
        nextPaymentDate: actionDate,
      };
    });
  };

  const updateRow = (localId: string, patch: Partial<EditableVoiceAction>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row;

        const nextRow = {
          ...row,
          ...patch,
        };

        if (patch.categoryType && row.kind === 'budget') {
          nextRow.categoryId = findCategoryId(nextRow.categoryName, 'expense');
        }

        return nextRow;
      })
    );
  };

  const addAction = (kind: VoiceActionKind) => {
    setRows((prev) => [
      ...prev,
      {
        localId: `voice-manual-${kind}-${Date.now()}`,
        kind,
        amountText: '',
        title: '',
        name: kind === 'subscription' ? 'Новая подписка' : '',
        categoryId: kind === 'subscription' ? findCategoryId('Подписки', 'expense') : '',
        categoryName: kind === 'subscription' ? 'Подписки' : '',
        categoryType: 'expense',
        currentAmountText: '0',
        deadline: '',
        accountId: accounts[0]?.id || '',
        startDate: todayDateOnly(),
        nextPaymentDate: todayDateOnly(),
      },
    ]);
  };

  const removeAction = (localId: string) => {
    if (rows.length <= 1) {
      Alert.alert('Нельзя удалить', 'Должно остаться хотя бы одно действие.');
      return;
    }

    setRows((prev) => prev.filter((row) => row.localId !== localId));
  };

  const createCategoryIfNeeded = async (
    name: string,
    type: 'expense' | 'income'
  ): Promise<string> => {
    const cleanName = name.trim();

    if (!cleanName) return '';

    const existingId = findCategoryId(cleanName, type);
    if (existingId) return existingId;

    if (!user?.id) return '';

    const { data, error } = await supabase
      .from('categories')
      .insert({
        user_id: user.id,
        name: cleanName,
        type,
      })
      .select('id')
      .single();

    if (error) throw error;

    return data?.id || '';
  };

  const saveBudget = async (row: EditableVoiceAction) => {
    if (!user?.id) return;

    const amount = safeNumber(row.amountText);

    if (amount <= 0) {
      throw new Error('Введите сумму лимита.');
    }

    let categoryId = row.categoryId;

    if (!categoryId) {
      categoryId = await createCategoryIfNeeded(row.categoryName, 'expense');
    }

    if (!categoryId) {
      throw new Error('Выберите или введите категорию для лимита.');
    }

    const existing = await supabase
      .from('budgets')
      .select('id')
      .eq('user_id', user.id)
      .eq('category_id', categoryId)
      .maybeSingle();

    if (existing.error) throw existing.error;

    if (existing.data?.id) {
      const { error } = await supabase
        .from('budgets')
        .update({
          limit_amount: amount,
          period: 'monthly',
        })
        .eq('id', existing.data.id)
        .eq('user_id', user.id);

      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('budgets').insert({
      user_id: user.id,
      category_id: categoryId,
      limit_amount: amount,
      period: 'monthly',
    });

    if (error) throw error;
  };

  const saveGoal = async (row: EditableVoiceAction) => {
    if (!user?.id) return;

    const title = row.title.trim() || row.name.trim();
    const targetAmount = safeNumber(row.amountText);
    const currentAmount = safeNumber(row.currentAmountText);

    if (!title) {
      throw new Error('Введите название цели.');
    }

    if (targetAmount <= 0) {
      throw new Error('Введите сумму цели.');
    }

    const { error } = await supabase.from('goals').insert({
      user_id: user.id,
      title,
      target_amount: targetAmount,
      current_amount: currentAmount,
      deadline: row.deadline.trim() || null,
    });

    if (error) throw error;
  };

  const saveAccount = async (row: EditableVoiceAction) => {
    if (!user?.id) return;

    const name = row.name.trim() || row.title.trim();

    if (!name) {
      throw new Error('Введите название счета.');
    }

    const { error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name,
    });

    if (error) throw error;
  };

  const saveCategory = async (row: EditableVoiceAction) => {
    if (!user?.id) return;

    const name = row.name.trim() || row.categoryName.trim();

    if (!name) {
      throw new Error('Введите название категории.');
    }

    const { error } = await supabase.from('categories').insert({
      user_id: user.id,
      name,
      type: row.categoryType,
    });

    if (error) throw error;
  };


  const saveSubscription = async (row: EditableVoiceAction) => {
    if (!user?.id) return;

    const name = row.title.trim() || row.name.trim();
    const amount = safeNumber(row.amountText);

    if (!name) {
      throw new Error('Введите название подписки.');
    }

    if (amount <= 0) {
      throw new Error('Введите сумму подписки.');
    }

    if (!row.accountId) {
      throw new Error('Выберите счет списания для подписки.');
    }

    let categoryId = row.categoryId;

    if (!categoryId) {
      categoryId = await createCategoryIfNeeded(row.categoryName || 'Подписки', 'expense');
    }

    if (!categoryId) {
      throw new Error('Выберите категорию подписки.');
    }

    const date = row.startDate || todayDateOnly();

    const { error } = await supabase.from('recurring_payments').insert({
      user_id: user.id,
      title: name,
      amount,
      account_id: row.accountId,
      category_id: categoryId,
      start_date: date,
      next_payment_date: row.nextPaymentDate || date,
      frequency: 'monthly',
      is_active: true,
    });

    if (error) throw error;

    await chargeDueSubscriptions(user.id);
  };

  const saveAll = async () => {
    if (!user?.id) return;

    if (rows.length === 0) {
      Alert.alert('Нет данных', 'Нет действий для сохранения.');
      return;
    }

    try {
      setSaving(true);

      for (const row of rows) {
        if (row.kind === 'budget') await saveBudget(row);
        if (row.kind === 'goal') await saveGoal(row);
        if (row.kind === 'account') await saveAccount(row);
        if (row.kind === 'category') await saveCategory(row);
        if (row.kind === 'subscription') await saveSubscription(row);
      }

      Alert.alert('Готово', 'Голосовая команда выполнена.', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Root'),
        },
      ]);
    } catch (error: any) {
      console.error('Ошибка сохранения голосовой команды:', error);
      Alert.alert('Ошибка', error?.message || 'Не удалось сохранить действие.');
    } finally {
      setSaving(false);
    }
  };

  const renderKindSwitch = (row: EditableVoiceAction) => {
    const kinds: VoiceActionKind[] = ['budget', 'goal', 'subscription', 'account', 'category'];

    return (
      <View style={styles.kindSwitch}>
        {kinds.map((kind) => {
          const isActive = row.kind === kind;

          return (
            <TouchableOpacity
              key={`${row.localId}-${kind}`}
              style={[styles.kindOption, isActive && styles.kindOptionActive]}
              onPress={() => updateRow(row.localId, { kind })}
              activeOpacity={0.86}
            >
              <Text style={[styles.kindText, isActive && styles.kindTextActive]}>
                {getKindTitle(kind)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };


  const renderAccountPicker = (row: EditableVoiceAction) => {
    return (
      <>
        <Text style={styles.inputLabel}>Счет списания</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
          {accounts.map((account) => {
            const isActive = row.accountId === account.id;

            return (
              <TouchableOpacity
                key={`${row.localId}-${account.id}`}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => updateRow(row.localId, { accountId: account.id })}
                activeOpacity={0.86}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {account.name || 'Счет'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </>
    );
  };

  const renderCategoryPicker = (row: EditableVoiceAction) => {
    const source = row.categoryType === 'income' ? incomeCategories : expenseCategories;

    return (
      <>
        <Text style={styles.inputLabel}>Категория</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pickerRow}
        >
          {source.map((category) => {
            const isActive = row.categoryId === category.id;

            return (
              <TouchableOpacity
                key={`${row.localId}-${category.id}`}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() =>
                  updateRow(row.localId, {
                    categoryId: category.id,
                    categoryName: category.name || '',
                  })
                }
                activeOpacity={0.86}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {category.name || 'Категория'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.inputLabel}>
          {row.categoryId ? 'Категория из голоса / новая категория' : 'Новая категория'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Например: Продукты"
          placeholderTextColor={colors.inkMuted}
          value={row.categoryName}
          onChangeText={(value) => updateRow(row.localId, { categoryName: value })}
        />
      </>
    );
  };

  const renderCategoryTypeSwitch = (row: EditableVoiceAction) => {
    return (
      <View style={styles.typeSwitch}>
        <TouchableOpacity
          style={[
            styles.typeOption,
            row.categoryType === 'expense' && styles.typeOptionActive,
          ]}
          onPress={() => updateRow(row.localId, { categoryType: 'expense' })}
        >
          <Text
            style={[
              styles.typeText,
              row.categoryType === 'expense' && styles.typeTextActive,
            ]}
          >
            Расход
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeOption,
            row.categoryType === 'income' && styles.typeOptionActive,
          ]}
          onPress={() => updateRow(row.localId, { categoryType: 'income' })}
        >
          <Text
            style={[
              styles.typeText,
              row.categoryType === 'income' && styles.typeTextActive,
            ]}
          >
            Доход
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderRowFields = (row: EditableVoiceAction) => {
    if (row.kind === 'budget') {
      return (
        <>
          <Text style={styles.inputLabel}>Сумма лимита</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0"
            placeholderTextColor={colors.inkMuted}
            keyboardType="numeric"
            value={row.amountText}
            onChangeText={(value) => updateRow(row.localId, { amountText: value })}
          />

          {renderCategoryPicker(row)}
        </>
      );
    }

    if (row.kind === 'goal') {
      return (
        <>
          <Text style={styles.inputLabel}>Название цели</Text>
          <TextInput
            style={styles.input}
            placeholder="Например: Айфон"
            placeholderTextColor={colors.inkMuted}
            value={row.title}
            onChangeText={(value) => updateRow(row.localId, { title: value })}
          />

          <Text style={styles.inputLabel}>Сумма цели</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0"
            placeholderTextColor={colors.inkMuted}
            keyboardType="numeric"
            value={row.amountText}
            onChangeText={(value) => updateRow(row.localId, { amountText: value })}
          />

          <Text style={styles.inputLabel}>Уже накоплено</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={colors.inkMuted}
            keyboardType="numeric"
            value={row.currentAmountText}
            onChangeText={(value) => updateRow(row.localId, { currentAmountText: value })}
          />

          <Text style={styles.inputLabel}>Дедлайн</Text>
          <TextInput
            style={styles.input}
            placeholder="2026-12-31"
            placeholderTextColor={colors.inkMuted}
            value={row.deadline}
            onChangeText={(value) => updateRow(row.localId, { deadline: value })}
          />
        </>
      );
    }

    if (row.kind === 'account') {
      return (
        <>
          <Text style={styles.inputLabel}>Название счета</Text>
          <TextInput
            style={styles.input}
            placeholder="Например: Kaspi"
            placeholderTextColor={colors.inkMuted}
            value={row.name}
            onChangeText={(value) => updateRow(row.localId, { name: value })}
          />
        </>
      );
    }

    return (
      <>
        {renderCategoryTypeSwitch(row)}

        <Text style={styles.inputLabel}>Название категории</Text>
        <TextInput
          style={styles.input}
          placeholder="Например: Кофе"
          placeholderTextColor={colors.inkMuted}
          value={row.name}
          onChangeText={(value) => updateRow(row.localId, { name: value })}
        />
      </>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка голосовой команды...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Голосовая команда"
          subtitle="Проверьте действие перед сохранением"
          back
          icon="mic"
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Распознано действий</Text>
          <Text style={styles.heroValue}>{rows.length}</Text>
          <Text style={styles.heroText}>
            {totalAmount > 0
              ? `Общая сумма: ${formatKzt(totalAmount)}`
              : 'Можно редактировать перед сохранением'}
          </Text>
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Команда не распознана</Text>
            <Text style={styles.emptyText}>
              Добавьте нужное действие вручную ниже или повторите голосовой ввод.
            </Text>
          </View>
        ) : (
          rows.map((row, index) => (
            <View key={row.localId} style={styles.actionCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIcon}>
                  <AppIcon
                    name={getKindIcon(row.kind)}
                    size={22}
                    color={colors.primary}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Действие {index + 1}</Text>
                  <Text style={styles.cardSubtitle}>{getKindTitle(row.kind)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => removeAction(row.localId)}
                  activeOpacity={0.86}
                >
                  <AppIcon name="delete" size={17} color={colors.coral} />
                </TouchableOpacity>
              </View>

              {renderKindSwitch(row)}
              {renderRowFields(row)}
            </View>
          ))
        )}

        <View style={styles.addActionsCard}>
          <Text style={styles.addTitle}>Добавить действие</Text>

          <View style={styles.addGrid}>
            <TouchableOpacity style={styles.addButton} onPress={() => addAction('budget')}>
              <AppIcon name="budget" size={18} color={colors.primary} />
              <Text style={styles.addButtonText}>Лимит</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addButton} onPress={() => addAction('goal')}>
              <AppIcon name="target" size={18} color={colors.primary} />
              <Text style={styles.addButtonText}>Цель</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addButton} onPress={() => addAction('subscription')}>
              <AppIcon name="sync" size={18} color={colors.primary} />
              <Text style={styles.addButtonText}>Подписка</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addButton} onPress={() => addAction('account')}>
              <AppIcon name="wallet" size={18} color={colors.primary} />
              <Text style={styles.addButtonText}>Счет</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addButton} onPress={() => addAction('category')}>
              <AppIcon name="category" size={18} color={colors.primary} />
              <Text style={styles.addButtonText}>Категория</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveAll}
          disabled={saving}
          activeOpacity={0.86}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>Выполнить команду</Text>
          )}
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
    marginTop: 12,
    color: colors.inkMuted,
    fontSize: 14,
  },

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 22,
    marginBottom: 14,
    ...shadow.elevated,
  },

  heroLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '800',
  },

  heroValue: {
    color: '#FFF',
    fontSize: 40,
    fontWeight: '900',
    marginTop: 8,
  },

  heroText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 12,
    ...shadow.soft,
  },

  emptyTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 7,
  },

  emptyText: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },

  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  cardTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  cardSubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  kindSwitch: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 5,
    marginBottom: 14,
  },

  kindOption: {
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 10,
    marginBottom: 4,
  },

  kindOptionActive: {
    backgroundColor: colors.primary,
  },

  kindText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },

  kindTextActive: {
    color: '#FFFFFF',
  },

  typeSwitch: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 5,
    flexDirection: 'row',
    marginBottom: 14,
  },

  typeOption: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },

  typeOptionActive: {
    backgroundColor: colors.primary,
  },

  typeText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },

  typeTextActive: {
    color: '#FFFFFF',
  },

  inputLabel: {
    fontSize: 13,
    color: colors.inkMuted,
    fontWeight: '900',
    marginBottom: 8,
  },

  amountInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 26,
    color: colors.ink,
    fontWeight: '900',
    marginBottom: 16,
  },

  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 16,
  },

  pickerRow: {
    marginBottom: 16,
  },

  chip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },

  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  chipText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '900',
  },

  chipTextActive: {
    color: '#FFF',
  },

  addActionsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    ...shadow.soft,
  },

  addTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },

  addGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  addButton: {
    width: '48%',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },

  addButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 7,
  },

  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.soft,
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
