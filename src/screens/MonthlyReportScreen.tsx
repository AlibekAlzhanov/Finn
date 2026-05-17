import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import {
  MonthlyReportData,
  buildPlainTextMonthlyReport,
  loadMonthlyReport,
} from '../services/reportService';
import { AiInsight } from '../services/financeIntelligenceService';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';
import AiInsightCard from '../components/insights/AiInsightCard';
import EmptyState from '../components/common/EmptyState';

const getScoreColor = (score: number) => {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.primary;
  if (score >= 40) return colors.warning;
  return colors.danger;
};

export default function MonthlyReportScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [report, setReport] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user?.id])
  );

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const result = await loadMonthlyReport(user.id);
      setReport(result);
    } catch (error) {
      console.error('Ошибка экрана месячного отчета:', error);
      Alert.alert('Ошибка', 'Не удалось сформировать отчет.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const showTextReport = () => {
    if (!report) return;
    Alert.alert('Текст отчета', buildPlainTextMonthlyReport(report));
  };

  const handleInsightAction = (insight: AiInsight) => {
    if (!insight.actionRoute) return;
    navigation.navigate(insight.actionRoute, insight.actionPayload || undefined);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Формирую отчет...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.emptyScreen}>
        <EmptyState
          title="Отчёт недоступен"
          description="Не удалось сформировать отчёт. Попробуй обновить экран или добавить операции."
          icon="report"
          actionLabel="Повторить"
          onAction={loadData}
        />
      </View>
    );
  }

  const scoreColor = getScoreColor(report.financialScore);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScreenHeader
          title="Отчет"
          subtitle={report.periodName}
          rightText="TXT"
          onRightPress={showTextReport}
          back
        />

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Финансовое состояние</Text>
          <Text style={[styles.heroScore, { color: scoreColor }]}>
            {report.financialScore}/100
          </Text>
          <Text style={styles.heroTitle}>{report.financialScoreLabel}</Text>
          <Text style={styles.heroText}>{report.conclusion}</Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Доходы</Text>
            <Text style={[styles.metricValue, styles.incomeText]}>
              {formatKzt(report.totalIncome)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Расходы</Text>
            <Text style={[styles.metricValue, styles.expenseText]}>
              {formatKzt(report.totalExpense)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Остаток</Text>
            <Text
              style={[
                styles.metricValue,
                report.balance >= 0 ? styles.incomeText : styles.expenseText,
              ]}
            >
              {formatKzt(report.balance)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Операций</Text>
            <Text style={styles.metricValue}>{report.transactionsCount}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Почему такой рейтинг</Text>

          {report.scoreFactors.length === 0 ? (
            <EmptyState
              title="Пока мало данных"
              description="Когда появятся операции, FinBuddy объяснит, почему рейтинг стал именно таким."
              icon="report"
              compact
            />
          ) : (
            report.scoreFactors.map((factor) => (
              <View key={factor.id} style={styles.factorItem}>
                <View style={styles.rowBetween}>
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
          <Text style={styles.sectionTitle}>Прогноз</Text>

          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Средний расход в день</Text>
            <Text style={styles.rowValue}>{formatKzt(report.dailyAverageExpense)}</Text>
          </View>

          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Прогноз до конца месяца</Text>
            <Text style={styles.rowValue}>{formatKzt(report.forecastExpense)}</Text>
          </View>

          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Безопасный дневной лимит</Text>
            <Text style={styles.rowValue}>{formatKzt(report.dailySafeLimit)}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Что важно сейчас</Text>

          {report.insights.length === 0 ? (
            <EmptyState
              title="Инсайтов пока нет"
              description="Добавь больше операций, бюджетов или подписок, чтобы FinBuddy сформировал персональные выводы."
              icon="ai"
              compact
            />
          ) : (
            report.insights.slice(0, 4).map((insight) => (
              <AiInsightCard
                key={insight.id}
                insight={insight}
                onAction={handleInsightAction}
                style={{ marginBottom: 10 }}
              />
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Аномальные расходы</Text>

          {report.anomalies.length === 0 ? (
            <EmptyState
              title="Аномалий не найдено"
              description="Крупных расходов, которые резко выбиваются из обычного уровня, не обнаружено."
              icon="target"
              tone="success"
              compact
            />
          ) : (
            report.anomalies.slice(0, 5).map((item) => (
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
          <Text style={styles.sectionTitle}>Топ расходов</Text>

          {report.topExpenseCategories.length === 0 ? (
            <EmptyState
              title="Расходов пока нет"
              description="Добавь расходы за месяц, чтобы отчёт показал топ категорий."
              icon="budget"
              actionLabel="Добавить расход"
              onAction={() => navigation.navigate('AddAction')}
              compact
            />
          ) : (
            report.topExpenseCategories.slice(0, 5).map((item, index) => (
              <View key={item.id} style={styles.categoryRow}>
                <View style={styles.indexBox}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryName}>{item.name}</Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(item.percent, 100)}%` },
                      ]}
                    />
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

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Бюджеты</Text>

          {report.budgetStatuses.length === 0 ? (
            <EmptyState
              title="Бюджеты пока не установлены"
              description="Создай лимиты по категориям, чтобы FinBuddy отслеживал риск перерасхода."
              icon="budget"
              actionLabel="Создать бюджет"
              onAction={() => navigation.navigate('Budgets')}
              compact
            />
          ) : (
            report.budgetStatuses.slice(0, 5).map((budget) => (
              <View key={budget.id} style={styles.compactItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.compactTitle}>{budget.categoryName}</Text>
                  <Text style={styles.compactValue}>{budget.percent}%</Text>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(budget.percent, 100)}%`,
                        backgroundColor:
                          budget.status === 'exceeded'
                            ? colors.danger
                            : budget.status === 'warning'
                              ? colors.warning
                              : colors.success,
                      },
                    ]}
                  />
                </View>

                <Text style={styles.compactSubtext}>
                  {formatKzt(budget.spentAmount)} / {formatKzt(budget.limitAmount)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Цели</Text>

          {report.goalStatuses.length === 0 ? (
            <EmptyState
              title="Цели пока не созданы"
              description="Добавь финансовую цель, чтобы видеть прогресс накоплений в отчёте."
              icon="target"
              actionLabel="Создать цель"
              onAction={() => navigation.navigate('Goals')}
              compact
            />
          ) : (
            report.goalStatuses.slice(0, 5).map((goal) => (
              <View key={goal.id} style={styles.compactItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.compactTitle}>{goal.title}</Text>
                  <Text style={styles.compactValue}>{goal.progress}%</Text>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(goal.progress, 100)}%` },
                    ]}
                  />
                </View>

                <Text style={styles.compactSubtext}>
                  {formatKzt(goal.currentAmount)} / {formatKzt(goal.targetAmount)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.recommendationCard}>
          <Text style={styles.recommendationTitle}>План действий</Text>
          <Text style={styles.recommendationText}>{report.recommendation}</Text>
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
  loadingText: { marginTop: 12, fontSize: 14, color: colors.textMuted },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: 14,
  },
  retryButtonText: { color: '#FFF', fontWeight: '900' },

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 22,
    marginBottom: 14,
    ...shadow.strong,
  },
  heroLabel: { color: '#CBD5E1', fontSize: 14, marginBottom: 4 },
  heroScore: { fontSize: 44, fontWeight: '900' },
  heroTitle: { color: '#FFF', fontSize: 18, fontWeight: '900', marginTop: 2 },
  heroText: { color: '#CBD5E1', fontSize: 14, lineHeight: 20, marginTop: 10 },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  metricLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 7, fontWeight: '800' },
  metricValue: { fontSize: 18, fontWeight: '900', color: colors.text },
  incomeText: { color: colors.success },
  expenseText: { color: colors.danger },

  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: 14 },
  emptyText: { fontSize: 14, color: colors.textMuted, lineHeight: 20, fontWeight: '700' },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 14, color: colors.textMuted, marginBottom: 10, flex: 1, fontWeight: '700' },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '900', marginBottom: 10 },

  factorItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 9,
  },
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

  categoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
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
  categoryName: { fontSize: 14, color: colors.text, fontWeight: '900', marginBottom: 6 },
  progressTrack: { height: 8, backgroundColor: colors.surfaceSoft, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 999 },
  categoryRight: { marginLeft: 10, alignItems: 'flex-end' },
  categoryAmount: { fontSize: 13, color: colors.text, fontWeight: '900' },
  categoryPercent: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  compactItem: { marginBottom: 14 },
  compactTitle: { fontSize: 14, color: colors.text, fontWeight: '900', marginBottom: 8, flex: 1 },
  compactValue: { fontSize: 14, color: colors.primary, fontWeight: '900', marginBottom: 8 },
  compactSubtext: { fontSize: 12, color: colors.textMuted, fontWeight: '700', marginTop: 6 },

  recommendationCard: {
    backgroundColor: colors.surfaceBlue,
    borderRadius: radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  recommendationTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primaryDark,
    marginBottom: 7,
  },
  recommendationText: {
    fontSize: 14,
    color: colors.primaryDark,
    lineHeight: 20,
    fontWeight: '700',
  },
});
