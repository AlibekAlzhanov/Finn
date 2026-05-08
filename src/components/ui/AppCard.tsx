import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

import { colors, radius, shadow } from '../../theme';

export default function AppCard({ children, style, dark }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; dark?: boolean; }) {
  return <View style={[styles.card, dark && styles.darkCard, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, ...shadow.soft },
  darkCard: { backgroundColor: colors.dark, borderColor: colors.dark2 },
});
