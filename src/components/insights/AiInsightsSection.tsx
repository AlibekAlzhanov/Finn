import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

import { colors, radius, shadow } from '../../theme';
import AppIcon from '../ui/AppIcon';
import { AiInsight } from '../../services/financeIntelligenceService';
import AiInsightCard from './AiInsightCard';

type Props = {
  insights: AiInsight[];
  onAction?: (insight: AiInsight) => void;
  onOpenAll?: () => void;
  style?: ViewStyle | ViewStyle[];
  maxPreview?: number;
};

const severityOrder: Record<AiInsight['severity'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const sortInsights = (items: AiInsight[]) => {
  return [...items].sort((a, b) => {
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.title.localeCompare(b.title);
  });
};

export default function AiInsightsSection({
  insights,
  onAction,
  onOpenAll,
  style,
  maxPreview = 3,
}: Props) {
  const sortedInsights = useMemo(() => sortInsights(insights), [insights]);
  const mainInsight = sortedInsights[0];
  const secondaryInsights = sortedInsights.slice(1, maxPreview);
  const hasMore = sortedInsights.length > maxPreview;

  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <AppIcon name="ai" size={21} color="#FFFFFF" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Что важно сейчас</Text>
          <Text style={styles.subtitle}>Finn анализирует деньги и предлагает действия</Text>
        </View>

        {!!onOpenAll && (
          <TouchableOpacity style={styles.allButton} onPress={onOpenAll} activeOpacity={0.86}>
            <Text style={styles.allButtonText}>Все</Text>
          </TouchableOpacity>
        )}
      </View>

      {sortedInsights.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Пока нет инсайтов</Text>
          <Text style={styles.emptyText}>
            Добавьте доходы, расходы, бюджеты и подписки — FinBuddy начнёт находить риски и рекомендации.
          </Text>
        </View>
      ) : (
        <>
          <AiInsightCard
            insight={mainInsight}
            onAction={onAction}
            variant="featured"
            style={styles.featuredCard}
          />

          {secondaryInsights.map((insight) => (
            <AiInsightCard
              key={insight.id}
              insight={insight}
              onAction={onAction}
              variant="compact"
              style={styles.secondaryCard}
            />
          ))}

          {hasMore && !!onOpenAll && (
            <TouchableOpacity style={styles.moreButton} onPress={onOpenAll} activeOpacity={0.86}>
              <Text style={styles.moreButtonText}>
                Смотреть все инсайты · {sortedInsights.length}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  title: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '900',
  },

  subtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 2,
  },

  allButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  allButtonText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },

  featuredCard: {
    marginBottom: 10,
  },

  secondaryCard: {
    marginBottom: 10,
  },

  moreButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },

  moreButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  emptyBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 14,
  },

  emptyTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },

  emptyText: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
  },
});
