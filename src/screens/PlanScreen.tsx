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
import {
  FinanceIntelligenceLoadResult,
  loadCurrentMonthFinanceIntelligence,
} from '../services/financeIntelligenceDataService';
import { formatKzt } from '../services/financeConfig';
import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon, { IconName } from '../components/ui/AppIcon';

type PlanItem = {
  title: string;
  subtitle: string;
  icon: IconName;
  route: string;
  badge?: string;
};

export default function PlanScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [data, setData] = useState<FinanceIntelligenceLoadResult | null>(null);
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
      console.error('Ошибка загрузки плана:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить планирование.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Загрузка плана...</Text>
      </View>
    );
  }

  const intelligence = data?.intelligence;
  const exceededBudgets = intelligence?.budgetStatuses.filter((item) => item.status === 'exceeded').length || 0;
  const activeGoals = intelligence?.goalStatuses.filter((item) => item.progress < 100).length || 0;
  const upcomingSubscriptions = intelligence?.upcomingSubscriptions.length || 0;

  const planItems: PlanItem[] = [
    {
      title: 'Бюджеты',
      subtitle: exceededBudgets > 0
        ? `Есть превышенные лимиты: ${exceededBudgets}`
        : 'Контролируй лимиты по категориям',
      icon: 'budget',
      route: 'Budgets',
      badge: exceededBudgets > 0 ? 'Риск' : undefined,
    },
    {
      title: 'Цели',
      subtitle: activeGoals > 0
        ? `Активных целей: ${activeGoals}`
        : 'Планируй накопления и прогресс',
      icon: 'target',
      route: 'Goals',
      badge: activeGoals > 0 ? 'Активно' : undefined,
    },
    {
      title: 'Подписки',
      subtitle: upcomingSubscriptions > 0
        ? `Ближайших списаний: ${upcomingSubscriptions}`
        : 'Регулярные платежи и автосписания',
      icon: 'sync',
      route: 'RecurringPayments',
      badge: upcomingSubscriptions > 0 ? 'Скоро' : undefined,
    },
    {
      title: 'Отчёт',
      subtitle: 'Итоги месяца, риски и план действий',
      icon: 'report',
      route: 'MonthlyReport',
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScreenHeader
          title="План"
          subtitle="Бюджеты, цели и регулярные платежи"
          icon="target"
        />

        <View style={styles.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Планирование месяца</Text>
            <Text style={styles.heroTitle}>
              {formatKzt(intelligence?.dailySafeLimit || 0)}
            </Text>
            <Text style={styles.heroText}>
              Безопасный дневной лимит, чтобы не выйти за рамки текущего месяца.
            </Text>
          </View>

          <View style={styles.heroIcon}>
            <AppIcon name="target" size={28} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{intelligence?.budgetStatuses.length || 0}</Text>
            <Text style={styles.metricLabel}>бюджетов</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{activeGoals}</Text>
            <Text style={styles.metricLabel}>целей</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{upcomingSubscriptions}</Text>
            <Text style={styles.metricLabel}>списаний</Text>
          </View>
        </View>

        {planItems.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.planCard}
            onPress={() => navigation.navigate(item.route)}
            activeOpacity={0.86}
          >
            <View style={styles.planIcon}>
              <AppIcon name={item.icon} size={24} color={colors.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.planTitleRow}>
                <Text style={styles.planTitle}>{item.title}</Text>

                {!!item.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.planSubtitle}>{item.subtitle}</Text>
            </View>

            <View style={styles.arrowBox}>
              <AppIcon name="back" size={17} color={colors.inkMuted} style={styles.arrowIcon} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Зачем нужен план?</Text>
          <Text style={styles.noteText}>
            Бюджеты ограничивают лишние траты, цели помогают копить, а подписки показывают будущие списания до того, как они ударят по балансу.
          </Text>
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
  },
  loadingText: { marginTop: 12, color: colors.inkMuted, fontSize: 14, fontWeight: '700' },

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 22,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.elevated,
  },
  heroLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '800' },
  heroTitle: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', marginTop: 6 },
  heroText: { color: '#CBD5E1', fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 6 },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 14,
  },

  metricsRow: { flexDirection: 'row', marginBottom: 14 },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    ...shadow.soft,
  },
  metricValue: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: '800', marginTop: 3 },

  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.soft,
  },
  planIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  planTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  planSubtitle: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  badge: {
    marginLeft: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  arrowBox: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  arrowIcon: { transform: [{ rotate: '180deg' }] },

  noteCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: 16,
    marginTop: 4,
  },
  noteTitle: { color: colors.primaryDark, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  noteText: { color: colors.primaryDark, fontSize: 13, lineHeight: 19, fontWeight: '700' },
});
