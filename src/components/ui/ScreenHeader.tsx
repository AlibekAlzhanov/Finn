import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, typography } from '../../theme';
import AppIcon, { IconName } from './AppIcon';

export default function ScreenHeader({
  title,
  subtitle,
  rightText,
  onRightPress,
  back,
  icon,
}: {
  title: string;
  subtitle?: string;
  rightText?: string;
  onRightPress?: () => void;
  back?: boolean;
  icon?: IconName;
}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const canGoBack = navigation.canGoBack?.() || false;
  const shouldShowBack = back || canGoBack;

  const handleBack = () => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Root');
  };

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
      {shouldShowBack && (
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.82}>
          <AppIcon name="back" size={21} color={colors.ink} />
        </TouchableOpacity>
      )}

      {icon && (
        <View style={styles.iconBox}>
          <AppIcon name={icon} size={22} color={colors.primary} />
        </View>
      )}

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>

      {!!rightText && (
        <TouchableOpacity style={styles.rightButton} onPress={onRightPress} activeOpacity={0.86}>
          <Text style={styles.rightText}>{rightText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  titleBlock: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    ...typography.title,
  },

  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: colors.inkMuted,
    fontWeight: '700',
    lineHeight: 18,
  },

  rightButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginLeft: 10,
  },

  rightText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
