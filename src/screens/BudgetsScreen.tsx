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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';

type Category = {
  id: string;
  name: string | null;
  type: string | null;
};

type Budget = {
  id: string;
  category_id: string | null;
  limit_amount: number | string | null;
  period: string | null;
};

type BudgetView = {
  id: string;
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  spentAmount: number;
  percent: number;
  remainingAmount: number;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getCategoryName = (categoryId: string, categories: Category[]) => {
  const found = categories.find((item) => item.id === categoryId);
  return found?.name || 'Категория';
};

export default function BudgetsScreen() {
  const { user } = useAuthStore();

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [spentByCategory, setSpentByCategory] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [limitAmount, setLimitAmount] = useState('');
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user?.id])
  );

  const monthRange = () => {
    const now = new Date();

    return {
      startIso: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      endIso: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  };

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { startIso, endIso } = monthRange();

      const [budgetsResult, categoriesResult, txResult] = await Promise.all([
        // ВАЖНО:
        // Здесь нельзя писать categories(id, name, type), потому что в твоей БД
        // нет Foreign Key между budgets.category_id и categories.id.
        // Поэтому бюджеты и категории загружаются отдельными запросами.
        supabase
          .from('budgets')
          .select('id, category_id, limit_amount, period')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('categories')
          .select('id, name, type')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .order('name', { ascending: true }),

        supabase
          .from('transactions')
          .select('category_id, amount, type, transaction_date')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .gte('transaction_date', startIso)
          .lt('transaction_date', endIso),
      ]);

      if (budgetsResult.error) throw budgetsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (txResult.error) throw txResult.error;

      const grouped: Record<string, number> = {};

      (txResult.data || []).forEach((tx: any) => {
        if (!tx?.category_id) return;

        grouped[tx.category_id] =
          (grouped[tx.category_id] || 0) + safeNumber(tx.amount);
      });

      const loadedBudgets = ((budgetsResult.data || []).filter(Boolean)) as Budget[];
      const loadedCategories = ((categoriesResult.data || []).filter(Boolean)) as Category[];

      setBudgets(loadedBudgets);
      setCategories(loadedCategories);
      setSpentByCategory(grouped);

      if (!selectedCategoryId && loadedCategories.length > 0) {
        setSelectedCategoryId(loadedCategories[0].id);
      }
    } catch (error) {
      console.error('Ошибка загрузки бюджетов:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить бюджеты.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const budgetViews = useMemo<BudgetView[]>(() => {
    return budgets
      .filter(Boolean)
      .map((budget) => {
        const categoryId = String(budget.category_id || '');
        const limitAmountValue = safeNumber(budget.limit_amount);
        const spentAmount = spentByCategory[categoryId] || 0;
        const percent =
          limitAmountValue > 0
            ? Math.round((spentAmount / limitAmountValue) * 100)
            : 0;

        return {
          id: budget.id,
          categoryId,
          categoryName: getCategoryName(categoryId, categories),
          limitAmount: limitAmountValue,
          spentAmount,
          percent,
          remainingAmount: Math.max(limitAmountValue - spentAmount, 0),
        };
      })
      .sort((a, b) => b.percent - a.percent);
  }, [budgets, categories, spentByCategory]);

  const totalLimit = budgetViews.reduce((sum, item) => sum + item.limitAmount, 0);
  const totalSpent = budgetViews.reduce((sum, item) => sum + item.spentAmount, 0);
  const totalPercent =
    totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const openCreateModal = () => {
    if (categories.length === 0) {
      Alert.alert(
        'Нет категорий',
        'Сначала создайте категории расходов в разделе “Категории”.'
      );
      return;
    }

    setEditingBudgetId(null);
    setSelectedCategoryId(categories[0]?.id || '');
    setLimitAmount('');
    setModalVisible(true);
  };

  const openEditModal = (budget: BudgetView) => {
    setEditingBudgetId(budget.id);
    setSelectedCategoryId(budget.categoryId || categories[0]?.id || '');
    setLimitAmount(String(Math.round(budget.limitAmount)));
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalVisible(false);
    setEditingBudgetId(null);
    setSelectedCategoryId('');
    setLimitAmount('');
  };

  const saveBudget = async () => {
    if (!user?.id) return;

    const amount = safeNumber(limitAmount);

    if (!selectedCategoryId) {
      Alert.alert('Проверьте данные', 'Выберите категорию.');
      return;
    }

    if (amount <= 0) {
      Alert.alert('Проверьте данные', 'Введите сумму лимита.');
      return;
    }

    try {
      setSaving(true);

      if (editingBudgetId) {
        const { error } = await supabase
          .from('budgets')
          .update({
            category_id: selectedCategoryId,
            limit_amount: amount,
            period: 'monthly',
          })
          .eq('id', editingBudgetId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('budgets').insert({
          user_id: user.id,
          category_id: selectedCategoryId,
          limit_amount: amount,
          period: 'monthly',
        });

        if (error) throw error;
      }

      closeModal();
      await loadData();
    } catch (error) {
      console.error('Ошибка сохранения бюджета:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить бюджет.');
    } finally {
      setSaving(false);
    }
  };

  const deleteBudget = (budgetId: string) => {
    Alert.alert('Удалить бюджет?', 'Лимит по категории будет удален.', [
      {
        text: 'Отмена',
        style: 'cancel',
      },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) return;

          try {
            const { error } = await supabase
              .from('budgets')
              .delete()
              .eq('id', budgetId)
              .eq('user_id', user.id);

            if (error) throw error;

            await loadData();
          } catch (error) {
            console.error('Ошибка удаления бюджета:', error);
            Alert.alert('Ошибка', 'Не удалось удалить бюджет.');
          }
        },
      },
    ]);
  };

  const getStatus = (percent: number) => {
    if (percent >= 100) {
      return {
        text: 'Превышен',
        color: colors.coral,
        bg: colors.coralSoft,
      };
    }

    if (percent >= 80) {
      return {
        text: 'Почти лимит',
        color: colors.amber,
        bg: colors.amberSoft,
      };
    }

    return {
      text: 'Норма',
      color: colors.mint,
      bg: colors.mintSoft,
    };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка бюджетов...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScreenHeader
          title="Бюджет"
          subtitle="Лимиты по категориям"
          rightText="+ Лимит"
          onRightPress={openCreateModal}
          icon="budget"
        />

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>Использовано</Text>
            <Text style={styles.heroPercent}>{totalPercent}%</Text>
          </View>

          <View style={styles.heroProgress}>
            <View
              style={[
                styles.heroProgressFill,
                {
                  width: `${Math.min(totalPercent, 100)}%`,
                },
              ]}
            />
          </View>

          <Text style={styles.heroText}>
            {formatKzt(totalSpent)} из {formatKzt(totalLimit)}
          </Text>
        </View>

        {budgetViews.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Лимиты еще не созданы</Text>
            <Text style={styles.emptyText}>
              Добавьте бюджет по категории, чтобы контролировать расходы.
            </Text>

            <TouchableOpacity style={styles.emptyButton} onPress={openCreateModal}>
              <Text style={styles.emptyButtonText}>Создать лимит</Text>
            </TouchableOpacity>
          </View>
        ) : (
          budgetViews.map((budget) => {
            const status = getStatus(budget.percent);

            return (
              <View key={budget.id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <View style={styles.iconBox}>
                    <AppIcon name="budget" size={21} color={colors.primary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.budgetTitle}>{budget.categoryName}</Text>
                    <Text style={styles.budgetSubtitle}>
                      Осталось {formatKzt(budget.remainingAmount)}
                    </Text>
                  </View>

                  <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>
                      {status.text}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(budget.percent, 100)}%`,
                        backgroundColor: status.color,
                      },
                    ]}
                  />
                </View>

                <View style={styles.budgetFooter}>
                  <Text style={styles.budgetMoney}>
                    {formatKzt(budget.spentAmount)} / {formatKzt(budget.limitAmount)}
                  </Text>
                  <Text style={styles.budgetPercent}>{budget.percent}%</Text>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.cardAction}
                    onPress={() => openEditModal(budget)}
                  >
                    <Text style={styles.cardActionText}>Изменить</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardAction, styles.deleteAction]}
                    onPress={() => deleteBudget(budget.id)}
                  >
                    <Text style={styles.deleteActionText}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingBudgetId ? 'Изменить лимит' : 'Новый лимит'}
              </Text>

              <TouchableOpacity onPress={closeModal} disabled={saving}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Категория</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryPicker}
            >
              {categories.map((category) => {
                const isActive = selectedCategoryId === category.id;

                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                    onPress={() => setSelectedCategoryId(category.id)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isActive && styles.categoryChipTextActive,
                      ]}
                    >
                      {category.name || 'Категория'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.inputLabel}>Сумма лимита</Text>

            <TextInput
              style={styles.input}
              placeholder="Например: 50000"
              placeholderTextColor={colors.inkMuted}
              keyboardType="numeric"
              value={limitAmount}
              onChangeText={setLimitAmount}
            />

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveBudget}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {editingBudgetId ? 'Сохранить' : 'Создать'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  heroLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '800',
  },

  heroPercent: {
    color: '#FFF',
    fontSize: 34,
    fontWeight: '900',
  },

  heroProgress: {
    marginTop: 16,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    overflow: 'hidden',
  },

  heroProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },

  heroText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
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
    marginBottom: 14,
  },

  emptyButton: {
    backgroundColor: colors.dark,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  emptyButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
  },

  budgetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },

  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 13,
  },

  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  budgetTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  budgetSubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },

  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '900',
  },

  progressTrack: {
    height: 9,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 999,
  },

  budgetFooter: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  budgetMoney: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },

  budgetPercent: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '900',
  },

  cardActions: {
    flexDirection: 'row',
    marginTop: 12,
  },

  cardAction: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginRight: 8,
  },

  cardActionText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },

  deleteAction: {
    backgroundColor: colors.coralSoft,
  },

  deleteActionText: {
    color: colors.coral,
    fontSize: 12,
    fontWeight: '900',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 24, 38, 0.45)',
    justifyContent: 'flex-end',
  },

  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  modalTitle: {
    flex: 1,
    fontSize: 22,
    color: colors.ink,
    fontWeight: '900',
  },

  modalClose: {
    fontSize: 28,
    color: colors.inkMuted,
  },

  inputLabel: {
    fontSize: 13,
    color: colors.inkMuted,
    fontWeight: '900',
    marginBottom: 8,
  },

  categoryPicker: {
    marginBottom: 14,
  },

  categoryChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },

  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  categoryChipText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '900',
  },

  categoryChipTextActive: {
    color: '#FFF',
  },

  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 16,
  },

  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
