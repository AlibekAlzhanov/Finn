import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Keyboard,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { parseExpenseWithAI, transcribeAudio } from '../services/aiService';
import { formatKzt } from '../services/financeConfig';
import { parseUniversalVoiceCommand } from '../services/voiceCommandService';
import {
  chargeDueSubscriptions,
  getUpcomingSubscriptions,
  daysBetweenToday,
  SubscriptionRow,
} from '../services/subscriptionService';
import {
  calculateMonthlyForecast,
  ForecastTransaction,
  MonthlyForecast,
} from '../services/forecastService';
import { colors, radius, shadow, typography } from '../theme';
import AppIcon from '../components/ui/AppIcon';

type TransactionRow = ForecastTransaction & {
  id?: string;
  category_id?: string | null;
};

type CategoryRow = {
  id: string;
  name: string | null;
};

type Tip = {
  id: string;
  title: string;
  text: string;
  icon: 'ai' | 'sync' | 'budget' | 'target' | 'wallet' | 'chart';
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isValidDate = (value: unknown) => {
  if (!value) return false;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
};

const getScoreStatus = (score: number) => {
  if (score >= 80) return 'Отлично';
  if (score >= 60) return 'Стабильно';
  if (score >= 40) return 'Нормально';
  return 'Контроль';
};

export default function MainScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const [totalBalance, setTotalBalance] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthExpense, setMonthExpense] = useState(0);
  const [forecastExpense, setForecastExpense] = useState(0);
  const [forecastInfo, setForecastInfo] = useState<MonthlyForecast | null>(null);
  const [dailySafeLimit, setDailySafeLimit] = useState(0);
  const [financialScore, setFinancialScore] = useState(50);
  const [mainCategory, setMainCategory] = useState<string>('нет данных');
  const [mainCategoryAmount, setMainCategoryAmount] = useState(0);
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [processingAi, setProcessingAi] = useState(false);
  const [aiText, setAiText] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [user?.id])
  );

  const expensePercent = useMemo(() => {
    if (monthIncome <= 0) return monthExpense > 0 ? 100 : 0;
    return Math.round((monthExpense / monthIncome) * 100);
  }, [monthIncome, monthExpense]);

  const forecastDiff = useMemo(() => {
    return forecastExpense - monthIncome;
  }, [forecastExpense, monthIncome]);

  const buildTips = ({
    income,
    expense,
    forecast,
    dailyLimit,
    score,
    topCategory,
    topCategoryAmount,
    upcoming,
    chargedCount,
    forecastDetails,
  }: {
    income: number;
    expense: number;
    forecast: number;
    dailyLimit: number;
    score: number;
    topCategory: string;
    topCategoryAmount: number;
    upcoming: SubscriptionRow[];
    chargedCount: number;
    forecastDetails: MonthlyForecast | null;
  }) => {
    const result: Tip[] = [];

    if (chargedCount > 0) {
      result.push({
        id: 'charged-subscriptions',
        title: 'Подписки списаны',
        text: `Сегодня создано операций по подпискам: ${chargedCount}. Проверь историю.`,
        icon: 'sync',
      });
    }

    const dueToday = upcoming.find((item) => daysBetweenToday(item.next_payment_date) === 0);
    const nextDue = upcoming.find((item) => {
      const days = daysBetweenToday(item.next_payment_date);
      return days !== null && days > 0;
    });

    if (dueToday) {
      result.push({
        id: 'subscription-today',
        title: 'Сегодня списание',
        text: `${dueToday.title || 'Подписка'}: ${formatKzt(safeNumber(dueToday.amount))}. Проверь баланс на счете.`,
        icon: 'sync',
      });
    } else if (nextDue) {
      const days = daysBetweenToday(nextDue.next_payment_date);
      result.push({
        id: 'subscription-soon',
        title: 'Скоро подписка',
        text: `${nextDue.title || 'Подписка'} спишется через ${days} дн.: ${formatKzt(safeNumber(nextDue.amount))}.`,
        icon: 'sync',
      });
    }

    if (forecastDetails && forecastDetails.upcomingSubscriptions > 0) {
      result.push({
        id: 'forecast-subscriptions',
        title: 'Прогноз учитывает подписки',
        text: `До конца месяца еще ожидается списаний на ${formatKzt(forecastDetails.upcomingSubscriptions)}.`,
        icon: 'sync',
      });
    }

    if (forecastDetails && forecastDetails.anomalySpent > 0) {
      result.push({
        id: 'forecast-anomaly',
        title: 'Разовая крупная трата',
        text: `Крупные покупки на ${formatKzt(forecastDetails.anomalySpent)} учтены один раз и не размножаются на месяц.`,
        icon: 'chart',
      });
    }

    if (income > 0 && forecast > income) {
      result.push({
        id: 'forecast-risk',
        title: 'Риск перерасхода',
        text: `Умный прогноз выше дохода на ${formatKzt(forecast - income)}. Сократи необязательные траты.`,
        icon: 'chart',
      });
    }

    if (dailyLimit > 0) {
      result.push({
        id: 'daily-limit',
        title: 'Совет дня',
        text: `Безопасный лимит на сегодня: ${formatKzt(dailyLimit)}. Если удержишься, месяц пройдет спокойнее.`,
        icon: 'budget',
      });
    }

    if (topCategoryAmount > 0 && topCategory !== 'нет данных') {
      result.push({
        id: 'top-category',
        title: 'Главная трата месяца',
        text: `${topCategory}: ${formatKzt(topCategoryAmount)}. Проверь, можно ли поставить лимит.`,
        icon: 'budget',
      });
    }

    if (score < 50) {
      result.push({
        id: 'score-low',
        title: 'AI-рекомендация',
        text: 'Финансовый рейтинг низкий. Начни с лимита на самую дорогую категорию и отключи лишние подписки.',
        icon: 'ai',
      });
    }

    if (result.length === 0) {
      result.push({
        id: 'default-tip',
        title: 'Совет дня',
        text: 'Добавляй операции сразу после покупки — AI-аналитика станет точнее.',
        icon: 'ai',
      });
    }

    return result.slice(0, 4);
  };

  const loadDashboard = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let chargedCount = 0;

      try {
        const subscriptionResult = await chargeDueSubscriptions(user.id);
        chargedCount = subscriptionResult?.createdCount || 0;
      } catch (error) {
        console.error('Ошибка автосписаний на главной:', error);
        chargedCount = 0;
      }

      const [transactionsResult, categoriesResult, upcomingResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, type, amount, transaction_date, category_id, note, tags')
          .eq('user_id', user.id),

        supabase
          .from('categories')
          .select('id, name')
          .eq('user_id', user.id),

        getUpcomingSubscriptions(user.id, 35).catch((error) => {
          console.error('Ошибка загрузки ближайших подписок:', error);
          return [];
        }),
      ]);

      if (transactionsResult.error) throw transactionsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      const transactions = ((transactionsResult.data || []).filter(Boolean)) as TransactionRow[];
      const categories = ((categoriesResult.data || []).filter(Boolean)) as CategoryRow[];
      const upcoming = upcomingResult as SubscriptionRow[];

      const smartForecast = calculateMonthlyForecast({
        transactions,
        upcomingSubscriptions: upcoming,
      });

      const categoryMap: Record<string, string> = {};
      categories.forEach((category) => {
        categoryMap[category.id] = category.name || 'Без категории';
      });

      let balance = 0;
      let income = 0;
      let expense = 0;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const expenseByCategory: Record<string, number> = {};

      transactions.forEach((tx) => {
        if (!tx || !tx.type) return;

        const amount = safeNumber(tx.amount);

        if (tx.type === 'income') balance += amount;
        if (tx.type === 'expense') balance -= amount;

        if (!isValidDate(tx.transaction_date)) return;

        const txDate = new Date(String(tx.transaction_date));
        const isThisMonth =
          txDate.getMonth() === currentMonth &&
          txDate.getFullYear() === currentYear;

        if (!isThisMonth) return;

        if (tx.type === 'income') income += amount;

        if (tx.type === 'expense') {
          expense += amount;

          const categoryName = tx.category_id
            ? categoryMap[tx.category_id] || 'Без категории'
            : 'Без категории';

          expenseByCategory[categoryName] =
            (expenseByCategory[categoryName] || 0) + amount;
        }
      });

      const remainingDays = Math.max(
        new Date(currentYear, currentMonth + 1, 0).getDate() - now.getDate() + 1,
        1
      );

      const dailyLimit = Math.max(0, Math.round((income - expense) / remainingDays));
      const topCategory = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0];
      const savingRate = income > 0 ? ((income - expense) / income) * 100 : 0;

      let score = 50;

      if (income > expense) score += 20;
      else if (expense > 0) score -= 20;

      if (income > 0 && smartForecast.smartForecast <= income) score += 15;
      else if (income > 0) score -= 15;

      if (savingRate >= 20) score += 15;
      else if (savingRate < 5 && income > 0) score -= 10;

      const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
      const topCategoryName = topCategory?.[0] || 'нет данных';
      const topCategoryValue = topCategory?.[1] || 0;

      setTotalBalance(balance);
      setMonthIncome(income);
      setMonthExpense(expense);
      setForecastExpense(smartForecast.smartForecast);
      setForecastInfo(smartForecast);
      setDailySafeLimit(dailyLimit);
      setFinancialScore(normalizedScore);
      setMainCategory(topCategoryName);
      setMainCategoryAmount(topCategoryValue);

      setTips(
        buildTips({
          income,
          expense,
          forecast: smartForecast.smartForecast,
          dailyLimit,
          score: normalizedScore,
          topCategory: topCategoryName,
          topCategoryAmount: topCategoryValue,
          upcoming,
          chargedCount,
          forecastDetails: smartForecast,
        })
      );
    } catch (error) {
      console.error('Ошибка загрузки главной:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить главную страницу.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
  };

  const openTransactionReview = async (textToProcess: string) => {
    if (!user?.id) return;

    const { data: accounts, error: accError } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (accError) console.error('Ошибка поиска счета:', accError);

    if (!accounts || accounts.length === 0) {
      Alert.alert('Ошибка', "Сначала создайте счет в разделе 'Счета'");
      return;
    }

    const parsedData = await parseExpenseWithAI(textToProcess, user.id);

    if (parsedData && parsedData.length > 0) {
      navigation.navigate('AiReview', {
        data: parsedData,
        defaultAccountId: accounts[0].id,
        originalText: textToProcess,
      });
    } else {
      Alert.alert('AI не понял', 'Попробуйте сформулировать иначе.');
    }
  };

  const processAI = async (textToProcess: string) => {
    if (!textToProcess.trim() || !user?.id) return;

    Keyboard.dismiss();
    setProcessingAi(true);

    try {
      const command = await parseUniversalVoiceCommand(textToProcess);

      setAiText('');

      if (command.intent === 'navigation') {
        navigation.navigate(command.screen);
        return;
      }

      if (command.intent === 'review') {
        navigation.navigate('VoiceActionReview', {
          command,
        });
        return;
      }

      if (command.intent === 'transaction') {
        await openTransactionReview(textToProcess);
        return;
      }

      await openTransactionReview(textToProcess);
    } catch (error) {
      console.error('ОШИБКА ГОЛОСОВОЙ КОМАНДЫ:', error);
      Alert.alert('Системная ошибка', 'Произошла ошибка при обработке команды.');
    } finally {
      setProcessingAi(false);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к микрофону для голосового ввода.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (err) {
      console.error('Ошибка старта записи:', err);
      Alert.alert('Ошибка', 'Не удалось начать запись голоса.');
    }
  };

  const stopRecording = async () => {
    try {
      setProcessingAi(true);
      await audioRecorder.stop();

      const uri = audioRecorder.uri;

      if (!uri) {
        Alert.alert('Ошибка', 'Файл записи не найден.');
        setProcessingAi(false);
        return;
      }

      const transcribedText = await transcribeAudio(uri);

      if (transcribedText) {
        setAiText(transcribedText);
        await processAI(transcribedText);
      } else {
        Alert.alert('Ошибка', 'Не удалось распознать речь.');
        setProcessingAi(false);
      }
    } catch (error) {
      console.error('Ошибка остановки записи:', error);
      Alert.alert('Ошибка', 'Не удалось остановить запись.');
      setProcessingAi(false);
    }
  };

  const handleVoicePress = async () => {
    if (recorderState.isRecording) await stopRecording();
    else await startRecording();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>FINBUDDY</Text>
            <Text style={styles.title}>Обзор</Text>
          </View>

          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => navigation.navigate('History')}
          >
            <AppIcon name="history" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.cardTopLine}>
            <Text style={styles.cardLabel}>Доступный баланс</Text>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>
                {financialScore}/100 · {getScoreStatus(financialScore)}
              </Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 18 }} />
          ) : (
            <Text style={styles.balanceAmount}>{formatKzt(totalBalance)}</Text>
          )}

          <View style={styles.cardFooter}>
            <View>
              <Text style={styles.footerLabel}>Расходы</Text>
              <Text style={styles.footerValue}>{expensePercent}% дохода</Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.footerLabel}>Лимит в день</Text>
              <Text style={styles.footerValue}>{formatKzt(dailySafeLimit)}</Text>
            </View>
          </View>
        </View>

        {tips.length > 0 && (
          <View style={styles.tipsCard}>
            <View style={styles.tipsHeader}>
              <View style={styles.tipsIcon}>
                <AppIcon name="ai" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.tipsTitle}>AI-подсказки дня</Text>
                <Text style={styles.tipsSubtitle}>События и советы по твоим финансам</Text>
              </View>
            </View>

            {tips.map((tip) => (
              <TouchableOpacity
                key={tip.id}
                style={styles.tipItem}
                activeOpacity={0.86}
                onPress={() =>
                  tip.icon === 'sync'
                    ? navigation.navigate('RecurringPayments')
                    : navigation.navigate('Stats')
                }
              >
                <View style={styles.tipIconBox}>
                  <AppIcon name={tip.icon} size={18} color={colors.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                  <Text style={styles.tipText}>{tip.text}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={styles.metricIconBoxGreen}>
              <AppIcon name="wallet" size={20} color={colors.mint} />
            </View>
            <Text style={styles.metricLabel}>Доходы</Text>
            <Text style={styles.incomeText}>{formatKzt(monthIncome)}</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconBoxRed}>
              <AppIcon name="budget" size={20} color={colors.coral} />
            </View>
            <Text style={styles.metricLabel}>Расходы</Text>
            <Text style={styles.expenseText}>{formatKzt(monthExpense)}</Text>
          </View>
        </View>

        <View style={styles.forecastCard}>
          <View style={{ flex: 1 }}>
            <View style={styles.forecastTitleRow}>
              <Text style={styles.forecastLabel}>Умный прогноз месяца</Text>
              {forecastInfo && (
                <View
                  style={[
                    styles.forecastStatus,
                    forecastDiff > 0 ? styles.forecastStatusRisk : styles.forecastStatusOk,
                  ]}
                >
                  <Text
                    style={[
                      styles.forecastStatusText,
                      forecastDiff > 0
                        ? styles.forecastStatusTextRisk
                        : styles.forecastStatusTextOk,
                    ]}
                  >
                    {forecastDiff > 0 ? 'Риск' : 'Норма'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.forecastValue}>{formatKzt(forecastExpense)}</Text>

            {forecastInfo ? (
              <>
                <Text style={styles.forecastText}>
                  Диапазон: {formatKzt(forecastInfo.optimisticForecast)} — {formatKzt(forecastInfo.riskForecast)}
                </Text>

                <View style={styles.forecastDetails}>
                  <View style={styles.forecastDetailItem}>
                    <Text style={styles.forecastDetailLabel}>Средний день</Text>
                    <Text style={styles.forecastDetailValue}>
                      {formatKzt(forecastInfo.dailyAverage)}
                    </Text>
                  </View>

                  <View style={styles.forecastDetailItem}>
                    <Text style={styles.forecastDetailLabel}>Подписки впереди</Text>
                    <Text style={styles.forecastDetailValue}>
                      {formatKzt(forecastInfo.upcomingSubscriptions)}
                    </Text>
                  </View>

                  <View style={styles.forecastDetailItem}>
                    <Text style={styles.forecastDetailLabel}>Разовые крупные</Text>
                    <Text style={styles.forecastDetailValue}>
                      {formatKzt(forecastInfo.anomalySpent)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.forecastMethodText}>{forecastInfo.methodText}</Text>
              </>
            ) : (
              <Text style={styles.forecastText}>
                Основная категория: {mainCategory}
                {mainCategoryAmount > 0 ? ` · ${formatKzt(mainCategoryAmount)}` : ''}
              </Text>
            )}
          </View>

          <View style={styles.forecastIconBox}>
            <AppIcon name="chart" size={25} color={colors.primary} />
          </View>
        </View>

        <View style={styles.inputCard}>
          <View style={styles.inputHeader}>
            <View>
              <Text style={styles.inputTitle}>Голосовая команда</Text>
              <Text style={styles.inputSubtitle}>
                Операции, подписки, лимиты, цели, счета и навигация
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.voiceButton,
                recorderState.isRecording && styles.voiceButtonRecording,
              ]}
              onPress={handleVoicePress}
              disabled={processingAi}
            >
              {processingAi ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <AppIcon name="mic" size={23} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.examplesBox}>
            <Text style={styles.exampleText}>Можно сказать:</Text>
            <Text style={styles.exampleItem}>“Добавь подписку Netflix 3990”</Text>
            <Text style={styles.exampleItem}>“Поставь лимит на продукты 50000”</Text>
            <Text style={styles.exampleItem}>“Создай цель айфон 700000”</Text>
            <Text style={styles.exampleItem}>“Открой подписки”</Text>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Например: добавь подписку Netflix 3990"
              placeholderTextColor={colors.inkMuted}
              value={aiText}
              onChangeText={setAiText}
              multiline
              maxLength={220}
              editable={!processingAi && !recorderState.isRecording}
            />

            <TouchableOpacity
              style={[
                styles.sendButton,
                aiText.trim() ? styles.sendButtonActive : styles.sendButtonDisabled,
              ]}
              onPress={() => processAI(aiText)}
              disabled={processingAi || recorderState.isRecording || !aiText.trim()}
            >
              {processingAi ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <AppIcon name="send" size={22} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.manualButton}
            onPress={() => navigation.navigate('ManualInput')}
          >
            <Text style={styles.manualButtonText}>Открыть ручной ввод</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.smallActionsRow}>
          <TouchableOpacity style={styles.smallAction} onPress={() => navigation.navigate('AiChat')}>
            <AppIcon name="ai" size={18} color={colors.primary} />
            <Text style={styles.smallActionText}>AI</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallAction} onPress={() => navigation.navigate('MonthlyReport')}>
            <AppIcon name="report" size={18} color={colors.primary} />
            <Text style={styles.smallActionText}>Отчет</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallAction} onPress={() => navigation.navigate('RecurringPayments')}>
            <AppIcon name="sync" size={18} color={colors.primary} />
            <Text style={styles.smallActionText}>Подписки</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallAction} onPress={() => navigation.navigate('Services')}>
            <AppIcon name="category" size={18} color={colors.primary} />
            <Text style={styles.smallActionText}>Сервисы</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 26 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brand: { fontSize: 12, color: colors.primary, fontWeight: '900', letterSpacing: 2 },
  title: { ...typography.title, marginTop: 2 },
  historyButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },

  balanceCard: {
    backgroundColor: colors.dark,
    borderRadius: radius.xxl,
    padding: 22,
    marginBottom: 14,
    ...shadow.elevated,
  },
  cardTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '800' },
  scoreBadge: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  scoreText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    marginTop: 18,
    marginBottom: 20,
    letterSpacing: -1,
  },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  footerLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800' },
  footerValue: { color: '#F8FAFC', fontSize: 14, fontWeight: '900', marginTop: 4 },

  tipsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    ...shadow.soft,
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tipsIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tipsTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  tipsSubtitle: { color: colors.inkMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 8,
  },
  tipIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tipTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  tipText: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },

  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  metricIconBoxGreen: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricIconBoxRed: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: '800', marginBottom: 5 },
  incomeText: { color: colors.mint, fontSize: 18, fontWeight: '900' },
  expenseText: { color: colors.coral, fontSize: 18, fontWeight: '900' },

  forecastCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    ...shadow.soft,
  },
  forecastTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  forecastLabel: { color: colors.inkMuted, fontSize: 13, fontWeight: '800', marginRight: 8 },
  forecastStatus: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  forecastStatusOk: { backgroundColor: colors.mintSoft },
  forecastStatusRisk: { backgroundColor: colors.coralSoft },
  forecastStatusText: { fontSize: 10, fontWeight: '900' },
  forecastStatusTextOk: { color: colors.mint },
  forecastStatusTextRisk: { color: colors.coral },
  forecastValue: { color: colors.ink, fontSize: 27, fontWeight: '900', marginTop: 5 },
  forecastText: { color: colors.inkSoft, fontSize: 13, fontWeight: '700', marginTop: 4 },
  forecastDetails: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 12,
    marginTop: 12,
  },
  forecastDetailItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  forecastDetailLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: '800', flex: 1 },
  forecastDetailValue: { color: colors.ink, fontSize: 12, fontWeight: '900', marginLeft: 8 },
  forecastMethodText: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 9 },
  forecastIconBox: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    ...shadow.soft,
  },
  inputHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  inputTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  inputSubtitle: { color: colors.inkMuted, fontSize: 12, fontWeight: '700', marginTop: 3, maxWidth: 230 },
  voiceButton: {
    marginLeft: 'auto',
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButtonRecording: { backgroundColor: colors.coral },
  examplesBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  exampleText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900', marginBottom: 5 },
  exampleItem: { color: colors.primaryDark, fontSize: 12, fontWeight: '700', marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    minHeight: 50,
    maxHeight: 105,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sendButtonActive: { backgroundColor: colors.dark },
  sendButtonDisabled: { backgroundColor: colors.inkMuted },
  manualButton: {
    marginTop: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  manualButtonText: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  smallActionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  smallAction: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 3,
    ...shadow.soft,
  },
  smallActionText: { color: colors.ink, fontSize: 11, fontWeight: '900', marginTop: 6 },
});
