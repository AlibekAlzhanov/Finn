import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

import { colors, radius, shadow } from '../../theme';
import AppIcon, { IconName } from '../ui/AppIcon';
import { AiInsight } from '../../services/financeIntelligenceService';

type Props = {
  insight: AiInsight;
  onAction?: (insight: AiInsight) => void;
  style?: ViewStyle | ViewStyle[];
  variant?: 'featured' | 'compact' | 'list';
};

const getSeverityLabel = (severity: AiInsight['severity']) => {
  if (severity === 'high') return 'Высокий риск';
  if (severity === 'medium') return 'Нужно внимание';
  return 'Совет';
};

const getInsightIcon = (type: AiInsight['type']): IconName => {
  if (type === 'forecast') return 'chart';
  if (type === 'budget' || type === 'overspending') return 'budget';
  if (type === 'subscription') return 'sync';
  if (type === 'goal') return 'target';
  if (type === 'anomaly') return 'report';
  return 'ai';
};

const getSeverityStyles = (severity: AiInsight['severity']) => {
  if (severity === 'high') {
    return {
      badge: styles.badgeHigh,
      badgeText: styles.badgeTextHigh,
      accent: styles.accentHigh,
      iconBox: styles.iconBoxHigh,
      iconColor: colors.coral,
    };
  }

  if (severity === 'medium') {
    return {
      badge: styles.badgeMedium,
      badgeText: styles.badgeTextMedium,
      accent: styles.accentMedium,
      iconBox: styles.iconBoxMedium,
      iconColor: colors.amber,
    };
  }

  return {
    badge: styles.badgeLow,
    badgeText: styles.badgeTextLow,
    accent: styles.accentLow,
    iconBox: styles.iconBoxLow,
    iconColor: colors.primary,
  };
};

export default function AiInsightCard({
  insight,
  onAction,
  style,
  variant = 'list',
}: Props) {
  const severityStyles = getSeverityStyles(insight.severity);
  const icon = getInsightIcon(insight.type);
  const isFeatured = variant === 'featured';
  const isCompact = variant === 'compact';
  const canPress = !!insight.actionRoute && !!onAction;

  return (
    <View
      style={[
        styles.card,
        isFeatured && styles.cardFeatured,
        isCompact && styles.cardCompact,
        style,
      ]}
    >
      <View style={[styles.accent, severityStyles.accent]} />

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={[styles.iconBox, severityStyles.iconBox]}>
            <AppIcon name={icon} size={isFeatured ? 23 : 19} color={severityStyles.iconColor} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={[styles.badge, severityStyles.badge]}>
              <Text style={[styles.badgeText, severityStyles.badgeText]}>
                {getSeverityLabel(insight.severity)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.title, isFeatured && styles.titleFeatured]}>{insight.title}</Text>

        {!isCompact && (
          <Text style={[styles.message, isFeatured && styles.messageFeatured]}>
            {insight.message}
          </Text>
        )}

        {isCompact && (
          <Text style={styles.compactMessage} numberOfLines={2}>
            {insight.message}
          </Text>
        )}

        {!!insight.actionLabel && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              isFeatured && styles.actionButtonFeatured,
              !canPress && styles.actionButtonDisabled,
            ]}
            onPress={() => onAction?.(insight)}
            disabled={!canPress}
            activeOpacity={0.86}
          >
            <Text style={styles.actionText}>{insight.actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
    ...shadow.soft,
  },

  cardFeatured: {
    backgroundColor: colors.dark,
    borderColor: colors.dark2,
    ...shadow.elevated,
  },

  cardCompact: {
    minHeight: 132,
  },

  accent: {
    width: 6,
  },

  accentHigh: {
    backgroundColor: colors.coral,
  },

  accentMedium: {
    backgroundColor: colors.amber,
  },

  accentLow: {
    backgroundColor: colors.primary,
  },

  content: {
    flex: 1,
    padding: 15,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
  },

  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  iconBoxHigh: {
    backgroundColor: colors.coralSoft,
  },

  iconBoxMedium: {
    backgroundColor: colors.amberSoft,
  },

  iconBoxLow: {
    backgroundColor: colors.primarySoft,
  },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  badgeHigh: {
    backgroundColor: colors.coralSoft,
  },

  badgeMedium: {
    backgroundColor: colors.amberSoft,
  },

  badgeLow: {
    backgroundColor: colors.primarySoft,
  },

  badgeText: {
    fontSize: 10.5,
    fontWeight: '900',
  },

  badgeTextHigh: {
    color: colors.coral,
  },

  badgeTextMedium: {
    color: colors.amber,
  },

  badgeTextLow: {
    color: colors.primary,
  },

  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
  },

  titleFeatured: {
    color: '#FFFFFF',
    fontSize: 20,
    letterSpacing: -0.2,
  },

  message: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },

  messageFeatured: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 21,
  },

  compactMessage: {
    color: colors.inkMuted,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
  },

  actionButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dark,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginTop: 12,
  },

  actionButtonFeatured: {
    backgroundColor: colors.primary,
  },

  actionButtonDisabled: {
    opacity: 0.55,
  },

  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});
