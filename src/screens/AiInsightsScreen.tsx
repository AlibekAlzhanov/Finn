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
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../store/useAuthStore';
import {
  FinanceIntelligenceLoadResult,
  loadCurrentMonthFinanceIntelligence,
} from '../services/financeIntelligenceDataService';
import { AiInsight } from '../services/financeIntelligenceService';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon from '../components/ui/AppIcon';
import AiInsightCard from '../components/insights/AiInsightCard';

type FilterKey = 'all' | 'high' | 'medium' | 'low';

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'high', label: 'Высокий риск' },
  { key: 'medium', label: 'Внимание' },
  { key: 'low', label: 'Советы' },
];

const severityOrder: Record<AiInsight['severity'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export default function AiInsightsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [data, setData] = useState<FinanceIntelligenceLoadResult | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
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
      setLoading(true);

      const result = await loadCurrentMonthFinanceIntelligence(user.id, {
        autoChargeSubscriptions: false,
      });

      setData(result);
    } catch (error) {
      console.error('Ошибка загрузки инсайтов:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить AI-инсайты.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleInsightAction = (insight: AiInsight) => {
    if (!insight.actionRoute) return;
    navigation.navigate(insight.actionRoute, insight.actionPayload || undefined);
  };

  const allInsights = data?.intelligence.insights || [];

  const filteredInsights = useMemo(() => {
    return allInsights
      .filter((insight) => filter === 'all' || insight.severity === filter)
      .sort((a, b) => {
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return a.title.localeCompare(b.title);
      });
  }, [allInsights, filter]);

  const highCount = allInsights.filter((item) => item.severity === 'high').length;
  const mediumCount = allInsights.filter((item) => item.severity === 'medium').length;
  const lowCount = allInsights.filter((item) => item.severity === 'low').length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка инсайтов...</Text>
      </View>
    );
  }

  const intelligence = data?.intelligence;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScreenHeader
          title="AI-инсайты"
          subtitle="Что FinBuddy заметил в твоих финансах"
          icon="ai"
          back
        />

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Финансовое состояние</Text>
              <Text style={styles.heroTitle}>
                {intelligence?.financialScore || 0}/100
              </Text>
            </View>

            <View style={styles.heroIcon}>
              <AppIcon name="ai" size={27} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.heroText}>
            {intelligence?.financialScoreLabel ||
              'Добавьте операции, чтобы FinBuddy сформировал персональные выводы.'}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{highCount}</Text>
              <Text style={styles.statLabel}>рисков</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statValue}>{mediumCount}</Text>
              <Text style={styles.statLabel}>замечаний</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statValue}>{lowCount}</Text>
              <Text style={styles.statLabel}>советов</Text>
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((item) => {
            const isActive = item.key === filter;

            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilter(item.key)}
                activeOpacity={0.86}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filteredInsights.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Нет инсайтов по этому фильтру</Text>
            <Text style={styles.emptyText}>
              Попробуйте выбрать другой фильтр или добавьте больше финансовых операций.
            </Text>
          </View>
        ) : (
          filteredInsights.map((insight) => (
            <AiInsightCard
              key={insight.id}
              insight={insight}
              onAction={handleInsightAction}
              style={styles.insightCard}
            />
          ))
        )}

        <View style={styles.explainCard}>
          <Text style={styles.explainTitle}>Как это работает?</Text>
          <Text style={styles.explainText}>
            FinBuddy анализирует доходы, расходы, бюджеты, цели, подписки и необычные операции. 
            На основе этих данных формируются риски, советы и действия.
          </Text>
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
    fontWeight: '700',
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

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
    marginTop: 4,
  },

  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroText: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 12,
  },

  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },

  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },

  statValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  statLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },

  filters: {
    paddingBottom: 12,
  },

  filterChip: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },

  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  filterText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },

  filterTextActive: {
    color: '#FFFFFF',
  },

  insightCard: {
    marginBottom: 12,
  },

  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    ...shadow.soft,
  },

  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  emptyText: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 5,
  },

  explainCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: 18,
    marginTop: 4,
  },

  explainTitle: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },

  explainText: {
    color: colors.primaryDark,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
});
