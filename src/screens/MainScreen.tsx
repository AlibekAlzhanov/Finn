import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

import { useAuthStore } from '../store/useAuthStore';
import { formatKzt } from '../services/financeConfig';
import {
  FinanceIntelligenceLoadResult,
  loadCurrentMonthFinanceIntelligence,
} from '../services/financeIntelligenceDataService';
import { AiInsight } from '../services/financeIntelligenceService';
import { colors, radius, shadow, typography } from '../theme';
import AppIcon from '../components/ui/AppIcon';
import AiInsightsSection from '../components/insights/AiInsightsSection';
import EmptyState from '../components/common/EmptyState';

const getScoreStatus = (score: number) => {
  if (score >= 80) return 'Отлично';
  if (score >= 60) return 'Стабильно';
  if (score >= 40) return 'Контроль';
  return 'Риск';
};

export default function MainScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [intelligenceData, setIntelligenceData] =
    useState<FinanceIntelligenceLoadResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const intelligence = intelligenceData?.intelligence;
  const totalBalance = intelligenceData?.totalBalance || 0;
  const monthIncome = intelligence?.totalIncome || 0;
  const monthExpense = intelligence?.totalExpense || 0;
  const financialScore = intelligence?.financialScore || 0;
  const dailySafeLimit = intelligence?.dailySafeLimit || 0;
  const expensePercent = intelligence?.expensePercent || 0;
  const forecastExpense = intelligence?.forecastExpense || 0;
  const forecastDiff = intelligence?.forecastDiff || 0;
  const topCategory = intelligence?.topExpenseCategories?.[0];
  const insights = intelligence?.insights || [];

  const loadDashboard = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const result = await loadCurrentMonthFinanceIntelligence(user.id, {
        autoChargeSubscriptions: true,
      });

      setIntelligenceData(result);
    } catch (error) {
      console.error('Ошибка загрузки главной:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить главную страницу.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
  };

  const handleInsightAction = (insight: AiInsight) => {
    if (!insight.actionRoute) return;
    navigation.navigate(insight.actionRoute, insight.actionPayload || undefined);
  };

  const openAllInsights = () => {
    navigation.navigate('AiInsights');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка финансов...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>FINBUDDY</Text>
            <Text style={styles.title}>Обзор</Text>
          </View>

          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => navigation.navigate('History')}
            activeOpacity={0.86}
          >
            <AppIcon name="history" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.cardTopLine}>
            <Text style={styles.cardLabel}>Доступный баланс</Text>

            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>
                {financialScore}/100 · {getScoreStatus(financialScore)}
              </Text>
            </View>
          </View>

          <Text style={styles.balanceAmount}>{formatKzt(totalBalance)}</Text>

          <Text style={styles.scoreDescription}>
            {intelligence?.financialScoreLabel ||
              'Добавьте операции, чтобы FinBuddy оценил состояние.'}
          </Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={styles.metricIconBoxGreen}>
              <AppIcon name="wallet" size={20} color={colors.mint} />
            </View>
            <Text style={styles.metricLabel}>Доходы</Text>
            <Text style={styles.incomeText}>{formatKzt(monthIncome)}</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconBoxRed}>
              <AppIcon name="budget" size={20} color={colors.coral} />
            </View>
            <Text style={styles.metricLabel}>Расходы</Text>
            <Text style={styles.expenseText}>{formatKzt(monthExpense)}</Text>
          </View>
        </View>

        <View style={styles.todayCard}>
          <View style={styles.todayItem}>
            <Text style={styles.todayLabel}>Можно тратить сегодня</Text>
            <Text style={styles.todayValue}>{formatKzt(dailySafeLimit)}</Text>
          </View>

          <View style={styles.todayDivider} />

          <View style={styles.todayItem}>
            <Text style={styles.todayLabel}>Расходы от дохода</Text>
            <Text style={styles.todayValue}>{expensePercent}%</Text>
          </View>
        </View>

        {(!intelligence || intelligence.transactionsCount === 0) && (
          <EmptyState
            title="Пока нет операций"
            description="Добавь первый доход или расход, и FinBuddy начнёт строить прогноз, искать риски и показывать AI-инсайты."
            icon="plus"
            actionLabel="Добавить операцию"
            onAction={() => navigation.navigate('AddAction')}
            style={styles.emptyStateBlock}
          />
        )}

        <AiInsightsSection
          insights={insights}
          onAction={handleInsightAction}
          onOpenAll={openAllInsights}
          maxPreview={3}
          style={styles.insightsSection}
        />

        <View style={styles.forecastCard}>
          <View style={{ flex: 1 }}>
            <View style={styles.forecastTitleRow}>
              <Text style={styles.forecastLabel}>Прогноз до конца месяца</Text>

              <View
                style={[
                  styles.forecastStatus,
                  forecastDiff > 0 ? styles.forecastStatusRisk : styles.forecastStatusOk,
                ]}
              >
                <Text
                  style={[
                    styles.forecastStatusText,
                    forecastDiff > 0
                      ? styles.forecastStatusTextRisk
                      : styles.forecastStatusTextOk,
                  ]}
                >
                  {forecastDiff > 0 ? 'Риск' : 'Норма'}
                </Text>
              </View>
            </View>

            <Text style={styles.forecastValue}>{formatKzt(forecastExpense)}</Text>

            <Text style={styles.forecastText}>
              {forecastDiff > 0
                ? `Прогноз выше дохода на ${formatKzt(forecastDiff)}.`
                : `Ожидаемый остаток: ${formatKzt(Math.abs(forecastDiff))}.`}
            </Text>

            {!!topCategory && (
              <Text style={styles.forecastText}>
                Главная категория: {topCategory.name} · {formatKzt(topCategory.amount)}
              </Text>
            )}
          </View>

          <View style={styles.forecastIconBox}>
            <AppIcon name="chart" size={25} color={colors.primary} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 32 },

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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  brand: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: { ...typography.title, marginTop: 2 },
  historyButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },

  balanceCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 22,
    marginBottom: 14,
    ...shadow.elevated,
  },
  cardTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '800',
  },
  scoreBadge: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  scoreText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    marginTop: 18,
    letterSpacing: -1,
  },
  scoreDescription: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 10,
  },

  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  metricIconBoxGreen: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricIconBoxRed: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
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

  todayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    ...shadow.soft,
  },
  todayItem: { flex: 1 },
  todayDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 14,
  },
  todayLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },
  todayValue: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '900',
  },

  emptyStateBlock: {
    marginBottom: 14,
  },

  insightsSection: {
    marginBottom: 14,
  },

  forecastCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    ...shadow.soft,
  },
  forecastTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  forecastLabel: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '800',
    marginRight: 8,
  },
  forecastStatus: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  forecastStatusOk: {
    backgroundColor: colors.mintSoft,
  },
  forecastStatusRisk: {
    backgroundColor: colors.coralSoft,
  },
  forecastStatusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  forecastStatusTextOk: {
    color: colors.mint,
  },
  forecastStatusTextRisk: {
    color: colors.coral,
  },
  forecastValue: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: '900',
    marginTop: 5,
  },
  forecastText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  forecastIconBox: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
});