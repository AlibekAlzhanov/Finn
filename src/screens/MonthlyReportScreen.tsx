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
import { useFocusEffect } from '@react-navigation/native';

import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import {
  MonthlyReportData,
  buildPlainTextMonthlyReport,
  loadMonthlyReport,
} from '../services/reportService';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';

const getScoreColor = (score: number) => {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.primary;
  if (score >= 40) return colors.warning;
  return colors.danger;
};

export default function MonthlyReportScreen() {
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
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyTitle}>Отчет недоступен</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <Text style={styles.retryButtonText}>Повторить</Text>
        </TouchableOpacity>
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
          <Text style={styles.heroLabel}>Финансовый рейтинг</Text>
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
          <Text style={styles.sectionTitle}>Топ расходов</Text>

          {report.topExpenseCategories.length === 0 ? (
            <Text style={styles.emptyText}>Расходов за месяц пока нет.</Text>
          ) : (
            report.topExpenseCategories.slice(0, 5).map((item, index) => (
              <View key={item.name} style={styles.categoryRow}>
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
            <Text style={styles.emptyText}>Бюджеты пока не установлены.</Text>
          ) : (
            report.budgetStatuses.slice(0, 5).map((budget) => (
              <View key={budget.categoryId} style={styles.compactItem}>
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
            <Text style={styles.emptyText}>Финансовые цели пока не созданы.</Text>
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
          <Text style={styles.recommendationTitle}>Рекомендация</Text>
          <Text style={styles.recommendationText}>{report.recommendation}</Text>
        </View>
      </ScrollView>
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
    padding: 24,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },

  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: 14,
  },

  retryButtonText: {
    color: '#FFF',
    fontWeight: '900',
  },

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 22,
    marginBottom: 14,
    ...shadow.strong,
  },

  heroLabel: {
    color: '#CBD5E1',
    fontSize: 14,
    marginBottom: 4,
  },

  heroScore: {
    fontSize: 44,
    fontWeight: '900',
  },

  heroTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },

  heroText: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

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

  metricLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 7,
    fontWeight: '800',
  },

  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },

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

  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 14,
  },

  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  rowLabel: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 10,
    flex: 1,
    fontWeight: '700',
  },

  rowValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '900',
    marginBottom: 10,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },

  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  indexBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  indexText: {
    color: colors.primary,
    fontWeight: '900',
  },

  categoryName: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '900',
    marginBottom: 6,
  },

  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 999,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },

  categoryRight: {
    marginLeft: 10,
    alignItems: 'flex-end',
  },

  categoryAmount: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '900',
  },

  categoryPercent: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  compactItem: {
    marginBottom: 14,
  },

  compactTitle: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '900',
    marginBottom: 8,
    flex: 1,
  },

  compactValue: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '900',
    marginBottom: 8,
  },

  compactSubtext: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: 6,
  },

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
    marginBottom: 8,
  },

  recommendationText: {
    fontSize: 14,
    color: colors.primaryDark,
    lineHeight: 20,
    fontWeight: '700',
  },
});
