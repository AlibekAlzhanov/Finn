import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const ICONS = {
  home: require('../../assets/icons/home.png'),
  chart: require('../../assets/icons/chart.png'),
  wallet: require('../../assets/icons/wallet.png'),
  budget: require('../../assets/icons/budget.png'),
  target: require('../../assets/icons/target.png'),
  ai: require('../../assets/icons/ai.png'),
  report: require('../../assets/icons/report.png'),
  sync: require('../../assets/icons/sync.png'),
  history: require('../../assets/icons/history.png'),
  category: require('../../assets/icons/category.png'),
  plus: require('../../assets/icons/plus.png'),
  mic: require('../../assets/icons/mic.png'),
  send: require('../../assets/icons/send.png'),
  back: require('../../assets/icons/back.png'),
  edit: require('../../assets/icons/edit.png'),
  delete: require('../../assets/icons/delete.png'),
  user: require('../../assets/icons/user.png'),
};

export type IconName = keyof typeof ICONS;

export default function AppIcon({ name, size = 22, color = '#121826', style }: { name: IconName; size?: number; color?: string; style?: StyleProp<ImageStyle>; }) {
  return <Image source={ICONS[name]} resizeMode="contain" style={[{ width: size, height: size, tintColor: color }, style]} />;
}
