import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import { askFinanceAi } from '../services/aiChatService';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';

type PeriodMode = 'month' | 'year';

type Transaction = {
  id: string;
  type?: string | null;
  amount?: number | string | null;
  transaction_date?: string | null;
  category_id?: string | null;
  note?: string | null;
};

type Category = {
  id: string;
  name: string | null;
  type?: string | null;
};

type ChartPoint = {
  label: string;
  income: number;
  expense: number;
};

type CategoryStat = {
  id: string;
  name: string;
  amount: number;
  count: number;
  percent: number;
};

type Anomaly = {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  level: 'high' | 'medium';
};

const periodModes: Array<{
  key: PeriodMode;
  title: string;
}> = [
  {
    key: 'month',
    title: 'Месяц',
  },
  {
    key: 'year',
    title: 'Год',
  },
];

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isValidDate = (value: unknown) => {
  if (!value) return false;

  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
};

const getMonthStart = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getYearStart = (date: Date) => {
  return new Date(date.getFullYear(), 0, 1);
};

const getPeriodRange = (mode: PeriodMode, selectedDate: Date) => {
  if (mode === 'month') {
    const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);

    return {
      start,
      end,
    };
  }

  const start = new Date(selectedDate.getFullYear(), 0, 1);
  const end = new Date(selectedDate.getFullYear() + 1, 0, 1);

  return {
    start,
    end,
  };
};

const getPeriodTitle = (mode: PeriodMode, selectedDate: Date) => {
  if (mode === 'month') {
    return selectedDate.toLocaleDateString('ru-KZ', {
      month: 'long',
      year: 'numeric',
    });
  }

  return selectedDate.toLocaleDateString('ru-KZ', {
    year: 'numeric',
  });
};

const formatChartLabel = (date: Date, mode: PeriodMode) => {
  if (mode === 'month') {
    return date.toLocaleDateString('ru-KZ', {
      day: '2-digit',
    });
  }

  return date.toLocaleDateString('ru-KZ', {
    month: 'short',
  });
};

const getChartKey = (date: Date, mode: PeriodMode) => {
  if (mode === 'month') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
};

const buildChartSeed = (mode: PeriodMode, start: Date, end: Date) => {
  const result: Record<string, ChartPoint> = {};
  const cursor = new Date(start);

  while (cursor < end) {
    const key = getChartKey(cursor, mode);

    if (!result[key]) {
      result[key] = {
        label: formatChartLabel(cursor, mode),
        income: 0,
        expense: 0,
      };
    }

    if (mode === 'month') {
      cursor.setDate(cursor.getDate() + 1);
    } else {
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return result;
};

const getScoreLabel = (score: number) => {
  if (score >= 80) return 'Финансы под контролем';
  if (score >= 60) return 'Стабильно, но есть зоны роста';
  if (score >= 40) return 'Нужно усилить контроль';
  return 'Высокий риск перерасхода';
};

const isFutureNextPeriod = (mode: PeriodMode, selectedDate: Date) => {
  const now = new Date();

  if (mode === 'month') {
    const nextMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
    const currentMonth = getMonthStart(now);

    return nextMonth > currentMonth;
  }

  const nextYear = new Date(selectedDate.getFullYear() + 1, 0, 1);
  const currentYear = getYearStart(now);

  return nextYear > currentYear;
};

export default function StatsScreen() {
  const { user } = useAuthStore();

  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');

  const periodTitle = getPeriodTitle(periodMode, selectedDate);
  const canGoNext = !isFutureNextPeriod(periodMode, selectedDate);

  useFocusEffect(
    useCallback(() => {
      loadAnalytics(periodMode, selectedDate);
    }, [user?.id, periodMode, selectedDate])
  );

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};

    categories.forEach((category) => {
      if (category.id) {
        map[category.id] = category.name || 'Без категории';
      }
    });

    return map;
  }, [categories]);

  const loadAnalytics = async (mode: PeriodMode, date: Date) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { start, end } = getPeriodRange(mode, date);

      // Не используем embedded select categories(name), чтобы не зависеть от Foreign Key.
      const [transactionsResult, categoriesResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, type, amount, transaction_date, category_id, note')
          .eq('user_id', user.id)
          .gte('transaction_date', start.toISOString())
          .lt('transaction_date', end.toISOString())
          .order('transaction_date', { ascending: true }),

        supabase
          .from('categories')
          .select('id, name, type')
          .eq('user_id', user.id),
      ]);

      if (transactionsResult.error) throw transactionsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      setTransactions(((transactionsResult.data || []).filter(Boolean)) as Transaction[]);
      setCategories(((categoriesResult.data || []).filter(Boolean)) as Category[]);
      setAiAnalysis('');
    } catch (error) {
      console.error('Ошибка загрузки аналитики:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить аналитику.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const analytics = useMemo(() => {
    const { start, end } = getPeriodRange(periodMode, selectedDate);

    const incomeTransactions = transactions.filter((tx) => tx.type === 'income');
    const expenseTransactions = transactions.filter((tx) => tx.type === 'expense');

    const totalIncome = incomeTransactions.reduce(
      (sum, tx) => sum + safeNumber(tx.amount),
      0
    );

    const totalExpense = expenseTransactions.reduce(
      (sum, tx) => sum + safeNumber(tx.amount),
      0
    );

    const balance = totalIncome - totalExpense;

    const savingRate =
      totalIncome > 0
        ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
        : 0;

    const expenseToIncome =
      totalIncome > 0
        ? Math.round((totalExpense / totalIncome) * 100)
        : totalExpense > 0
          ? 100
          : 0;

    const categoryTotals: Record<
      string,
      {
        id: string;
        name: string;
        amount: number;
        count: number;
      }
    > = {};

    expenseTransactions.forEach((tx) => {
      const categoryId = tx.category_id || 'unknown';
      const categoryName =
        categoryId === 'unknown'
          ? 'Без категории'
          : categoryMap[categoryId] || 'Без категории';

      if (!categoryTotals[categoryId]) {
        categoryTotals[categoryId] = {
          id: categoryId,
          name: categoryName,
          amount: 0,
          count: 0,
        };
      }

      categoryTotals[categoryId].amount += safeNumber(tx.amount);
      categoryTotals[categoryId].count += 1;
    });

    const categoryStats: CategoryStat[] = Object.values(categoryTotals)
      .map((item) => ({
        ...item,
        percent:
          totalExpense > 0 ? Math.round((item.amount / totalExpense) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const chartSeed = buildChartSeed(periodMode, start, end);

    transactions.forEach((tx) => {
      if (!isValidDate(tx.transaction_date)) return;

      const txDate = new Date(String(tx.transaction_date));
      const key = getChartKey(txDate, periodMode);

      if (!chartSeed[key]) {
        chartSeed[key] = {
          label: formatChartLabel(txDate, periodMode),
          income: 0,
          expense: 0,
        };
      }

      if (tx.type === 'income') {
        chartSeed[key].income += safeNumber(tx.amount);
      }

      if (tx.type === 'expense') {
        chartSeed[key].expense += safeNumber(tx.amount);
      }
    });

    let chartData = Object.values(chartSeed);

    if (periodMode === 'month' && chartData.length > 16) {
      chartData = chartData.filter((point, index) => {
        const hasMoney = point.income > 0 || point.expense > 0;
        return hasMoney || index % 3 === 0 || index === chartData.length - 1;
      });
    }

    const maxChartValue = Math.max(
      ...chartData.map((item) => Math.max(item.income, item.expense)),
      1
    );

    const expenseAmounts = expenseTransactions
      .map((tx) => safeNumber(tx.amount))
      .filter((amount) => amount > 0);

    const avgExpense =
      expenseAmounts.length > 0
        ? expenseAmounts.reduce((sum, amount) => sum + amount, 0) / expenseAmounts.length
        : 0;

    const variance =
      expenseAmounts.length > 0
        ? expenseAmounts.reduce((sum, amount) => sum + Math.pow(amount - avgExpense, 2), 0) /
          expenseAmounts.length
        : 0;

    const stdDev = Math.sqrt(variance);

    const anomalies: Anomaly[] = expenseTransactions
      .filter((tx) => {
        const amount = safeNumber(tx.amount);

        if (amount <= 0) return false;
        if (expenseAmounts.length < 3) return amount >= avgExpense * 2 && avgExpense > 0;

        return amount > avgExpense + stdDev * 1.5 || amount >= avgExpense * 2;
      })
      .sort((a, b) => safeNumber(b.amount) - safeNumber(a.amount))
      .slice(0, 5)
      .map((tx) => {
        const amount = safeNumber(tx.amount);
        const categoryName = tx.category_id
          ? categoryMap[tx.category_id] || 'Без категории'
          : 'Без категории';

        return {
          id: tx.id,
          title: tx.note || categoryName,
          subtitle: `${categoryName} · выше среднего расхода`,
          amount,
          level: amount > avgExpense + stdDev * 2 ? 'high' : 'medium',
        };
      });

    let financialScore = 50;

    if (totalIncome > totalExpense) financialScore += 20;
    else if (totalExpense > 0) financialScore -= 20;

    if (savingRate >= 20) financialScore += 20;
    else if (savingRate >= 10) financialScore += 10;
    else if (savingRate < 0) financialScore -= 15;

    if (anomalies.length === 0) financialScore += 10;
    else if (anomalies.length >= 3) financialScore -= 10;

    if (expenseToIncome <= 70 && totalIncome > 0) financialScore += 10;
    else if (expenseToIncome >= 100 && totalIncome > 0) financialScore -= 10;

    financialScore = Math.max(0, Math.min(100, Math.round(financialScore)));

    return {
      totalIncome,
      totalExpense,
      balance,
      savingRate,
      expenseToIncome,
      transactionCount: transactions.length,
      categoryStats,
      chartData,
      maxChartValue,
      anomalies,
      financialScore,
    };
  }, [transactions, categoryMap, periodMode, selectedDate]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics(periodMode, selectedDate);
  };

  const goPrevPeriod = () => {
    setSelectedDate((current) => {
      if (periodMode === 'month') {
        return new Date(current.getFullYear(), current.getMonth() - 1, 1);
      }

      return new Date(current.getFullYear() - 1, 0, 1);
    });
  };

  const goNextPeriod = () => {
    if (!canGoNext) return;

    setSelectedDate((current) => {
      if (periodMode === 'month') {
        return new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }

      return new Date(current.getFullYear() + 1, 0, 1);
    });
  };

  const selectPeriodMode = (mode: PeriodMode) => {
    setPeriodMode(mode);

    setSelectedDate((current) => {
      if (mode === 'month') {
        return new Date(current.getFullYear(), current.getMonth(), 1);
      }

      return new Date(current.getFullYear(), 0, 1);
    });
  };

  const runAiAnalysis = async () => {
    if (!user?.id) return;

    if (transactions.length === 0) {
      Alert.alert('Нет данных', 'За выбранный период нет операций для AI-анализа.');
      return;
    }

    try {
      setAiLoading(true);

      const topCategoriesText = analytics.categoryStats
        .slice(0, 5)
        .map((item) => `${item.name}: ${Math.round(item.amount)} ₸ (${item.percent}%)`)
        .join('; ');

      const anomaliesText = analytics.anomalies
        .map((item) => `${item.title}: ${Math.round(item.amount)} ₸`)
        .join('; ');

      const prompt = `
Сделай краткую AI-аналитику личных финансов пользователя за период: ${periodTitle}.
Режим периода: ${periodMode === 'month' ? 'отдельный месяц' : 'отдельный год'}.
Регион: Казахстан. Валюта: тенге.
Доходы: ${Math.round(analytics.totalIncome)} ₸.
Расходы: ${Math.round(analytics.totalExpense)} ₸.
Баланс: ${Math.round(analytics.balance)} ₸.
Доля расходов к доходам: ${analytics.expenseToIncome}%.
Процент накопления: ${analytics.savingRate}%.
Финансовый рейтинг: ${analytics.financialScore}/100.
Топ категорий расходов: ${topCategoriesText || 'нет данных'}.
Аномальные расходы: ${anomaliesText || 'не обнаружены'}.

Ответь структурой:
1) Краткий вывод
2) Что хорошо
3) Что плохо
4) Какие расходы проверить
5) Что сделать в следующем периоде

Не используй рубли. Только тенге и Казахстан.
`;

      const answer = await askFinanceAi(user.id, prompt);
      setAiAnalysis(answer);
    } catch (error) {
      console.error('Ошибка AI-аналитики:', error);
      Alert.alert('Ошибка', 'Не удалось получить AI-анализ.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка аналитики...</Text>
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
          title="Аналитика"
          subtitle={periodTitle}
          icon="chart"
        />

        <View style={styles.periodTabs}>
          {periodModes.map((mode) => {
            const isActive = periodMode === mode.key;

            return (
              <TouchableOpacity
                key={mode.key}
                style={[styles.periodTab, isActive && styles.periodTabActive]}
                onPress={() => selectPeriodMode(mode.key)}
                activeOpacity={0.86}
              >
                <Text style={[styles.periodTabText, isActive && styles.periodTabTextActive]}>
                  {mode.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.periodNavigator}>
          <TouchableOpacity style={styles.navButton} onPress={goPrevPeriod}>
            <AppIcon name="back" size={18} color={colors.ink} />
          </TouchableOpacity>

          <View style={styles.periodTitleBox}>
            <Text style={styles.periodTitleText}>{periodTitle}</Text>
            <Text style={styles.periodHintText}>
              {periodMode === 'month' ? 'Отдельный месяц' : 'Отдельный год'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.navButton, !canGoNext && styles.navButtonDisabled]}
            onPress={goNextPeriod}
            disabled={!canGoNext}
          >
            <AppIcon
              name="back"
              size={18}
              color={!canGoNext ? colors.inkMuted : colors.ink}
              style={styles.nextIcon}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>Финансовый рейтинг</Text>
            <Text style={styles.heroScore}>{analytics.financialScore}/100</Text>
          </View>

          <Text style={styles.heroTitle}>{getScoreLabel(analytics.financialScore)}</Text>

          <View style={styles.heroLine}>
            <View
              style={[
                styles.heroLineFill,
                {
                  width: `${analytics.financialScore}%`,
                },
              ]}
            />
          </View>

          <Text style={styles.heroText}>
            Расходы составляют {analytics.expenseToIncome}% от доходов.
            Накопление: {analytics.savingRate}%.
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <View style={styles.metricIconGreen}>
              <AppIcon name="wallet" size={20} color={colors.mint} />
            </View>
            <Text style={styles.metricLabel}>Доходы</Text>
            <Text style={styles.incomeText}>{formatKzt(analytics.totalIncome)}</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconRed}>
              <AppIcon name="budget" size={20} color={colors.coral} />
            </View>
            <Text style={styles.metricLabel}>Расходы</Text>
            <Text style={styles.expenseText}>{formatKzt(analytics.totalExpense)}</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconBlue}>
              <AppIcon name="chart" size={20} color={colors.primary} />
            </View>
            <Text style={styles.metricLabel}>Баланс</Text>
            <Text
              style={[
                styles.metricValue,
                analytics.balance >= 0 ? styles.incomeText : styles.expenseText,
              ]}
            >
              {formatKzt(analytics.balance)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconBlue}>
              <AppIcon name="history" size={20} color={colors.primary} />
            </View>
            <Text style={styles.metricLabel}>Операций</Text>
            <Text style={styles.metricValue}>{analytics.transactionCount}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>График доходов и расходов</Text>
              <Text style={styles.sectionSubtitle}>
                {periodMode === 'month'
                  ? 'Сравнение по дням выбранного месяца'
                  : 'Сравнение по месяцам выбранного года'}
              </Text>
            </View>
          </View>

          {analytics.chartData.length === 0 ? (
            <Text style={styles.emptyText}>Нет данных для графика.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chartWrap}>
                {analytics.chartData.map((point, index) => {
                  const incomeHeight =
                    analytics.maxChartValue > 0
                      ? Math.max((point.income / analytics.maxChartValue) * 120, point.income > 0 ? 5 : 0)
                      : 0;

                  const expenseHeight =
                    analytics.maxChartValue > 0
                      ? Math.max((point.expense / analytics.maxChartValue) * 120, point.expense > 0 ? 5 : 0)
                      : 0;

                  return (
                    <View key={`${point.label}-${index}`} style={styles.chartItem}>
                      <View style={styles.barArea}>
                        <View
                          style={[
                            styles.incomeBar,
                            {
                              height: incomeHeight,
                            },
                          ]}
                        />
                        <View
                          style={[
                            styles.expenseBar,
                            {
                              height: expenseHeight,
                            },
                          ]}
                        />
                      </View>

                      <Text style={styles.chartLabel}>{point.label}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.mint }]} />
              <Text style={styles.legendText}>Доходы</Text>
            </View>

            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.coral }]} />
              <Text style={styles.legendText}>Расходы</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Аномальные расходы</Text>
              <Text style={styles.sectionSubtitle}>
                Крупные операции выше обычного уровня за выбранный период
              </Text>
            </View>
          </View>

          {analytics.anomalies.length === 0 ? (
            <View style={styles.safeBox}>
              <AppIcon name="target" size={22} color={colors.mint} />
              <Text style={styles.safeText}>Явных аномальных расходов не найдено.</Text>
            </View>
          ) : (
            analytics.anomalies.map((item) => (
              <View key={item.id} style={styles.anomalyItem}>
                <View
                  style={[
                    styles.anomalyIcon,
                    item.level === 'high' ? styles.anomalyHigh : styles.anomalyMedium,
                  ]}
                >
                  <AppIcon
                    name="budget"
                    size={20}
                    color={item.level === 'high' ? colors.coral : colors.amber}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.anomalyTitle}>{item.title}</Text>
                  <Text style={styles.anomalySubtitle}>{item.subtitle}</Text>
                </View>

                <Text style={styles.anomalyAmount}>{formatKzt(item.amount)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Расходы по категориям</Text>

          {analytics.categoryStats.length === 0 ? (
            <Text style={styles.emptyText}>Расходов за выбранный период пока нет.</Text>
          ) : (
            analytics.categoryStats.map((item, index) => (
              <View key={item.id} style={styles.categoryItem}>
                <View style={styles.indexBox}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.categoryTop}>
                    <Text style={styles.categoryName}>{item.name}</Text>
                    <Text style={styles.categoryAmount}>{formatKzt(item.amount)}</Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(item.percent, 100)}%`,
                        },
                      ]}
                    />
                  </View>

                  <Text style={styles.categoryPercent}>
                    {item.percent}% · {item.count} операций
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIconBox}>
              <AppIcon name="ai" size={24} color="#FFFFFF" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.aiTitle}>AI-аналитика за период</Text>
              <Text style={styles.aiSubtitle}>
                Выводы и рекомендации по выбранному месяцу или году
              </Text>
            </View>
          </View>

          {!!aiAnalysis && <Text style={styles.aiText}>{aiAnalysis}</Text>}

          <TouchableOpacity
            style={[styles.aiButton, aiLoading && styles.aiButtonDisabled]}
            onPress={runAiAnalysis}
            disabled={aiLoading}
            activeOpacity={0.86}
          >
            {aiLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.aiButtonText}>
                {aiAnalysis ? 'Обновить AI-анализ' : 'Получить AI-анализ'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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

  periodTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },

  periodTab: {
    flex: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: 11,
  },

  periodTabActive: {
    backgroundColor: colors.primary,
  },

  periodTabText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },

  periodTabTextActive: {
    color: '#FFFFFF',
  },

  periodNavigator: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.soft,
  },

  navButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  navButtonDisabled: {
    opacity: 0.35,
  },

  nextIcon: {
    transform: [{ rotate: '180deg' }],
  },

  periodTitleBox: {
    flex: 1,
    alignItems: 'center',
  },

  periodTitleText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
    textTransform: 'capitalize',
  },

  periodHintText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
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

  heroScore: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
  },

  heroLine: {
    marginTop: 14,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    overflow: 'hidden',
  },

  heroLineFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },

  heroText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 12,
  },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    ...shadow.soft,
  },

  metricIconGreen: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  metricIconRed: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  metricIconBlue: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  metricLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },

  metricValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },

  incomeText: {
    color: colors.mint,
    fontSize: 18,
    fontWeight: '900',
  },

  expenseText: {
    color: colors.coral,
    fontSize: 18,
    fontWeight: '900',
  },

  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },

  sectionHeader: {
    marginBottom: 14,
  },

  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },

  sectionSubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 3,
  },

  emptyText: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },

  chartWrap: {
    height: 164,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingRight: 8,
  },

  chartItem: {
    width: 34,
    alignItems: 'center',
    marginRight: 8,
  },

  barArea: {
    height: 126,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  incomeBar: {
    width: 10,
    borderRadius: 999,
    backgroundColor: colors.mint,
    marginRight: 3,
  },

  expenseBar: {
    width: 10,
    borderRadius: 999,
    backgroundColor: colors.coral,
  },

  chartLabel: {
    color: colors.inkMuted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 7,
    textTransform: 'capitalize',
  },

  legendRow: {
    flexDirection: 'row',
    marginTop: 8,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 18,
  },

  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
    marginRight: 6,
  },

  legendText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
  },

  safeBox: {
    backgroundColor: colors.mintSoft,
    borderRadius: radius.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  safeText: {
    color: colors.mint,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '900',
    marginLeft: 10,
    flex: 1,
  },

  anomalyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  anomalyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  anomalyHigh: {
    backgroundColor: colors.coralSoft,
  },

  anomalyMedium: {
    backgroundColor: colors.amberSoft,
  },

  anomalyTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },

  anomalySubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  anomalyAmount: {
    color: colors.coral,
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 8,
  },

  categoryItem: {
    flexDirection: 'row',
    marginBottom: 14,
  },

  indexBox: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  indexText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },

  categoryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  categoryName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    flex: 1,
  },

  categoryAmount: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 8,
  },

  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },

  categoryPercent: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },

  aiCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xl,
    padding: 18,
    ...shadow.elevated,
  },

  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  aiIconBox: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  aiTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },

  aiSubtitle: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 3,
  },

  aiText: {
    color: '#E5E7EB',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    marginBottom: 14,
  },

  aiButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },

  aiButtonDisabled: {
    opacity: 0.7,
  },

  aiButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
