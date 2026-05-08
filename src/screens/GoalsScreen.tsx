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

type Goal = {
  id: string;
  title: string | null;
  target_amount: number | string | null;
  current_amount: number | string | null;
  deadline?: string | null;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Без срока';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Без срока';

  return date.toLocaleDateString('ru-KZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export default function GoalsScreen() {
  const { user } = useAuthStore();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [user?.id])
  );

  const loadGoals = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('goals')
        .select('id, title, target_amount, current_amount, deadline')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setGoals(((data || []).filter(Boolean)) as Goal[]);
    } catch (error) {
      console.error('Ошибка загрузки целей:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить цели.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const goalViews = useMemo(() => {
    return goals
      .filter(Boolean)
      .map((goal) => {
        const target = safeNumber(goal.target_amount);
        const current = safeNumber(goal.current_amount);
        const progress = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;

        return {
          ...goal,
          title: String(goal.title || 'Цель'),
          target,
          current,
          progress,
          remaining: Math.max(target - current, 0),
        };
      });
  }, [goals]);

  const totalTarget = goalViews.reduce((sum, goal) => sum + goal.target, 0);
  const totalCurrent = goalViews.reduce((sum, goal) => sum + goal.current, 0);
  const totalProgress = totalTarget > 0 ? Math.min(Math.round((totalCurrent / totalTarget) * 100), 100) : 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGoals();
  };

  const openCreateModal = () => {
    setEditingGoalId(null);
    setTitle('');
    setTargetAmount('');
    setCurrentAmount('');
    setDeadline('');
    setModalVisible(true);
  };

  const openEditModal = (goal: any) => {
    setEditingGoalId(goal.id);
    setTitle(goal.title || '');
    setTargetAmount(String(Math.round(goal.target || 0)));
    setCurrentAmount(String(Math.round(goal.current || 0)));
    setDeadline(goal.deadline || '');
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalVisible(false);
    setEditingGoalId(null);
    setTitle('');
    setTargetAmount('');
    setCurrentAmount('');
    setDeadline('');
  };

  const saveGoal = async () => {
    if (!user?.id) return;

    const cleanTitle = title.trim();
    const target = safeNumber(targetAmount);
    const current = safeNumber(currentAmount);

    if (!cleanTitle) {
      Alert.alert('Проверьте данные', 'Введите название цели.');
      return;
    }

    if (target <= 0) {
      Alert.alert('Проверьте данные', 'Введите сумму цели.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        title: cleanTitle,
        target_amount: target,
        current_amount: current,
        deadline: deadline.trim() || null,
      };

      if (editingGoalId) {
        const { error } = await supabase
          .from('goals')
          .update(payload)
          .eq('id', editingGoalId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('goals')
          .insert({
            user_id: user.id,
            ...payload,
          });

        if (error) throw error;
      }

      closeModal();
      await loadGoals();
    } catch (error) {
      console.error('Ошибка сохранения цели:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить цель.');
    } finally {
      setSaving(false);
    }
  };

  const deleteGoal = (goalId: string) => {
    Alert.alert('Удалить цель?', 'Финансовая цель будет удалена.', [
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
              .from('goals')
              .delete()
              .eq('id', goalId)
              .eq('user_id', user.id);

            if (error) throw error;

            await loadGoals();
          } catch (error) {
            console.error('Ошибка удаления цели:', error);
            Alert.alert('Ошибка', 'Не удалось удалить цель.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка целей...</Text>
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
          title="Цели"
          subtitle="Накопления и прогресс"
          rightText="+ Цель"
          onRightPress={openCreateModal}
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Общий прогресс</Text>
          <Text style={styles.heroPercent}>{totalProgress}%</Text>

          <View style={styles.heroProgress}>
            <View style={[styles.heroProgressFill, { width: `${totalProgress}%` }]} />
          </View>

          <Text style={styles.heroText}>
            {formatKzt(totalCurrent)} из {formatKzt(totalTarget)}
          </Text>
        </View>

        {goalViews.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Целей пока нет</Text>
            <Text style={styles.emptyText}>
              Создайте финансовую цель: ноутбук, отпуск, подушка безопасности или обучение.
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={openCreateModal}>
              <Text style={styles.emptyButtonText}>Создать цель</Text>
            </TouchableOpacity>
          </View>
        ) : (
          goalViews.map((goal) => (
            <View key={goal.id} style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  <Text style={styles.goalSubtitle}>
                    Осталось {formatKzt(goal.remaining)} · {formatDate(goal.deadline)}
                  </Text>
                </View>

                <Text style={styles.goalPercent}>{goal.progress}%</Text>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${goal.progress}%` }]} />
              </View>

              <View style={styles.goalFooter}>
                <Text style={styles.goalMoney}>
                  {formatKzt(goal.current)} / {formatKzt(goal.target)}
                </Text>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.cardAction}
                  onPress={() => openEditModal(goal)}
                >
                  <Text style={styles.cardActionText}>Изменить</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cardAction, styles.deleteAction]}
                  onPress={() => deleteGoal(goal.id)}
                >
                  <Text style={styles.deleteActionText}>Удалить</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
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
                {editingGoalId ? 'Изменить цель' : 'Новая цель'}
              </Text>

              <TouchableOpacity onPress={closeModal} disabled={saving}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Название</Text>
            <TextInput
              style={styles.input}
              placeholder="Например: MacBook"
              placeholderTextColor={colors.textSoft}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.inputLabel}>Сумма цели</Text>
            <TextInput
              style={styles.input}
              placeholder="Например: 700000"
              placeholderTextColor={colors.textSoft}
              keyboardType="numeric"
              value={targetAmount}
              onChangeText={setTargetAmount}
            />

            <Text style={styles.inputLabel}>Уже накоплено</Text>
            <TextInput
              style={styles.input}
              placeholder="Например: 150000"
              placeholderTextColor={colors.textSoft}
              keyboardType="numeric"
              value={currentAmount}
              onChangeText={setCurrentAmount}
            />

            <Text style={styles.inputLabel}>Дедлайн, необязательно</Text>
            <TextInput
              style={styles.input}
              placeholder="2026-12-31"
              placeholderTextColor={colors.textSoft}
              value={deadline}
              onChangeText={setDeadline}
            />

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveGoal}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {editingGoalId ? 'Сохранить' : 'Создать'}
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 36 },

  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 14,
  },

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 20,
    marginBottom: 14,
    ...shadow.strong,
  },

  heroLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '800',
  },

  heroPercent: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
    marginTop: 8,
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
    ...shadow.card,
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 7,
  },

  emptyText: {
    color: colors.textMuted,
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

  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },

  goalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },

  goalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },

  goalSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },

  goalPercent: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
    marginLeft: 10,
  },

  progressTrack: {
    height: 9,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 999,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },

  goalFooter: {
    marginTop: 10,
  },

  goalMoney: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  cardActions: {
    flexDirection: 'row',
    marginTop: 12,
  },

  cardAction: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginRight: 8,
  },

  cardActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },

  deleteAction: {
    backgroundColor: colors.dangerSoft,
  },

  deleteActionText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
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
    color: colors.text,
    fontWeight: '900',
  },

  modalClose: {
    fontSize: 28,
    color: colors.textMuted,
  },

  inputLabel: {
    fontSize: 13,
    color: colors.textMuted,
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
