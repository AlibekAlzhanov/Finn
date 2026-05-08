import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import { BASE_CURRENCY, formatCurrencyAmount, normalizeCurrencyCode } from '../services/currencyService';
import { colors, radius, shadow, typography } from '../theme';
import AppIcon, { IconName } from '../components/ui/AppIcon';

type TxType = 'expense' | 'income' | 'transfer';
type ActiveTab = 'day' | 'calendar' | 'month' | 'summary' | 'notes';

type Transaction = {
  id: string;
  type: TxType | string | null;
  amount: number | string | null;
  original_amount?: number | string | null;
  original_currency?: string | null;
  base_amount?: number | string | null;
  base_currency?: string | null;
  exchange_rate?: number | string | null;
  exchange_source?: string | null;
  exchange_date?: string | null;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  note: string | null;
  tags: string[] | string | null;
  transaction_date: string | null;
  created_at?: string | null;
};

type Account = {
  id: string;
  name: string | null;
};

type Category = {
  id: string;
  name: string | null;
  type: string | null;
};

type EditableTransaction = {
  id: string;
  type: TxType;
  amountText: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  note: string;
  tagsText: string;
  transactionDate: string;
};

type DaySummary = {
  dateKey: string;
  date: Date | null;
  income: number;
  expense: number;
  transfer: number;
  balance: number;
  transactions: Transaction[];
};

type MonthSummary = {
  monthKey: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
  weeks: WeekSummary[];
};

type WeekSummary = {
  label: string;
  income: number;
  expense: number;
  balance: number;
};

type CalendarCell = {
  date: Date;
  dateKey: string;
  isCurrentMonth: boolean;
  income: number;
  expense: number;
  balance: number;
};

type Insight = {
  id: string;
  title: string;
  text: string;
  icon: IconName;
  tone: 'primary' | 'green' | 'red';
};

const TABS: Array<{ key: ActiveTab; label: string; icon: IconName }> = [
  { key: 'day', label: 'День', icon: 'history' },
  { key: 'calendar', label: 'Календарь', icon: 'report' },
  { key: 'month', label: 'Месяц', icon: 'chart' },
  { key: 'summary', label: 'Итог', icon: 'budget' },
  { key: 'notes', label: 'Заметка', icon: 'ai' },
];

const WEEK_DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const safeNumber = (value: unknown) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};


const getTransactionBaseAmount = (tx: Transaction) => {
  const baseAmount = safeNumber(tx.base_amount);

  if (baseAmount > 0) return baseAmount;

  return getTransactionBaseAmount(tx);
};

const getOriginalCurrencyLine = (tx: Transaction) => {
  const originalCurrency = normalizeCurrencyCode(tx.original_currency);
  const originalAmount = safeNumber(tx.original_amount);

  if (originalCurrency === BASE_CURRENCY || originalAmount <= 0) {
    return '';
  }

  return `${formatCurrencyAmount(originalAmount, originalCurrency)} · курс ${safeNumber(tx.exchange_rate).toFixed(4)}`;
};

const normalizeType = (value: unknown): TxType => {
  if (value === 'income') return 'income';
  if (value === 'transfer') return 'transfer';
  return 'expense';
};

const isValidDate = (value: unknown) => {
  if (!value) return false;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
};

const getDateKey = (value: Date | string | null | undefined) => {
  if (!value) return 'no-date';

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) return 'no-date';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const toInputDate = (value: string | null | undefined) => {
  if (!value || !isValidDate(value)) return getDateKey(new Date());
  return getDateKey(value);
};

const normalizeTags = (value: unknown): string[] | null => {
  if (!value) return null;

  if (Array.isArray(value)) {
    const tags = value.map((item) => String(item || '').trim()).filter(Boolean);
    return tags.length > 0 ? tags : null;
  }

  const text = String(value || '').trim();

  if (!text) return null;

  const tags = text.split(',').map((item) => item.trim()).filter(Boolean);

  return tags.length > 0 ? tags : null;
};

const tagsToText = (value: unknown) => {
  const tags = normalizeTags(value);
  return tags ? tags.join(', ') : '';
};

const formatShortDate = (value: string | null | undefined) => {
  if (!value || !isValidDate(value)) return 'Без даты';

  return new Date(String(value)).toLocaleDateString('ru-KZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatDayTitle = (date: Date | null) => {
  if (!date) return 'Без даты';

  return date.toLocaleDateString('ru-KZ', {
    day: 'numeric',
    month: 'long',
  });
};

const getWeekDayShort = (date: Date | null) => {
  if (!date) return '--';

  const index = (date.getDay() + 6) % 7;
  return WEEK_DAYS[index];
};

const getTypeLabel = (type: TxType | string | null | undefined) => {
  if (type === 'income') return 'Доход';
  if (type === 'transfer') return 'Перевод';
  return 'Расход';
};

const getTypeColor = (type: TxType | string | null | undefined) => {
  if (type === 'income') return colors.mint;
  if (type === 'transfer') return colors.primary;
  return colors.coral;
};

const getTypeSoftColor = (type: TxType | string | null | undefined) => {
  if (type === 'income') return colors.mintSoft;
  if (type === 'transfer') return colors.primarySoft;
  return colors.coralSoft;
};

const getTypeIcon = (type: TxType | string | null | undefined): IconName => {
  if (type === 'income') return 'plus';
  if (type === 'transfer') return 'sync';
  return 'budget';
};

const getMonthTitle = (date: Date) => {
  return date.toLocaleDateString('ru-KZ', {
    month: 'long',
    year: 'numeric',
  });
};

const shiftMonth = (date: Date, diff: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + diff);
  return next;
};

const shiftYear = (date: Date, diff: number) => {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + diff);
  return next;
};

const getCalendarCells = (
  selectedMonth: Date,
  dayMap: Record<string, DaySummary>
): CalendarCell[] => {
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const calendarStart = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);

    const dateKey = getDateKey(date);
    const summary = dayMap[dateKey];

    return {
      date,
      dateKey,
      isCurrentMonth: date.getMonth() === month,
      income: summary?.income || 0,
      expense: summary?.expense || 0,
      balance: summary?.balance || 0,
    };
  });
};

const getWeekRangeLabel = (start: Date, end: Date) => {
  const left = start.toLocaleDateString('ru-KZ', {
    day: '2-digit',
    month: '2-digit',
  });

  const right = end.toLocaleDateString('ru-KZ', {
    day: '2-digit',
    month: '2-digit',
  });

  return `${left} – ${right}`;
};

export default function OperationsHubScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { width } = useWindowDimensions();

  const isWide = width >= 760;
  const isCompact = width < 380;

  const [activeTab, setActiveTab] = useState<ActiveTab>('day');
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editing, setEditing] = useState<EditableTransaction | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user?.id])
  );

  const expenseCategories = categories.filter((category) => category.type === 'expense');
  const incomeCategories = categories.filter((category) => category.type === 'income');

  const currentMonthTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (!isValidDate(tx.transaction_date)) return false;

      const date = new Date(String(tx.transaction_date));

      return (
        date.getFullYear() === selectedMonth.getFullYear() &&
        date.getMonth() === selectedMonth.getMonth()
      );
    });
  }, [transactions, selectedMonth]);

  const currentYearTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (!isValidDate(tx.transaction_date)) return false;

      const date = new Date(String(tx.transaction_date));

      return date.getFullYear() === selectedMonth.getFullYear();
    });
  }, [transactions, selectedMonth]);

  const monthTotals = useMemo(() => {
    return currentMonthTransactions.reduce(
      (acc, tx) => {
        const type = normalizeType(tx.type);
        const amount = getTransactionBaseAmount(tx);

        if (type === 'income') acc.income += amount;
        if (type === 'expense') acc.expense += amount;
        if (type === 'transfer') acc.transfer += amount;

        acc.balance = acc.income - acc.expense;

        return acc;
      },
      {
        income: 0,
        expense: 0,
        transfer: 0,
        balance: 0,
      }
    );
  }, [currentMonthTransactions]);

  const yearTotals = useMemo(() => {
    return currentYearTransactions.reduce(
      (acc, tx) => {
        const type = normalizeType(tx.type);
        const amount = getTransactionBaseAmount(tx);

        if (type === 'income') acc.income += amount;
        if (type === 'expense') acc.expense += amount;
        if (type === 'transfer') acc.transfer += amount;

        acc.balance = acc.income - acc.expense;

        return acc;
      },
      {
        income: 0,
        expense: 0,
        transfer: 0,
        balance: 0,
      }
    );
  }, [currentYearTransactions]);

  const dayGroups = useMemo<DaySummary[]>(() => {
    const map: Record<string, DaySummary> = {};

    currentMonthTransactions.forEach((tx) => {
      const dateKey = getDateKey(tx.transaction_date);
      const date = isValidDate(tx.transaction_date) ? new Date(String(tx.transaction_date)) : null;
      const type = normalizeType(tx.type);
      const amount = getTransactionBaseAmount(tx);

      if (!map[dateKey]) {
        map[dateKey] = {
          dateKey,
          date,
          income: 0,
          expense: 0,
          transfer: 0,
          balance: 0,
          transactions: [],
        };
      }

      if (type === 'income') map[dateKey].income += amount;
      if (type === 'expense') map[dateKey].expense += amount;
      if (type === 'transfer') map[dateKey].transfer += amount;

      map[dateKey].balance = map[dateKey].income - map[dateKey].expense;
      map[dateKey].transactions.push(tx);
    });

    return Object.values(map).sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.getTime() - a.date.getTime();
    });
  }, [currentMonthTransactions]);

  const dayMap = useMemo(() => {
    return dayGroups.reduce<Record<string, DaySummary>>((acc, day) => {
      acc[day.dateKey] = day;
      return acc;
    }, {});
  }, [dayGroups]);

  const calendarCells = useMemo(() => {
    return getCalendarCells(selectedMonth, dayMap);
  }, [selectedMonth, dayMap]);

  const monthSummary = useMemo<MonthSummary[]>(() => {
    return Array.from({ length: 12 }).map((_, monthIndex) => {
      const monthTransactions = currentYearTransactions.filter((tx) => {
        if (!isValidDate(tx.transaction_date)) return false;
        const date = new Date(String(tx.transaction_date));
        return date.getMonth() === monthIndex;
      });

      const totals = monthTransactions.reduce(
        (acc, tx) => {
          const type = normalizeType(tx.type);
          const amount = getTransactionBaseAmount(tx);

          if (type === 'income') acc.income += amount;
          if (type === 'expense') acc.expense += amount;
          acc.balance = acc.income - acc.expense;

          return acc;
        },
        {
          income: 0,
          expense: 0,
          balance: 0,
        }
      );

      const year = selectedMonth.getFullYear();
      const weeks: WeekSummary[] = [];
      const firstDay = new Date(year, monthIndex, 1);
      const lastDay = new Date(year, monthIndex + 1, 0);

      let weekStart = new Date(firstDay);

      while (weekStart <= lastDay) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        if (weekEnd > lastDay) {
          weekEnd.setTime(lastDay.getTime());
        }

        const weekTransactions = monthTransactions.filter((tx) => {
          if (!isValidDate(tx.transaction_date)) return false;

          const date = new Date(String(tx.transaction_date));

          return date >= weekStart && date <= weekEnd;
        });

        const weekTotals = weekTransactions.reduce(
          (acc, tx) => {
            const type = normalizeType(tx.type);
            const amount = getTransactionBaseAmount(tx);

            if (type === 'income') acc.income += amount;
            if (type === 'expense') acc.expense += amount;
            acc.balance = acc.income - acc.expense;

            return acc;
          },
          {
            income: 0,
            expense: 0,
            balance: 0,
          }
        );

        if (weekTotals.income > 0 || weekTotals.expense > 0) {
          weeks.push({
            label: getWeekRangeLabel(weekStart, weekEnd),
            ...weekTotals,
          });
        }

        weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() + 1);
      }

      return {
        monthKey: `${year}-${monthIndex}`,
        label: MONTH_NAMES[monthIndex],
        ...totals,
        weeks,
      };
    }).reverse();
  }, [currentYearTransactions, selectedMonth]);

  const categoryExpenseSummary = useMemo(() => {
    const map: Record<string, number> = {};

    currentMonthTransactions.forEach((tx) => {
      if (normalizeType(tx.type) !== 'expense') return;

      const categoryName = getCategoryName(tx.category_id);
      map[categoryName] = (map[categoryName] || 0) + getTransactionBaseAmount(tx);
    });

    return Object.entries(map)
      .map(([name, amount]) => ({
        name,
        amount,
        percent: monthTotals.expense > 0 ? Math.round((amount / monthTotals.expense) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [currentMonthTransactions, monthTotals.expense, categories]);

  const accountExpenseSummary = useMemo(() => {
    const map: Record<string, number> = {};

    currentMonthTransactions.forEach((tx) => {
      if (normalizeType(tx.type) !== 'expense') return;

      const accountName = getAccountName(tx.account_id);
      map[accountName] = (map[accountName] || 0) + getTransactionBaseAmount(tx);
    });

    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [currentMonthTransactions, accounts]);

  const insights = useMemo<Insight[]>(() => {
    const items: Insight[] = [];

    if (monthTotals.income > 0 && monthTotals.expense > monthTotals.income) {
      items.push({
        id: 'overspend',
        title: 'Расходы выше доходов',
        text: `За месяц минус ${formatKzt(monthTotals.expense - monthTotals.income)}. Проверь крупные категории и подписки.`,
        icon: 'budget',
        tone: 'red',
      });
    }

    if (monthTotals.income > monthTotals.expense && monthTotals.income > 0) {
      items.push({
        id: 'saving',
        title: 'Месяц в плюсе',
        text: `Положительный баланс: ${formatKzt(monthTotals.balance)}. Можно перенести часть суммы в финансовую цель.`,
        icon: 'target',
        tone: 'green',
      });
    }

    const topCategory = categoryExpenseSummary[0];

    if (topCategory) {
      items.push({
        id: 'top-category',
        title: 'Главная категория расходов',
        text: `${topCategory.name}: ${formatKzt(topCategory.amount)} (${topCategory.percent}% расходов месяца).`,
        icon: 'chart',
        tone: 'primary',
      });
    }

    if (currentMonthTransactions.length === 0) {
      items.push({
        id: 'empty',
        title: 'Нет операций за месяц',
        text: 'Добавь операции, и здесь появятся подсказки по расходам, доходам и лимитам.',
        icon: 'ai',
        tone: 'primary',
      });
    }

    return items;
  }, [monthTotals, categoryExpenseSummary, currentMonthTransactions.length]);

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [transactionsResult, accountsResult, categoriesResult] = await Promise.all([
        supabase
          .from('transactions')
          .select(
            'id, type, amount, original_amount, original_currency, base_amount, base_currency, exchange_rate, exchange_source, exchange_date, account_id, to_account_id, category_id, note, tags, transaction_date, created_at'
          )
          .eq('user_id', user.id)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false }),

        supabase
          .from('accounts')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),

        supabase
          .from('categories')
          .select('id, name, type')
          .eq('user_id', user.id)
          .order('name', { ascending: true }),
      ]);

      if (transactionsResult.error) throw transactionsResult.error;
      if (accountsResult.error) throw accountsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      setTransactions(((transactionsResult.data || []).filter(Boolean)) as Transaction[]);
      setAccounts(((accountsResult.data || []).filter(Boolean)) as Account[]);
      setCategories(((categoriesResult.data || []).filter(Boolean)) as Category[]);
    } catch (error) {
      console.error('Ошибка загрузки операций:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить операции.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  function getAccountName(id?: string | null) {
    if (!id) return 'Счет';
    return accounts.find((account) => account.id === id)?.name || 'Счет';
  }

  function getCategoryName(id?: string | null) {
    if (!id) return 'Без категории';
    return categories.find((category) => category.id === id)?.name || 'Категория';
  }

  const openEditModal = (transaction: Transaction) => {
    const type = normalizeType(transaction.type);

    setEditing({
      id: transaction.id,
      type,
      amountText: String(Math.round(safeNumber(transaction.amount))),
      accountId: transaction.account_id || accounts[0]?.id || '',
      toAccountId:
        transaction.to_account_id ||
        accounts.find((account) => account.id !== transaction.account_id)?.id ||
        accounts[0]?.id ||
        '',
      categoryId: transaction.category_id || '',
      note: transaction.note || '',
      tagsText: tagsToText(transaction.tags),
      transactionDate: toInputDate(transaction.transaction_date),
    });

    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    if (saving) return;

    setEditModalVisible(false);
    setEditing(null);
  };

  const updateEditing = (patch: Partial<EditableTransaction>) => {
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveEdit = async () => {
    if (!user?.id || !editing) return;

    const amount = safeNumber(editing.amountText);

    if (amount <= 0) {
      Alert.alert('Проверьте данные', 'Введите сумму операции.');
      return;
    }

    if (!editing.accountId) {
      Alert.alert('Проверьте данные', 'Выберите счет.');
      return;
    }

    if (editing.type !== 'transfer' && !editing.categoryId) {
      Alert.alert('Проверьте данные', 'Выберите категорию.');
      return;
    }

    if (editing.type === 'transfer' && !editing.toAccountId) {
      Alert.alert('Проверьте данные', 'Выберите счет получения.');
      return;
    }

    if (editing.type === 'transfer' && editing.accountId === editing.toAccountId) {
      Alert.alert('Проверьте данные', 'Счет списания и счет получения должны отличаться.');
      return;
    }

    try {
      setSaving(true);

      const date = new Date(`${editing.transactionDate}T12:00:00`);

      const { error } = await supabase
        .from('transactions')
        .update({
          type: editing.type,
          amount,
          account_id: editing.accountId,
          to_account_id: editing.type === 'transfer' ? editing.toAccountId : null,
          category_id: editing.type === 'transfer' ? null : editing.categoryId,
          note: editing.note.trim() || null,
          tags: normalizeTags(editing.tagsText),
          transaction_date: date.toISOString(),
        })
        .eq('id', editing.id)
        .eq('user_id', user.id);

      if (error) throw error;

      closeEditModal();
      await loadData();
    } catch (error) {
      console.error('Ошибка редактирования операции:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить изменения.');
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = (transaction: Transaction) => {
    Alert.alert(
      'Удалить операцию?',
      `${transaction.note || getCategoryName(transaction.category_id)} · ${formatKzt(
        safeNumber(transaction.amount)
      )}`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;

            try {
              const { error } = await supabase
                .from('transactions')
                .delete()
                .eq('id', transaction.id)
                .eq('user_id', user.id);

              if (error) throw error;

              setTransactions((prev) => prev.filter((item) => item.id !== transaction.id));
            } catch (error) {
              console.error('Ошибка удаления операции:', error);
              Alert.alert('Ошибка', 'Не удалось удалить операцию.');
            }
          },
        },
      ]
    );
  };

  const openManualInput = () => {
    navigation.navigate('ManualInput');
  };

  const renderHeader = () => {
    const title =
      activeTab === 'month'
        ? String(selectedMonth.getFullYear())
        : getMonthTitle(selectedMonth);

    return (
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() =>
              setSelectedMonth((prev) =>
                activeTab === 'month' ? shiftYear(prev, -1) : shiftMonth(prev, -1)
              )
            }
            activeOpacity={0.86}
          >
            <AppIcon name="back" size={21} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerOverline}>Операции</Text>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() =>
              setSelectedMonth((prev) =>
                activeTab === 'month' ? shiftYear(prev, 1) : shiftMonth(prev, 1)
              )
            }
            activeOpacity={0.86}
          >
            <AppIcon
              name="back"
              size={21}
              color="#FFFFFF"
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.totalHeroRow}>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricLabel}>Доход</Text>
            <Text style={styles.heroIncome}>{formatKzt((activeTab === 'month' ? yearTotals : monthTotals).income)}</Text>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricLabel}>Расход</Text>
            <Text style={styles.heroExpense}>{formatKzt((activeTab === 'month' ? yearTotals : monthTotals).expense)}</Text>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricLabel}>Баланс</Text>
            <Text style={styles.heroBalance}>{formatKzt((activeTab === 'month' ? yearTotals : monthTotals).balance)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderTabs = () => (
    <View style={styles.tabsCard}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabChip, isActive && styles.tabChipActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.86}
            >
              <AppIcon
                name={tab.icon}
                size={16}
                color={isActive ? '#FFFFFF' : colors.inkMuted}
              />
              <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderToolbar = () => (
    <View style={styles.toolbar}>
      <TouchableOpacity style={styles.toolbarButton} onPress={() => navigation.navigate('Stats')}>
        <AppIcon name="chart" size={17} color={colors.primary} />
        <Text style={styles.toolbarButtonText}>Графики</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.toolbarButton} onPress={() => navigation.navigate('Budgets')}>
        <AppIcon name="budget" size={17} color={colors.primary} />
        <Text style={styles.toolbarButtonText}>Бюджеты</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.toolbarButton} onPress={() => navigation.navigate('AiChat')}>
        <AppIcon name="ai" size={17} color={colors.primary} />
        <Text style={styles.toolbarButtonText}>AI</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTransactionRow = (transaction: Transaction) => {
    const type = normalizeType(transaction.type);
    const amount = safeNumber(transaction.amount);

    return (
      <View key={transaction.id} style={styles.operationRow}>
        <View style={[styles.operationIcon, { backgroundColor: getTypeSoftColor(type) }]}>
          <AppIcon name={getTypeIcon(type)} size={18} color={getTypeColor(type)} />
        </View>

        <View style={styles.operationInfo}>
          <Text style={styles.operationTitle} numberOfLines={1}>
            {transaction.note?.trim() || getCategoryName(transaction.category_id)}
          </Text>

          <Text style={styles.operationMeta} numberOfLines={1}>
            {type === 'transfer'
              ? `${getAccountName(transaction.account_id)} → ${getAccountName(transaction.to_account_id)}`
              : `${getCategoryName(transaction.category_id)} · ${getAccountName(transaction.account_id)}`}
          </Text>

          {!!getOriginalCurrencyLine(transaction) && (
            <Text style={styles.operationCurrencyMeta} numberOfLines={1}>
              {getOriginalCurrencyLine(transaction)}
            </Text>
          )}
        </View>

        <Text style={[styles.operationAmount, { color: getTypeColor(type) }]}>
          {type === 'expense' ? '-' : type === 'income' ? '+' : ''}
          {formatKzt(amount)}
        </Text>

        <View style={styles.rowActions}>
          <TouchableOpacity
            style={styles.rowActionButton}
            onPress={() => openEditModal(transaction)}
            activeOpacity={0.86}
          >
            <AppIcon name="edit" size={16} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.rowActionButton, styles.rowDeleteButton]}
            onPress={() => deleteTransaction(transaction)}
            activeOpacity={0.86}
          >
            <AppIcon name="delete" size={16} color={colors.coral} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDayTab = () => {
    if (dayGroups.length === 0) {
      return renderEmptyState('Операций нет', 'Добавь первую операцию за выбранный месяц.');
    }

    return (
      <View style={[styles.cardsGrid, isWide && styles.cardsGridWide]}>
        {dayGroups.map((day) => (
          <View key={day.dateKey} style={[styles.dayCard, isWide && styles.halfCard]}>
            <View style={styles.dayCardHeader}>
              <View style={styles.dayDateCircle}>
                <Text style={styles.dayDateNumber}>{day.date ? day.date.getDate() : '--'}</Text>
                <Text style={styles.dayDateWeek}>{getWeekDayShort(day.date)}</Text>
              </View>

              <View style={styles.dayTitleBlock}>
                <Text style={styles.dayTitle}>{formatDayTitle(day.date)}</Text>
                <Text style={styles.daySubtitle}>{day.transactions.length} операций</Text>
              </View>

              <View style={styles.dayBalanceBadge}>
                <Text style={styles.dayBalanceLabel}>Итог</Text>
                <Text style={styles.dayBalanceValue}>{formatKzt(day.balance)}</Text>
              </View>
            </View>

            <View style={styles.dayStatsRow}>
              <View style={styles.dayStatBox}>
                <Text style={styles.dayStatLabel}>Доход</Text>
                <Text style={styles.dayIncome}>{formatKzt(day.income)}</Text>
              </View>

              <View style={styles.dayStatBox}>
                <Text style={styles.dayStatLabel}>Расход</Text>
                <Text style={styles.dayExpense}>{formatKzt(day.expense)}</Text>
              </View>
            </View>

            {day.transactions.map(renderTransactionRow)}
          </View>
        ))}
      </View>
    );
  };

  const renderCalendarTab = () => (
    <View style={styles.calendarCard}>
      <View style={styles.calendarWeekRow}>
        {WEEK_DAYS.map((day) => (
          <Text key={day} style={styles.calendarWeekText}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarCells.map((cell) => {
          const hasData = cell.income > 0 || cell.expense > 0 || cell.balance !== 0;
          const isToday = cell.dateKey === getDateKey(new Date());

          return (
            <TouchableOpacity
              key={cell.dateKey}
              style={[
                styles.calendarCell,
                isCompact && styles.calendarCellCompact,
                !cell.isCurrentMonth && styles.calendarCellMuted,
                isToday && styles.calendarCellToday,
              ]}
              activeOpacity={0.86}
              onPress={() => {
                const day = dayMap[cell.dateKey];

                if (!day) {
                  Alert.alert('Нет операций', 'В этот день операций нет.');
                  return;
                }

                setActiveTab('day');
              }}
            >
              <Text
                style={[
                  styles.calendarDayNumber,
                  !cell.isCurrentMonth && styles.calendarMutedText,
                  isToday && styles.calendarTodayText,
                ]}
              >
                {cell.date.getDate()}
              </Text>

              {hasData && (
                <View style={styles.calendarAmounts}>
                  {cell.income > 0 && (
                    <Text style={styles.calendarIncome} numberOfLines={1}>
                      {formatKzt(cell.income)}
                    </Text>
                  )}

                  {cell.expense > 0 && (
                    <Text style={styles.calendarExpense} numberOfLines={1}>
                      {formatKzt(cell.expense)}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderMonthTab = () => (
    <View style={[styles.cardsGrid, isWide && styles.cardsGridWide]}>
      {monthSummary.map((month) => {
        const hasData = month.income > 0 || month.expense > 0;

        return (
          <View
            key={month.monthKey}
            style={[
              styles.monthCard,
              isWide && styles.halfCard,
              !hasData && styles.monthCardMuted,
            ]}
          >
            <View style={styles.monthHeader}>
              <View>
                <Text style={styles.monthLabel}>{month.label}</Text>
                <Text style={styles.monthSubLabel}>{month.weeks.length} активных недель</Text>
              </View>

              <View style={styles.monthBalanceBadge}>
                <Text style={styles.monthBalanceLabel}>Баланс</Text>
                <Text style={styles.monthBalanceValue}>{formatKzt(month.balance)}</Text>
              </View>
            </View>

            <View style={styles.monthTotalsRow}>
              <View style={styles.monthTotalBox}>
                <Text style={styles.monthTotalLabel}>Доход</Text>
                <Text style={styles.monthIncome}>{formatKzt(month.income)}</Text>
              </View>

              <View style={styles.monthTotalBox}>
                <Text style={styles.monthTotalLabel}>Расход</Text>
                <Text style={styles.monthExpense}>{formatKzt(month.expense)}</Text>
              </View>
            </View>

            {month.weeks.map((week) => (
              <View key={`${month.monthKey}-${week.label}`} style={styles.weekRow}>
                <Text style={styles.weekLabel}>{week.label}</Text>
                <View style={styles.weekAmounts}>
                  <Text style={styles.weekIncome}>{formatKzt(week.income)}</Text>
                  <Text style={styles.weekExpense}>{formatKzt(week.expense)}</Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );

  const renderSummaryTab = () => {
    const previousMonth = shiftMonth(selectedMonth, -1);

    const previousMonthExpense = transactions.reduce((sum, tx) => {
      if (normalizeType(tx.type) !== 'expense') return sum;
      if (!isValidDate(tx.transaction_date)) return sum;

      const date = new Date(String(tx.transaction_date));

      if (
        date.getFullYear() === previousMonth.getFullYear() &&
        date.getMonth() === previousMonth.getMonth()
      ) {
        return sum + getTransactionBaseAmount(tx);
      }

      return sum;
    }, 0);

    const diffPercent =
      previousMonthExpense > 0
        ? Math.round(((monthTotals.expense - previousMonthExpense) / previousMonthExpense) * 100)
        : 0;

    return (
      <View style={[styles.cardsGrid, isWide && styles.cardsGridWide]}>
        <View style={[styles.summaryCard, isWide && styles.halfCard]}>
          <View style={styles.summaryCardHeader}>
            <View style={styles.summaryIconBox}>
              <AppIcon name="budget" size={22} color={colors.primary} />
            </View>

            <View>
              <Text style={styles.summaryTitle}>Бюджет месяца</Text>
              <Text style={styles.summarySubtitle}>Связь с лимитами</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryActionButton} onPress={() => navigation.navigate('Budgets')}>
            <Text style={styles.primaryActionText}>Открыть бюджеты</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.summaryCard, isWide && styles.halfCard]}>
          <View style={styles.summaryCardHeader}>
            <View style={styles.summaryIconBox}>
              <AppIcon name="wallet" size={22} color={colors.primary} />
            </View>

            <View>
              <Text style={styles.summaryTitle}>Активы</Text>
              <Text style={styles.summarySubtitle}>{getMonthTitle(selectedMonth)}</Text>
            </View>
          </View>

          <SummaryLine label="Сравнение с прошлым месяцем" value={previousMonthExpense > 0 ? `${diffPercent}%` : '—'} />
          <SummaryLine label="Переводы" value={formatKzt(monthTotals.transfer)} />

          {accountExpenseSummary.map((item) => (
            <SummaryLine key={item.name} label={`Расход: ${item.name}`} value={formatKzt(item.amount)} />
          ))}
        </View>

        <View style={[styles.summaryCard, isWide && styles.fullCard]}>
          <View style={styles.summaryCardHeader}>
            <View style={styles.summaryIconBox}>
              <AppIcon name="category" size={22} color={colors.primary} />
            </View>

            <View>
              <Text style={styles.summaryTitle}>Категории расходов</Text>
              <Text style={styles.summarySubtitle}>Топ за выбранный месяц</Text>
            </View>
          </View>

          {categoryExpenseSummary.length === 0 ? (
            <Text style={styles.emptyInlineText}>Нет расходов за месяц.</Text>
          ) : (
            categoryExpenseSummary.map((item) => (
              <View key={item.name} style={styles.categoryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryName}>{item.name}</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(item.percent, 100)}%` }]} />
                  </View>
                </View>

                <View style={styles.categoryRight}>
                  <Text style={styles.categoryAmount}>{formatKzt(item.amount)}</Text>
                  <Text style={styles.categoryPercent}>{item.percent}%</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity style={[styles.exportCard, isWide && styles.fullCard]} activeOpacity={0.86}>
          <View style={styles.exportIcon}>
            <Text style={styles.exportIconText}>X</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.exportTitle}>Экспорт Excel</Text>
            <Text style={styles.exportSubtitle}>Кнопка подготовлена как UI. Логику экспорта можно добавить отдельным этапом.</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNotesTab = () => (
    <View style={[styles.cardsGrid, isWide && styles.cardsGridWide]}>
      {insights.map((note) => (
        <View
          key={note.id}
          style={[
            styles.noteCard,
            isWide && styles.halfCard,
            note.tone === 'red' && styles.noteCardRed,
            note.tone === 'green' && styles.noteCardGreen,
          ]}
        >
          <View style={styles.noteHeader}>
            <View
              style={[
                styles.noteIconBox,
                note.tone === 'red' && styles.noteIconRed,
                note.tone === 'green' && styles.noteIconGreen,
              ]}
            >
              <AppIcon
                name={note.icon}
                size={20}
                color={note.tone === 'red' ? colors.coral : note.tone === 'green' ? colors.mint : colors.primary}
              />
            </View>

            <Text style={styles.noteTitle}>{note.title}</Text>
          </View>

          <Text style={styles.noteText}>{note.text}</Text>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.noteAction, isWide && styles.fullCard]}
        onPress={() => navigation.navigate('AiChat')}
      >
        <AppIcon name="ai" size={20} color={colors.primary} />
        <Text style={styles.noteActionText}>Открыть AI-чат для подробного разбора месяца</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = (title: string, text: string) => (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>

      <TouchableOpacity style={styles.emptyButton} onPress={openManualInput}>
        <Text style={styles.emptyButtonText}>Добавить операцию</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    if (activeTab === 'calendar') return renderCalendarTab();
    if (activeTab === 'month') return renderMonthTab();
    if (activeTab === 'summary') return renderSummaryTab();
    if (activeTab === 'notes') return renderNotesTab();

    return renderDayTab();
  };

  const renderTypeSwitch = () => {
    if (!editing) return null;

    const types: TxType[] = ['expense', 'income', 'transfer'];

    return (
      <View style={styles.typeSwitch}>
        {types.map((type) => {
          const isActive = editing.type === type;

          return (
            <TouchableOpacity
              key={type}
              style={[styles.typeOption, isActive && styles.typeOptionActive]}
              onPress={() =>
                updateEditing({
                  type,
                  categoryId: type === 'transfer' ? '' : editing.categoryId,
                })
              }
              activeOpacity={0.86}
            >
              <Text style={[styles.typeText, isActive && styles.typeTextActive]}>
                {getTypeLabel(type)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderAccountPicker = (field: 'accountId' | 'toAccountId', label: string) => {
    if (!editing) return null;

    return (
      <>
        <Text style={styles.inputLabel}>{label}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
          {accounts.map((account) => {
            const isActive = editing[field] === account.id;

            return (
              <TouchableOpacity
                key={`${field}-${account.id}`}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => updateEditing({ [field]: account.id })}
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

  const renderCategoryPicker = () => {
    if (!editing || editing.type === 'transfer') return null;

    const source = editing.type === 'income' ? incomeCategories : expenseCategories;

    return (
      <>
        <Text style={styles.inputLabel}>Категория</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
          {source.map((category) => {
            const isActive = editing.categoryId === category.id;

            return (
              <TouchableOpacity
                key={category.id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => updateEditing({ categoryId: category.id })}
                activeOpacity={0.86}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {category.name || 'Категория'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка операций...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderHeader()}
        {renderTabs()}
        {renderToolbar()}
        {renderContent()}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openManualInput} activeOpacity={0.86}>
        <AppIcon name="plus" size={30} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={closeEditModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, isWide && styles.modalCardWide]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Редактировать операцию</Text>

                <TouchableOpacity onPress={closeEditModal} disabled={saving}>
                  <Text style={styles.modalClose}>×</Text>
                </TouchableOpacity>
              </View>

              {renderTypeSwitch()}

              <Text style={styles.inputLabel}>Сумма</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={colors.inkMuted}
                keyboardType="numeric"
                value={editing?.amountText || ''}
                onChangeText={(value) => updateEditing({ amountText: value })}
              />

              {renderAccountPicker('accountId', editing?.type === 'transfer' ? 'Счет списания' : 'Счет')}

              {editing?.type === 'transfer' && renderAccountPicker('toAccountId', 'Счет получения')}

              {renderCategoryPicker()}

              <Text style={styles.inputLabel}>Дата</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-05-14"
                placeholderTextColor={colors.inkMuted}
                value={editing?.transactionDate || ''}
                onChangeText={(value) => updateEditing({ transactionDate: value })}
              />

              <Text style={styles.inputLabel}>Заметка</Text>
              <TextInput
                style={styles.input}
                placeholder="Например: продукты"
                placeholderTextColor={colors.inkMuted}
                value={editing?.note || ''}
                onChangeText={(value) => updateEditing({ note: value })}
              />

              <Text style={styles.inputLabel}>Теги</Text>
              <TextInput
                style={styles.input}
                placeholder="например: еда, каспи"
                placeholderTextColor={colors.inkMuted}
                value={editing?.tagsText || ''}
                onChangeText={(value) => updateEditing({ tagsText: value })}
              />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={saveEdit}
                disabled={saving}
                activeOpacity={0.86}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Сохранить изменения</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLineLabel}>{label}</Text>
      <Text style={styles.summaryLineValue}>{value}</Text>
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
    paddingBottom: 112,
  },

  contentWide: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
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
    fontWeight: '700',
  },

  headerCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 20,
    marginBottom: 14,
    ...shadow.elevated,
  },

  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitleBlock: {
    flex: 1,
    paddingHorizontal: 14,
  },

  headerOverline: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 3,
  },

  totalHeroRow: {
    flexDirection: 'row',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.xl,
    paddingVertical: 14,
  },

  heroMetric: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },

  heroMetricLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
  },

  heroIncome: {
    color: colors.mint,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  heroExpense: {
    color: colors.coral,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  heroBalance: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  heroDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  tabsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    padding: 8,
    ...shadow.soft,
  },

  tabsContent: {
    paddingRight: 2,
  },

  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginRight: 7,
    backgroundColor: colors.surfaceAlt,
  },

  tabChipActive: {
    backgroundColor: colors.primary,
  },

  tabChipText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 7,
  },

  tabChipTextActive: {
    color: '#FFFFFF',
  },

  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  toolbarButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginHorizontal: 3,
    ...shadow.soft,
  },

  toolbarButtonText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 6,
  },

  cardsGrid: {
    width: '100%',
  },

  cardsGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  halfCard: {
    width: '48.8%',
  },

  fullCard: {
    width: '100%',
  },

  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...shadow.soft,
  },

  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  dayDateCircle: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  dayDateNumber: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
  },

  dayDateWeek: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    marginTop: -1,
  },

  dayTitleBlock: {
    flex: 1,
  },

  dayTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  daySubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },

  dayBalanceBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },

  dayBalanceLabel: {
    color: colors.inkMuted,
    fontSize: 10,
    fontWeight: '800',
  },

  dayBalanceValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },

  dayStatsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },

  dayStatBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 12,
    marginRight: 8,
  },

  dayStatLabel: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 5,
  },

  dayIncome: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: '900',
  },

  dayExpense: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: '900',
  },

  operationRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  operationIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  operationInfo: {
    flex: 1,
    minWidth: 0,
  },

  operationTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },

  operationMeta: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },

  operationCurrencyMeta: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },

  operationAmount: {
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 8,
    maxWidth: 92,
    textAlign: 'right',
  },

  rowActions: {
    flexDirection: 'row',
    marginLeft: 8,
  },

  rowActionButton: {
    width: 31,
    height: 31,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },

  rowDeleteButton: {
    backgroundColor: colors.coralSoft,
  },

  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    ...shadow.soft,
  },

  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },

  calendarWeekText: {
    flex: 1,
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  calendarCell: {
    width: `${100 / 7}%`,
    minHeight: 92,
    padding: 5,
  },

  calendarCellCompact: {
    minHeight: 78,
    padding: 3,
  },

  calendarCellMuted: {
    opacity: 0.38,
  },

  calendarCellToday: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
  },

  calendarDayNumber: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },

  calendarMutedText: {
    color: colors.inkMuted,
  },

  calendarTodayText: {
    color: colors.primary,
  },

  calendarAmounts: {
    marginTop: 6,
  },

  calendarIncome: {
    color: colors.mint,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 3,
  },

  calendarExpense: {
    color: colors.coral,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },

  monthCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...shadow.soft,
  },

  monthCardMuted: {
    opacity: 0.55,
  },

  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  monthLabel: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '900',
  },

  monthSubLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },

  monthBalanceBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 10,
    alignItems: 'flex-end',
  },

  monthBalanceLabel: {
    color: colors.inkMuted,
    fontSize: 10,
    fontWeight: '800',
  },

  monthBalanceValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },

  monthTotalsRow: {
    flexDirection: 'row',
    marginTop: 14,
  },

  monthTotalBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 12,
    marginRight: 8,
  },

  monthTotalLabel: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 5,
  },

  monthIncome: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: '900',
  },

  monthExpense: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: '900',
  },

  weekRow: {
    marginTop: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },

  weekLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },

  weekAmounts: {
    alignItems: 'flex-end',
  },

  weekIncome: {
    color: colors.mint,
    fontSize: 11,
    fontWeight: '900',
  },

  weekExpense: {
    color: colors.coral,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 3,
  },

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...shadow.soft,
  },

  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  summaryIconBox: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  summaryTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  summarySubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  primaryActionButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },

  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  summaryLineLabel: {
    flex: 1,
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '800',
    marginRight: 10,
  },

  summaryLineValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 13,
  },

  categoryName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 7,
  },

  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    overflow: 'hidden',
  },

  progressFill: {
    height: 8,
    backgroundColor: colors.coral,
    borderRadius: 999,
  },

  categoryRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },

  categoryAmount: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: '900',
  },

  categoryPercent: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },

  exportCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.soft,
  },

  exportIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  exportIconText: {
    color: colors.mint,
    fontSize: 20,
    fontWeight: '900',
  },

  exportTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },

  exportSubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },

  emptyInlineText: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '700',
  },

  noteCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },

  noteCardRed: {
    backgroundColor: colors.coralSoft,
  },

  noteCardGreen: {
    backgroundColor: colors.mintSoft,
  },

  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  noteIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  noteIconRed: {
    backgroundColor: '#FFFFFF',
  },

  noteIconGreen: {
    backgroundColor: '#FFFFFF',
  },

  noteTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },

  noteText: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },

  noteAction: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.soft,
  },

  noteActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 10,
    flex: 1,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },

  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  fab: {
    position: 'absolute',
    right: 24,
    bottom: 86,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.elevated,
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
    maxHeight: '92%',
  },

  modalCardWide: {
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    marginBottom: 24,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  modalTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },

  modalClose: {
    color: colors.inkMuted,
    fontSize: 28,
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
    color: colors.inkMuted,
    fontSize: 13,
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
    marginBottom: 14,
  },

  pickerRow: {
    marginBottom: 14,
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
    color: '#FFFFFF',
  },

  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
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
