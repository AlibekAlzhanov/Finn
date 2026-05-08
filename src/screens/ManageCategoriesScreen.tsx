import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import AppIcon from '../components/ui/AppIcon';
import { colors, radius, shadow, typography } from '../theme';

type CategoryType = 'expense' | 'income';

type Category = {
  id: string;
  user_id?: string | null;
  name: string | null;
  type: CategoryType | string | null;
  created_at?: string | null;
};

type CategoryForm = {
  name: string;
  type: CategoryType;
};

const categoryTabs: Array<{
  type: CategoryType;
  title: string;
  icon: string;
}> = [
  {
    type: 'expense',
    title: 'Расходы',
    icon: '−',
  },
  {
    type: 'income',
    title: 'Доходы',
    icon: '+',
  },
];

const defaultExpenseCategories = [
  'Продукты',
  'Кафе',
  'Транспорт',
  'Развлечения',
  'Здоровье',
  'Образование',
  'Подписки',
];

const defaultIncomeCategories = [
  'Зарплата',
  'Аванс',
  'Премия',
  'Перевод',
  'Подработка',
];

const getSafeType = (value: unknown): CategoryType => {
  return value === 'income' ? 'income' : 'expense';
};

const getSafeName = (value: unknown) => {
  const text = String(value || '').trim();
  return text || 'Без названия';
};

export default function ManageCategoriesScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeType, setActiveType] = useState<CategoryType>('expense');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<CategoryForm>({
    name: '',
    type: 'expense',
  });

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [user?.id])
  );

  const normalizedCategories = useMemo(() => {
    return (categories || [])
      .filter(Boolean)
      .map((category) => ({
        ...category,
        name: getSafeName(category?.name),
        type: getSafeType(category?.type),
      }));
  }, [categories]);

  const filteredCategories = useMemo(() => {
    return normalizedCategories.filter(
      (category) => getSafeType(category?.type) === activeType
    );
  }, [normalizedCategories, activeType]);

  const loadCategories = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, user_id, name, type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setCategories((data || []).filter(Boolean) as Category[]);
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить категории.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCategories();
  };

  const openCreateModal = (type: CategoryType = activeType) => {
    setEditingCategory(null);
    setForm({
      name: '',
      type,
    });
    setModalVisible(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setForm({
      name: getSafeName(category?.name),
      type: getSafeType(category?.type),
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalVisible(false);
    setEditingCategory(null);
    setForm({
      name: '',
      type: activeType,
    });
  };

  const saveCategory = async () => {
    if (!user?.id) return;

    const name = form.name.trim();
    const type = getSafeType(form.type);

    if (!name) {
      Alert.alert('Проверьте данные', 'Введите название категории.');
      return;
    }

    try {
      setSaving(true);

      if (editingCategory?.id) {
        const { error } = await supabase
          .from('categories')
          .update({
            name,
            type,
          })
          .eq('id', editingCategory.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({
            user_id: user.id,
            name,
            type,
          });

        if (error) throw error;
      }

      setActiveType(type);
      closeModal();
      await loadCategories();
    } catch (error) {
      console.error('Ошибка сохранения категории:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить категорию.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = (category: Category) => {
    if (!category?.id) return;

    Alert.alert(
      'Удалить категорию?',
      `Категория «${getSafeName(category.name)}» будет удалена.`,
      [
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
                .from('categories')
                .delete()
                .eq('id', category.id)
                .eq('user_id', user.id);

              if (error) throw error;

              await loadCategories();
            } catch (error) {
              console.error('Ошибка удаления категории:', error);
              Alert.alert(
                'Не удалось удалить',
                'Категория может использоваться в операциях. Лучше переименуйте ее вместо удаления.'
              );
            }
          },
        },
      ]
    );
  };

  const createDefaultCategories = async () => {
    if (!user?.id) return;

    const currentNames = normalizedCategories.map((category) =>
      getSafeName(category.name).toLowerCase()
    );

    const rows = [
      ...defaultExpenseCategories
        .filter((name) => !currentNames.includes(name.toLowerCase()))
        .map((name) => ({
          user_id: user.id,
          name,
          type: 'expense',
        })),
      ...defaultIncomeCategories
        .filter((name) => !currentNames.includes(name.toLowerCase()))
        .map((name) => ({
          user_id: user.id,
          name,
          type: 'income',
        })),
    ];

    if (rows.length === 0) {
      Alert.alert('Готово', 'Базовые категории уже есть.');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase.from('categories').insert(rows);

      if (error) throw error;

      await loadCategories();
      Alert.alert('Готово', 'Базовые категории добавлены.');
    } catch (error) {
      console.error('Ошибка создания базовых категорий:', error);
      Alert.alert('Ошибка', 'Не удалось добавить базовые категории.');
    } finally {
      setSaving(false);
    }
  };

  const renderCategoryCard = (category: Category) => {
    const type = getSafeType(category?.type);
    const name = getSafeName(category?.name);

    return (
      <View key={category.id} style={styles.categoryCard}>
        <View style={[styles.categoryIcon, type === 'income' && styles.categoryIconIncome]}>
          <Text style={styles.categoryIconText}>{type === 'income' ? '+' : '−'}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.categoryName}>{name}</Text>
          <Text style={styles.categoryType}>
            {type === 'income' ? 'Категория дохода' : 'Категория расхода'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => openEditModal(category)}
        >
          <AppIcon name="edit" size={17} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, styles.deleteButton]}
          onPress={() => deleteCategory(category)}
        >
          <AppIcon name="delete" size={17} color={colors.coral || colors.danger} />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка категорий...</Text>
      </View>
    );
  }

  const activeTab = categoryTabs.find((tab) => tab.type === activeType) || categoryTabs[0];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <AppIcon name="back" size={21} color={colors.ink || colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Категории</Text>
          <Text style={styles.subtitle}>Настройка доходов и расходов</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.tabs}>
          {categoryTabs.map((tab) => {
            const isActive = activeType === tab.type;

            return (
              <TouchableOpacity
                key={tab.type}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveType(tab.type)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabTitle, isActive && styles.tabTitleActive]}>
                  {tab.icon} {tab.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryIcon}>{activeTab.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>{activeTab.title}</Text>
            <Text style={styles.summaryText}>
              {filteredCategories.length} категорий
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => openCreateModal(activeType)}
        >
          <Text style={styles.addButtonText}>Добавить категорию</Text>
        </TouchableOpacity>

        {normalizedCategories.length === 0 && (
          <TouchableOpacity
            style={styles.defaultsButton}
            onPress={createDefaultCategories}
            disabled={saving}
          >
            <Text style={styles.defaultsButtonText}>Добавить базовые категории</Text>
          </TouchableOpacity>
        )}

        {filteredCategories.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Категорий пока нет</Text>
            <Text style={styles.emptyText}>
              Добавьте категорию, чтобы операции удобнее группировались в аналитике, бюджетах и отчетах.
            </Text>
          </View>
        ) : (
          filteredCategories.map(renderCategoryCard)
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
                {editingCategory ? 'Редактировать' : 'Новая категория'}
              </Text>

              <TouchableOpacity onPress={closeModal} disabled={saving}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Название</Text>
            <TextInput
              style={styles.input}
              placeholder="Например: Продукты"
              placeholderTextColor={colors.textSoft}
              value={form.name}
              onChangeText={(value) =>
                setForm((prev) => ({
                  ...prev,
                  name: value,
                }))
              }
            />

            <Text style={styles.inputLabel}>Тип</Text>
            <View style={styles.typeSwitch}>
              {categoryTabs.map((tab) => {
                const isActive = form.type === tab.type;

                return (
                  <TouchableOpacity
                    key={tab.type}
                    style={[styles.typeOption, isActive && styles.typeOptionActive]}
                    onPress={() =>
                      setForm((prev) => ({
                        ...prev,
                        type: tab.type,
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.typeOptionText,
                        isActive && styles.typeOptionTextActive,
                      ]}
                    >
                      {tab.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveCategory}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {editingCategory ? 'Сохранить' : 'Создать'}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  backButtonText: {
    fontSize: 24,
    color: colors.text,
  },

  title: {
    ...typography.h2,
  },

  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },

  content: {
    padding: 20,
    paddingBottom: 36,
  },

  tabs: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 6,
    flexDirection: 'row',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },

  tab: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabActive: {
    backgroundColor: colors.surfaceBlue,
  },

  tabTitle: {
    fontSize: 12,
    color: colors.textSoft,
    fontWeight: '900',
  },

  tabTitleActive: {
    color: colors.primary,
  },

  summaryCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.card,
  },

  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    color: '#FFF',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    textAlignVertical: 'center',
    marginRight: 14,
  },

  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },

  summaryText: {
    color: '#DBEAFE',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },

  addButton: {
    backgroundColor: colors.dark,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },

  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  defaultsButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  defaultsButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },

  emptyTitle: {
    fontSize: 18,
    color: colors.text,
    fontWeight: '900',
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.card,
  },

  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  categoryIconIncome: {
    backgroundColor: colors.successSoft,
  },

  categoryIconText: {
    fontSize: 24,
    color: colors.text,
    fontWeight: '900',
  },

  categoryName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },

  categoryType: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  iconButtonText: {
    fontSize: 17,
    color: colors.primary,
    fontWeight: '900',
  },

  deleteButton: {
    backgroundColor: colors.dangerSoft,
  },

  deleteButtonText: {
    fontSize: 22,
    color: colors.danger,
    fontWeight: '900',
    marginTop: -2,
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
    marginBottom: 7,
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

  typeSwitch: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
    padding: 5,
    flexDirection: 'row',
    marginBottom: 18,
  },

  typeOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },

  typeOptionActive: {
    backgroundColor: colors.surface,
  },

  typeOptionText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '900',
  },

  typeOptionTextActive: {
    color: colors.primary,
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
