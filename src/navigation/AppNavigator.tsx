import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MainScreen from '../screens/MainScreen';
import StatsScreen from '../screens/StatsScreen';
import AccountsScreen from '../screens/AccountsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ManualInputScreen from '../screens/ManualInputScreen';
import AuthScreen from '../screens/AuthScreen';
import ManageCategoriesScreen from '../screens/ManageCategoriesScreen';
import AiReviewScreen from '../screens/AiReviewScreen';
import VoiceActionReviewScreen from '../screens/VoiceActionReviewScreen';
import BudgetsScreen from '../screens/BudgetsScreen';
import GoalsScreen from '../screens/GoalsScreen';
import AiChatScreen from '../screens/AiChatScreen';
import RecurringPaymentsScreen from '../screens/RecurringPaymentsScreen';
import MonthlyReportScreen from '../screens/MonthlyReportScreen';
import ServicesScreen from '../screens/ServicesScreen';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { colors, radius, shadow } from '../theme';
import AppIcon, { IconName } from '../components/ui/AppIcon';

const Stack = createNativeStackNavigator();

type RootTabKey = 'Main' | 'Stats' | 'Budgets' | 'Services' | 'Profile';

type RootTab = {
  key: RootTabKey;
  label: string;
  icon: IconName;
  component: React.ComponentType<any>;
};

const rootTabs: RootTab[] = [
  {
    key: 'Main',
    label: 'Главная',
    icon: 'home',
    component: MainScreen,
  },
  {
    key: 'Stats',
    label: 'Аналитика',
    icon: 'chart',
    component: StatsScreen,
  },
  {
    key: 'Budgets',
    label: 'Бюджет',
    icon: 'budget',
    component: BudgetsScreen,
  },
  {
    key: 'Services',
    label: 'Сервисы',
    icon: 'category',
    component: ServicesScreen,
  },
  {
    key: 'Profile',
    label: 'Профиль',
    icon: 'user',
    component: ProfileScreen,
  },
];

function AppDock({
  activeTab,
  onChangeTab,
}: {
  activeTab: RootTabKey;
  onChangeTab: (tab: RootTabKey) => void;
}) {
  return (
    <View style={styles.dock}>
      {rootTabs.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.86}
            style={[styles.dockItem, isActive && styles.dockItemActive]}
            onPress={() => onChangeTab(tab.key)}
          >
            <AppIcon
              name={tab.icon}
              size={20}
              color={isActive ? colors.primary : colors.inkMuted}
            />

            <Text style={[styles.dockLabel, isActive && styles.dockLabelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RootShell() {
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<RootTabKey>('Main');

  const activeTabConfig = useMemo(
    () => rootTabs.find((tab) => tab.key === activeTab) || rootTabs[0],
    [activeTab]
  );

  const ActiveComponent = activeTabConfig?.component || MainScreen;

  return (
    <View style={styles.shell}>
      <View style={styles.screenContainer}>
        <ActiveComponent />
      </View>

      <View
        style={[
          styles.dockWrap,
          {
            paddingBottom:
              Platform.OS === 'ios'
                ? Math.max(insets.bottom, 10)
                : Math.max(insets.bottom, 8),
          },
        ]}
      >
        <AppDock activeTab={activeTab} onChangeTab={setActiveTab} />
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const { session, setSession } = useAuthStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  if (isInitializing) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {session ? (
        <>
          <Stack.Screen name="Root" component={RootShell} />

          <Stack.Screen name="Stats" component={StatsScreen} />
          <Stack.Screen name="Budgets" component={BudgetsScreen} />
          <Stack.Screen name="Accounts" component={AccountsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Services" component={ServicesScreen} />

          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="ManualInput" component={ManualInputScreen} />
          <Stack.Screen name="ManageCategories" component={ManageCategoriesScreen} />
          <Stack.Screen name="AiReview" component={AiReviewScreen} />
          <Stack.Screen name="VoiceActionReview" component={VoiceActionReviewScreen} />
          <Stack.Screen name="Goals" component={GoalsScreen} />
          <Stack.Screen name="AiChat" component={AiChatScreen} />
          <Stack.Screen name="RecurringPayments" component={RecurringPaymentsScreen} />
          <Stack.Screen name="MonthlyReport" component={MonthlyReportScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },

  screenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },

  loaderContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dockWrap: {
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingTop: 8,
  },

  dock: {
    height: 72,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: 6,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.elevated,
  },

  dockItem: {
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },

  dockItemActive: {
    backgroundColor: colors.primarySoft,
  },

  dockLabel: {
    marginTop: 4,
    fontSize: 10.5,
    color: colors.inkMuted,
    fontWeight: '800',
  },

  dockLabelActive: {
    color: colors.primary,
  },
});
