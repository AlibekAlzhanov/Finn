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
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import { askFinanceAi } from '../services/aiChatService';
import {
  FinanceIntelligenceLoadResult,
  loadFinanceIntelligenceForPeriod,
} from '../services/financeIntelligenceDataService';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';
import AiInsightCard from '../components/insights/AiInsightCard';
import EmptyState from '../components/common/EmptyState';

type PeriodMode = 'month' | 'year';

const periodModes: Array<{ key: PeriodMode; title: string }> = [
  { key: 'month', title: 'Месяц' },
  { key: 'year', title: 'Год' },
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

const getPeriodRange = (mode: PeriodMode, selectedDate: Date) => {
  if (mode === 'month') {
    return {
      start: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
      end: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1),
    };
  }

  return {
    start: new Date(selectedDate.getFullYear(), 0, 1),
    end: new Date(selectedDate.getFullYear() + 1, 0, 1),
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

const getChartKey = (date: Date, mode: PeriodMode) => {
  if (mode === 'month') {
    return String(date.getDate()).padStart(2, '0');
  }

  return date.toLocaleDateString('ru-KZ', { month: 'short' });
};

const isFutureNextPeriod = (mode: PeriodMode, selectedDate: Date) => {
  const now = new Date();

  if (mode === 'month') {
    const nextMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return nextMonth > currentMonth;
  }

  const nextYear = new Date(selectedDate.getFullYear() + 1, 0, 1);
  const currentYear = new Date(now.getFullYear(), 0, 1);
  return nextYear > currentYear;
};

export default function StatsScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();

  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [data, setData] = useState<FinanceIntelligenceLoadResult | null>(null);

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

  const loadAnalytics = async (mode: PeriodMode, date: Date) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { start, end } = getPeriodRange(mode, date);

      const result = await loadFinanceIntelligenceForPeriod({
        userId: user.id,
        periodStart: start,
        periodEnd: end,
      });

      setData(result);
      setAiAnalysis('');
    } catch (error) {
      console.error('Ошибка загрузки аналитики:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить аналитику.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const chartData = useMemo(() => {
    const result: Record<string, { label: string; income: number; expense: number }> = {};
    const { start, end } = getPeriodRange(periodMode, selectedDate);

    const cursor = new Date(start);

    while (cursor < end) {
      const key = getChartKey(cursor, periodMode);

      if (!result[key]) {
        result[key] = {
          label: key,
          income: 0,
          expense: 0,
        };
      }

      if (periodMode === 'month') cursor.setDate(cursor.getDate() + 1);
      else cursor.setMonth(cursor.getMonth() + 1);
    }

    (data?.raw.transactions || []).forEach((tx) => {
      if (!isValidDate(tx.transaction_date)) return;

      const date = new Date(String(tx.transaction_date));
      if (date < start || date >= end) return;

      const key = getChartKey(date, periodMode);

      if (!result[key]) {
        result[key] = {
          label: key,
          income: 0,
          expense: 0,
        };
      }

      if (tx.type === 'income') result[key].income += safeNumber(tx.amount);
      if (tx.type === 'expense') result[key].expense += safeNumber(tx.amount);
    });

    let values = Object.values(result);

    if (periodMode === 'month' && values.length > 16) {
      values = values.filter((point, index) => {
        const hasMoney = point.income > 0 || point.expense > 0;
        return hasMoney || index % 3 === 0 || index === values.length - 1;
      });
    }

    return values;
  }, [data, periodMode, selectedDate]);

  const maxChartValue = Math.max(
    ...chartData.map((item) => Math.max(item.income, item.expense)),
    1
  );

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
    if (!user?.id || !data?.intelligence) return;

    if (data.intelligence.transactionsCount === 0) {
      Alert.alert('Нет данных', 'За выбранный период нет операций для AI-анализа.');
      return;
    }

    try {
      setAiLoading(true);

      const intelligence = data.intelligence;

      const topCategoriesText = intelligence.topExpenseCategories
        .slice(0, 5)
        .map((item) => `${item.name}: ${Math.round(item.amount)} ₸ (${item.percent}%)`)
        .join('; ');

      const anomaliesText = intelligence.anomalies
        .map((item) => `${item.title}: ${Math.round(item.amount)} ₸`)
        .join('; ');

      const prompt = `
Сделай краткую AI-аналитику личных финансов пользователя за период: ${periodTitle}.
Регион: Казахстан. Валюта: тенге.
Доходы: ${Math.round(intelligence.totalIncome)} ₸.
Расходы: ${Math.round(intelligence.totalExpense)} ₸.
Баланс: ${Math.round(intelligence.balance)} ₸.
Доля расходов к доходам: ${intelligence.expensePercent}%.
Процент накопления: ${intelligence.savingRate}%.
Финансовый рейтинг: ${intelligence.financialScore}/100.
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

      const { start, end } = getPeriodRange(periodMode, selectedDate);

      const answer = await askFinanceAi({
        userId: user.id,
        question: prompt,
        periodStart: start,
        periodEnd: end,
        mode: 'analytics',
      });

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

  const intelligence = data?.intelligence;

  if (!intelligence) {
    return (
      <View style={styles.emptyScreen}>
        <EmptyState
          title="Аналитика недоступна"
          description="Не удалось загрузить финансовые данные. Проверь интернет или попробуй обновить экран."
          icon="chart"
          actionLabel="Повторить"
          onAction={() => loadAnalytics(periodMode, selectedDate)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScreenHeader title="Аналитика" subtitle={periodTitle} icon="chart" />

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
            <Text style={styles.heroLabel}>Финансовое состояние</Text>
            <Text style={styles.heroScore}>{intelligence.financialScore}/100</Text>
          </View>

          <Text style={styles.heroTitle}>{intelligence.financialScoreLabel}</Text>

          <View style={styles.heroLine}>
            <View
              style={[
                styles.heroLineFill,
                { width: `${intelligence.financialScore}%` },
              ]}
            />
          </View>

          <Text style={styles.heroText}>
            Расходы составляют {intelligence.expensePercent}% от доходов.
            Накопление: {intelligence.savingRate}%.
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Доходы</Text>
            <Text style={styles.incomeText}>{formatKzt(intelligence.totalIncome)}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Расходы</Text>
            <Text style={styles.expenseText}>{formatKzt(intelligence.totalExpense)}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Баланс</Text>
            <Text style={intelligence.balance >= 0 ? styles.incomeText : styles.expenseText}>
              {formatKzt(intelligence.balance)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Операций</Text>
            <Text style={styles.metricValue}>{intelligence.transactionsCount}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>График доходов и расходов</Text>

          {chartData.length === 0 || intelligence.transactionsCount === 0 ? (
            <EmptyState
              title="График пока пустой"
              description="Добавь операции за выбранный период, и здесь появится динамика доходов и расходов."
              icon="chart"
              actionLabel="Добавить операцию"
              onAction={() => (navigation as any).navigate('AddAction')}
              compact
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chartWrap}>
                {chartData.map((point, index) => {
                  const incomeHeight = Math.max(
                    (point.income / maxChartValue) * 120,
                    point.income > 0 ? 5 : 0
                  );

                  const expenseHeight = Math.max(
                    (point.expense / maxChartValue) * 120,
                    point.expense > 0 ? 5 : 0
                  );

                  return (
                    <View key={`${point.label}-${index}`} style={styles.chartItem}>
                      <View style={styles.barArea}>
                        <View style={[styles.incomeBar, { height: incomeHeight }]} />
                        <View style={[styles.expenseBar, { height: expenseHeight }]} />
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
          <Text style={styles.sectionTitle}>Почему такой рейтинг</Text>

          {intelligence.scoreFactors.length === 0 ? (
            <EmptyState
              title="Пока мало данных"
              description="Когда появятся доходы и расходы, FinBuddy объяснит финансовый рейтинг по факторам."
              icon="report"
              compact
            />
          ) : (
            intelligence.scoreFactors.map((factor) => (
              <View key={factor.id} style={styles.factorItem}>
                <View style={styles.factorTop}>
                  <Text style={styles.factorTitle}>{factor.title}</Text>
                  <Text style={factor.impact >= 0 ? styles.factorPositive : styles.factorNegative}>
                    {factor.impact > 0 ? '+' : ''}
                    {factor.impact}
                  </Text>
                </View>
                <Text style={styles.factorText}>{factor.description}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Аномальные расходы</Text>

          {intelligence.anomalies.length === 0 ? (
            <EmptyState
              title="Аномалий не найдено"
              description="За выбранный период нет расходов, которые резко выбиваются из обычного поведения."
              icon="target"
              tone="success"
              compact
            />
          ) : (
            intelligence.anomalies.map((item) => (
              <View key={item.id} style={styles.anomalyItem}>
                <View style={item.level === 'high' ? styles.anomalyHigh : styles.anomalyMedium}>
                  <AppIcon
                    name="budget"
                    size={20}
                    color={item.level === 'high' ? colors.coral : colors.amber}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.anomalyTitle}>{item.title}</Text>
                  <Text style={styles.anomalySubtitle}>{item.reason}</Text>
                </View>

                <Text style={styles.anomalyAmount}>{formatKzt(item.amount)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Расходы по категориям</Text>

          {intelligence.topExpenseCategories.length === 0 ? (
            <EmptyState
              title="Расходов пока нет"
              description="Добавь расходы за выбранный период, чтобы увидеть категории и доли."
              icon="budget"
              actionLabel="Добавить расход"
              onAction={() => navigation.navigate('AddAction')}
              compact
            />
          ) : (
            intelligence.topExpenseCategories.map((item, index) => (
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
                        { width: `${Math.min(item.percent, 100)}%` },
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

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Что важно сейчас</Text>

          {intelligence.insights.length === 0 ? (
            <EmptyState
              title="Инсайтов пока нет"
              description="FinBuddy сформирует выводы после появления доходов, расходов, бюджетов или подписок."
              icon="ai"
              compact
            />
          ) : (
            intelligence.insights.slice(0, 3).map((insight) => (
              <AiInsightCard
                key={insight.id}
                insight={insight}
                style={{ marginBottom: 10 }}
              />
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
                Выводы и рекомендации по выбранному периоду
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 36 },

  emptyScreen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 24,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: { marginTop: 12, color: colors.inkMuted, fontSize: 14, fontWeight: '700' },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginBottom: 12 },

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
  periodTab: { flex: 1, borderRadius: radius.md, alignItems: 'center', paddingVertical: 11 },
  periodTabActive: { backgroundColor: colors.primary },
  periodTabText: { color: colors.inkMuted, fontSize: 12, fontWeight: '900' },
  periodTabTextActive: { color: '#FFFFFF' },

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
  navButtonDisabled: { opacity: 0.35 },
  nextIcon: { transform: [{ rotate: '180deg' }] },
  periodTitleBox: { flex: 1, alignItems: 'center' },
  periodTitleText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  periodHintText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 22,
    marginBottom: 14,
    ...shadow.elevated,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '800' },
  heroScore: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 10 },
  heroLine: {
    marginTop: 14,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  heroLineFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 999 },
  heroText: { color: '#CBD5E1', fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 12 },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
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
  metricLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: '800', marginBottom: 5 },
  metricValue: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  incomeText: { color: colors.mint, fontSize: 18, fontWeight: '900' },
  expenseText: { color: colors.coral, fontSize: 18, fontWeight: '900' },

  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.inkMuted, lineHeight: 20, fontWeight: '700' },

  chartWrap: { height: 170, flexDirection: 'row', alignItems: 'flex-end', paddingTop: 20 },
  chartItem: { width: 36, alignItems: 'center', marginRight: 8 },
  barArea: {
    height: 125,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  incomeBar: { width: 9, borderRadius: 999, backgroundColor: colors.mint, marginRight: 3 },
  expenseBar: { width: 9, borderRadius: 999, backgroundColor: colors.coral },
  chartLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '800', marginTop: 8 },
  legendRow: { flexDirection: 'row', marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 15 },
  legendDot: { width: 9, height: 9, borderRadius: 999, marginRight: 6 },
  legendText: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' },

  factorItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 9,
  },
  factorTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  factorTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', flex: 1 },
  factorPositive: { color: colors.mint, fontSize: 14, fontWeight: '900', marginLeft: 8 },
  factorNegative: { color: colors.coral, fontSize: 14, fontWeight: '900', marginLeft: 8 },
  factorText: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, fontWeight: '700' },

  safeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.mintSoft,
    borderRadius: radius.lg,
    padding: 13,
  },
  safeText: { color: colors.mint, fontSize: 13, fontWeight: '900', marginLeft: 8 },

  anomalyItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  anomalyHigh: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  anomalyMedium: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  anomalyTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  anomalySubtitle: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  anomalyAmount: { color: colors.ink, fontSize: 13, fontWeight: '900', marginLeft: 8 },

  categoryItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  indexBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  indexText: { color: colors.primary, fontWeight: '900' },
  categoryTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  categoryName: { color: colors.ink, fontSize: 14, fontWeight: '900', flex: 1 },
  categoryAmount: { color: colors.ink, fontSize: 13, fontWeight: '900', marginLeft: 8 },
  progressTrack: { height: 8, backgroundColor: colors.surfaceSoft, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 999 },
  categoryPercent: { color: colors.inkMuted, fontSize: 12, fontWeight: '700', marginTop: 6 },

  aiCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 18,
    ...shadow.elevated,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  aiIconBox: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  aiSubtitle: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', marginTop: 2 },
  aiText: { color: '#E5E7EB', fontSize: 13, lineHeight: 20, fontWeight: '700', marginBottom: 12 },
  aiButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  aiButtonDisabled: { opacity: 0.65 },
  aiButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
