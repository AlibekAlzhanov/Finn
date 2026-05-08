import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { colors, radius, shadow } from '../theme';
import ScreenHeader from '../components/ui/ScreenHeader';
import AppIcon, { IconName } from '../components/ui/AppIcon';

type ServiceItem = {
  title: string;
  subtitle: string;
  icon: IconName;
  screen: string;
  badge?: string;
};

type ServiceGroup = {
  title: string;
  description: string;
  items: ServiceItem[];
};

const serviceGroups: ServiceGroup[] = [
  {
    title: 'AI и аналитика',
    description: 'AI-чат, месячный отчет и описание интеллектуальных функций.',
    items: [
      {
        title: 'AI-чат',
        subtitle: 'Вопросы по расходам, бюджету и целям',
        icon: 'ai',
        screen: 'AiChat',
        badge: 'AI',
      },
      {
        title: 'Месячный отчет',
        subtitle: 'Рейтинг, прогноз, топ расходов и рекомендации',
        icon: 'report',
        screen: 'MonthlyReport',
        badge: 'Месяц',
      },
      {
        title: 'Аналитика',
        subtitle: 'Статистика текущего месяца по категориям',
        icon: 'chart',
        screen: 'Stats',
      },
    ],
  },
  {
    title: 'Планирование',
    description: 'Лимиты, цели и регулярные платежи.',
    items: [
      {
        title: 'Бюджет',
        subtitle: 'Лимиты по категориям расходов',
        icon: 'budget',
        screen: 'Budgets',
      },
      {
        title: 'Цели',
        subtitle: 'Накопления и прогресс',
        icon: 'target',
        screen: 'Goals',
      },
      {
        title: 'Подписки',
        subtitle: 'Регулярные платежи и автосписания',
        icon: 'sync',
        screen: 'RecurringPayments',
      },
    ],
  },
  {
    title: 'Операции и настройки',
    description: 'Ввод, история, счета и категории.',
    items: [
      {
        title: 'Ручной ввод',
        subtitle: 'Добавить доход или расход вручную',
        icon: 'plus',
        screen: 'ManualInput',
      },
      {
        title: 'История',
        subtitle: 'Все операции и удаление по долгому нажатию',
        icon: 'history',
        screen: 'History',
      },
      {
        title: 'Счета',
        subtitle: 'Карты, наличные и общий баланс',
        icon: 'wallet',
        screen: 'Accounts',
      },
      {
        title: 'Категории',
        subtitle: 'Категории доходов и расходов',
        icon: 'category',
        screen: 'ManageCategories',
      },
    ],
  },
];

export default function ServicesScreen() {
  const navigation = useNavigation<any>();

  const openService = (screen: string) => {
    navigation.navigate(screen);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Сервисы"
          subtitle="Все функции FinBuddy в одном месте"
          icon="category"
        />

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <AppIcon name="category" size={28} color="#FFFFFF" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Карта функций</Text>
          </View>
        </View>

        {serviceGroups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <Text style={styles.groupDescription}>{group.description}</Text>

            {group.items.map((item) => (
              <TouchableOpacity
                key={`${group.title}-${item.screen}-${item.title}`}
                style={styles.serviceCard}
                activeOpacity={0.86}
                onPress={() => openService(item.screen)}
              >
                <View style={styles.serviceIcon}>
                  <AppIcon name={item.icon} size={23} color={colors.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.serviceTitleRow}>
                    <Text style={styles.serviceTitle}>{item.title}</Text>

                    {!!item.badge && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.serviceSubtitle}>{item.subtitle}</Text>
                </View>

                <View style={styles.arrowBox}>
                  <AppIcon name="back" size={17} color={colors.inkMuted} style={styles.arrowIcon} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
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

  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.elevated,
  },

  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  heroText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    fontWeight: '700',
  },

  group: {
    marginBottom: 22,
  },

  groupTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },

  groupDescription: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginBottom: 10,
  },

  serviceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.soft,
  },

  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  serviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  serviceTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },

  serviceSubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 3,
  },

  badge: {
    marginLeft: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  badgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },

  arrowBox: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  arrowIcon: {
    transform: [{ rotate: '180deg' }],
  },

  noteCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },

  noteTitle: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
  },

  noteText: {
    color: colors.primaryDark,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
});
