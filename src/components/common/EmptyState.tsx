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

type Props = {
  title: string;
  description?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'success';
  style?: ViewStyle | ViewStyle[];
};

const getTone = (tone: Props['tone']) => {
  if (tone === 'warning') {
    return {
      background: colors.amberSoft,
      icon: colors.amber,
      title: colors.ink,
      action: colors.amber,
    };
  }

  if (tone === 'danger') {
    return {
      background: colors.coralSoft,
      icon: colors.coral,
      title: colors.ink,
      action: colors.coral,
    };
  }

  if (tone === 'success') {
    return {
      background: colors.mintSoft,
      icon: colors.mint,
      title: colors.ink,
      action: colors.mint,
    };
  }

  return {
    background: colors.primarySoft,
    icon: colors.primary,
    title: colors.ink,
    action: colors.primary,
  };
};

export default function EmptyState({
  title,
  description,
  icon = 'plus',
  actionLabel,
  onAction,
  compact = false,
  tone = 'default',
  style,
}: Props) {
  const toneStyle = getTone(tone);
  const canPress = !!actionLabel && !!onAction;

  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      <View style={[styles.iconBox, compact && styles.iconBoxCompact, { backgroundColor: toneStyle.background }]}>
        <AppIcon name={icon} size={compact ? 22 : 28} color={toneStyle.icon} />
      </View>

      <Text style={[styles.title, compact && styles.titleCompact, { color: toneStyle.title }]}>
        {title}
      </Text>

      {!!description && (
        <Text style={[styles.description, compact && styles.descriptionCompact]}>
          {description}
        </Text>
      )}

      {!!actionLabel && (
        <TouchableOpacity
          style={[styles.actionButton, !canPress && styles.actionButtonDisabled]}
          onPress={onAction}
          disabled={!canPress}
          activeOpacity={0.86}
        >
          <Text style={[styles.actionText, { color: toneStyle.action }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
    ...shadow.soft,
  },

  containerCompact: {
    padding: 15,
    alignItems: 'flex-start',
  },

  iconBox: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  iconBoxCompact: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    marginBottom: 10,
  },

  title: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },

  titleCompact: {
    fontSize: 15,
    textAlign: 'left',
  },

  description: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 7,
  },

  descriptionCompact: {
    textAlign: 'left',
    marginTop: 5,
  },

  actionButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    paddingVertical: 11,
    marginTop: 14,
  },

  actionButtonDisabled: {
    opacity: 0.55,
  },

  actionText: {
    fontSize: 13,
    fontWeight: '900',
  },
});
